'use strict';

/**
 * `foretmap_sql_select` — SELECT libre **borné** (réglage `mcp.sql_select_enabled`, ouvert par
 * défaut ; permission `mcp.sql`, admin).
 *
 * Deux pools (réglage `mcp.sql_select_pool`) :
 * - compte MySQL dédié `DB_MCP_USER` s'il est configuré : ses droits **réels** sont vérifiés
 *   (`SHOW GRANTS`, `lib/mcp/readOnlyGrants.js`) ;
 * - sinon (`auto`, cas de l'hébergement mutualisé cPanel, qui ne donne des droits que par
 *   base entière) : **pool principal** en `START TRANSACTION READ ONLY` — toute écriture échoue
 *   côté serveur SQL (erreur 1792) — avec délai par instruction. Faute de droits par colonne,
 *   `SELECT *` / `t.*` est refusé sur toute table qui porte une colonne secrète, et la sortie
 *   est de toute façon nettoyée des colonnes secrètes.
 *
 * Toujours : analyse **syntaxique** de la requête (`lib/mcp/sqlAst.js`, une seule instruction
 * SELECT, fonctions en liste blanche), `LIMIT` plafonné par `mcp.max_rows`, pagination `offset`.
 * En bypass RGPD : toutes les tables hors secrets ; lecture nominative journalisée.
 */

const { z } = require('zod');
const { withReadOnly, MAX_ROWS, getReadPool, isReadOnlyPoolConfigured } = require('../readDb');
const { checkReadOnlyGrants, lastGrantsCheck } = require('../readOnlyGrants');
const logger = require('../../logger');
const { McpToolError } = require('../registry');
const { analyzeSelect, assertPlainSqlText } = require('../sqlAst');
const { SCOPES, getMcpConfig, isMcpPrivacyBypassActive } = require('../config');
const { isSecretColumn } = require('../secretGuard');
const { execute, queryAll } = require('../../../database');
const { nowDbTimestamp } = require('../../shared/isoTimestamp');

/**
 * Valide une requête et renvoie le texte nettoyé, ou lève. Exportée pour les tests de rejet.
 * @param {string} sql
 * @param {{ privacyBypass?: boolean }} [opts]
 * @returns {string}
 */
function validateSelectSql(sql, opts = {}) {
  assertPlainSqlText(String(sql ?? ''));
  const text = String(sql || '').trim();
  if (!text) throw new McpToolError('Requête vide');
  if (text.length > 4000) throw new McpToolError('Requête trop longue (4000 caractères max)');
  analyzeSelect(text, { privacyBypass: !!opts.privacyBypass });
  return text;
}

function refreshGrants(opts = {}) {
  const privacyBypass =
    opts.privacyBypass !== undefined ? !!opts.privacyBypass : isMcpPrivacyBypassActive();
  return checkReadOnlyGrants(() => getReadPool({ requireDedicated: true }), {
    ...opts,
    privacyBypass,
    log: (entry) => logger.warn(entry, 'Outil SQL du connecteur MCP indisponible'),
  });
}

/** Le compte dédié est-il exigé (réglage `mcp.sql_select_pool=dedicated_only`) ? */
function dedicatedRequired(cfg = getMcpConfig()) {
  return cfg.sqlSelectPool === 'dedicated_only';
}

/** Disponibilité synchrone (liste d'outils). */
function sqlToolAvailable() {
  if (isReadOnlyPoolConfigured()) return lastGrantsCheck()?.ok === true;
  // Sans compte dédié : pool principal en lecture seule, sauf si le réglage l'interdit.
  return !dedicatedRequired();
}

let secretColumnTables = null; // { at, map: Map<table, string[]> }

/** Tables (base courante) qui portent au moins une colonne secrète, cache 10 min. */
async function tablesWithSecretColumns() {
  if (secretColumnTables && Date.now() - secretColumnTables.at < 10 * 60 * 1000) {
    return secretColumnTables.map;
  }
  const rows = await queryAll(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const map = new Map();
  for (const r of rows) {
    if (!isSecretColumn(String(r.c))) continue;
    const t = String(r.t).toLowerCase();
    if (!map.has(t)) map.set(t, []);
    map.get(t).push(String(r.c));
  }
  secretColumnTables = { at: Date.now(), map };
  return map;
}

async function sqlSelect(args, ctx = {}) {
  const cfg = ctx.cfg || getMcpConfig();
  const dedicated = isReadOnlyPoolConfigured();
  if (!dedicated && dedicatedRequired(cfg)) {
    throw new McpToolError(
      'Outil indisponible : compte MySQL en lecture seule DB_MCP_USER exigé (réglage mcp.sql_select_pool)',
      'MCP_READONLY_POOL_REQUIRED',
    );
  }
  const privacyBypass = !!ctx.privacyBypass;
  if (dedicated) {
    const grants = await refreshGrants({ force: true, privacyBypass });
    if (!grants.ok) {
      throw new McpToolError(
        `Outil indisponible : droits du compte DB_MCP_USER trop larges (${grants.reason})`,
        'MCP_READONLY_GRANTS_REFUSED',
      );
    }
  }
  const text = validateSelectSql(args.sql, { privacyBypass });
  const analyzed = analyzeSelect(text, { privacyBypass });
  if (!dedicated && analyzed.hasStar) {
    const secretMap = await tablesWithSecretColumns();
    const hit = analyzed.tables.filter((t) => secretMap.has(t));
    if (hit.length > 0) {
      throw new McpToolError(
        `SELECT * refusé sur ${hit.join(', ')} (colonnes secrètes) : nommez les colonnes voulues`,
        'MCP_SQL_STAR_SECRET',
      );
    }
  }
  const maxRows = Math.max(1, cfg.maxRows || MAX_ROWS);
  const limit = Math.min(maxRows, Math.max(1, args.limit ?? 100));
  const offset = Math.max(0, Math.min(10_000_000, args.offset ?? 0));
  let result;
  try {
    result = await withReadOnly(
      async (db) => {
        const rows = await db.raw(
          `SELECT * FROM (${text}) AS mcp_q LIMIT ${limit} OFFSET ${offset}`,
          [],
          { astValidated: true },
        );
        const out = {
          rows,
          count: rows.length,
          limit,
          offset,
          pool: dedicated ? 'dedie' : 'principal',
        };
        if (rows.length === limit) out.next_offset = offset + limit;
        return out;
      },
      { requireReadOnlyPool: dedicated },
    );
  } catch (err) {
    throw readableSqlError(err);
  }
  if (privacyBypass && ctx.user) {
    const details = {
      via: 'mcp',
      tool: 'foretmap_sql_select',
      tables: analyzed.tables,
      count: result.count,
    };
    if (cfg.privacyReadsAuditDetails === 'full') details.sql = text.slice(0, 4000);
    await execute(
      `INSERT INTO audit_log
        (action, target_type, target_id, details, actor_user_type, actor_user_id, result, created_at, occurred_at, payload_json)
       VALUES ('mcp.privacy_bypass.read', 'mcp_sql_select', NULL, ?, ?, ?, 'success', ?, UTC_TIMESTAMP(), ?)`,
      [
        'foretmap_sql_select',
        ctx.user.userType || null,
        String(ctx.user.userId),
        nowDbTimestamp(),
        JSON.stringify(details),
      ],
    );
    return { ...result, privacy_bypass: true, tables: analyzed.tables };
  }
  return result;
}

/**
 * Erreurs MySQL **de la requête elle-même** (colonne ou table inconnue, syntaxe, regroupement) :
 * renvoyées avec leur message, qui ne contient que ce que la requête a écrit. Avant, elles
 * sortaient en « Erreur interne de l'outil » sans dire quelle colonne manquait. Toute autre
 * erreur (connexion, droits, délai) reste générique.
 */
const QUERY_ERROR_CODES = new Set([
  'ER_BAD_FIELD_ERROR',
  'ER_NO_SUCH_TABLE',
  'ER_PARSE_ERROR',
  'ER_NON_UNIQ_ERROR',
  'ER_WRONG_FIELD_WITH_GROUP',
  'ER_INVALID_GROUP_FUNC_USE',
  'ER_MIX_OF_GROUP_FUNC_AND_FIELDS',
  'ER_WRONG_ARGUMENTS',
  'ER_SP_DOES_NOT_EXIST',
  'ER_DUP_FIELDNAME',
  'ER_OPERAND_COLUMNS',
  'ER_SUBQUERY_NO_1_ROW',
  'ER_TRUNCATED_WRONG_VALUE',
]);

function readableSqlError(err) {
  if (err && QUERY_ERROR_CODES.has(err.code) && typeof err.sqlMessage === 'string') {
    return new McpToolError(
      `Requête refusée par MySQL : ${err.sqlMessage.slice(0, 300)}`,
      err.code,
    );
  }
  return err;
}

function buildSqlSelectTools() {
  return [
    {
      name: 'foretmap_sql_select',
      title: 'Requête SELECT bornée (admin)',
      description:
        'Requête SQL en LECTURE (une seule instruction SELECT ; sous-requêtes, jointures et CTE admises ; fonctions courantes seulement ; variables, INTO, verrouillage et information_schema refusés). Sans bypass RGPD : tables de contenu pédagogique seulement ; en bypass : toutes les tables hors secrets (hachages, TOTP, jetons). Compte MySQL dédié s’il existe, sinon compte principal en transaction READ ONLY (SELECT * refusé sur une table à colonnes secrètes : nommer les colonnes). LIMIT plafonné (réglage mcp.max_rows), pagination offset / next_offset. Gros volumes : foretmap_export. Structure : foretmap_describe_schema.',
      inputSchema: z.strictObject({
        sql: z.string().min(6).max(4000).describe('Une requête SELECT (sans LIMIT)'),
        limit: z.number().int().min(1).max(5000).optional().describe('Lignes max (défaut 100)'),
        offset: z.number().int().min(0).max(10000000).optional().describe('Décalage'),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      requires: {
        scope: SCOPES.READ,
        permission: ['mcp.use', 'mcp.sql'],
        flag: 'sql',
        available: sqlToolAvailable,
      },
      scrub: (ctx) => (ctx.privacyBypass ? 'secrets' : 'full'),
      handler: sqlSelect,
    },
  ];
}

module.exports = {
  buildSqlSelectTools,
  readableSqlError,
  refreshGrants,
  sqlSelect,
  sqlToolAvailable,
  tablesWithSecretColumns,
  validateSelectSql,
};
