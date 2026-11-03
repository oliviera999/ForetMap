'use strict';

/**
 * `foretmap_sql_select` — SELECT libre **borné**, désactivé par défaut.
 *
 * Quatre verrous, tous nécessaires :
 * 1. drapeau `MCP_SQL_ENABLED=true` ;
 * 2. permission `mcp.sql` (admin) et portée `foretmap.read` ;
 * 3. compte MySQL dédié **`DB_MCP_USER` obligatoire**, dont les droits **réels** sont lus
 *    (`SHOW GRANTS`, `lib/mcp/readOnlyGrants.js`) ;
 * 4. analyse **syntaxique** de la requête (`lib/mcp/sqlAst.js`).
 *
 * En bypass RGPD actif : la liste blanche devient un refus des tables/colonnes secrètes ;
 * `evaluateGrants` est assoupli ; la sortie est nettoyée en « secrets seulement » ; audit
 * des tables lues.
 */

const { z } = require('zod');
const { withReadOnly, MAX_ROWS, getReadPool, isReadOnlyPoolConfigured } = require('../readDb');
const { checkReadOnlyGrants, lastGrantsCheck } = require('../readOnlyGrants');
const logger = require('../../logger');
const { McpToolError } = require('../registry');
const { analyzeSelect, assertPlainSqlText } = require('../sqlAst');
const { SCOPES, isMcpPrivacyBypassActive } = require('../config');
const { execute } = require('../../../database');
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

/** Disponibilité synchrone (liste d'outils) : compte configuré ET droits vérifiés conformes. */
function sqlToolAvailable() {
  if (!isReadOnlyPoolConfigured()) return false;
  return lastGrantsCheck()?.ok === true;
}

async function sqlSelect(args, ctx = {}) {
  if (!isReadOnlyPoolConfigured()) {
    throw new McpToolError(
      'Outil indisponible : compte MySQL en lecture seule DB_MCP_USER non configuré',
      'MCP_READONLY_POOL_REQUIRED',
    );
  }
  const privacyBypass = !!ctx.privacyBypass;
  const grants = await refreshGrants({ force: true, privacyBypass });
  if (!grants.ok) {
    throw new McpToolError(
      `Outil indisponible : droits du compte DB_MCP_USER trop larges (${grants.reason})`,
      'MCP_READONLY_GRANTS_REFUSED',
    );
  }
  const text = validateSelectSql(args.sql, { privacyBypass });
  const analyzed = analyzeSelect(text, { privacyBypass });
  const limit = Math.min(MAX_ROWS, Math.max(1, args.limit ?? 100));
  const result = await withReadOnly(
    async (db) => {
      const rows = await db.raw(`SELECT * FROM (${text}) AS mcp_q LIMIT ${limit}`, [], {
        astValidated: true,
      });
      return { rows, count: rows.length, limit };
    },
    { requireReadOnlyPool: true },
  );
  if (privacyBypass && ctx.user) {
    await execute(
      `INSERT INTO audit_log
        (action, target_type, target_id, details, actor_user_type, actor_user_id, result, created_at, occurred_at, payload_json)
       VALUES ('mcp.privacy_bypass.read', 'mcp_sql_select', NULL, ?, ?, ?, 'success', ?, UTC_TIMESTAMP(), ?)`,
      [
        'foretmap_sql_select',
        ctx.user.userType || null,
        String(ctx.user.userId),
        nowDbTimestamp(),
        JSON.stringify({
          via: 'mcp',
          tool: 'foretmap_sql_select',
          tables: analyzed.tables,
          count: result.count,
        }),
      ],
    );
    return { ...result, privacy_bypass: true, tables: analyzed.tables };
  }
  return result;
}

function buildSqlSelectTools() {
  return [
    {
      name: 'foretmap_sql_select',
      title: 'Requête SELECT bornée (admin)',
      description:
        'Requête SQL en LECTURE sur les tables de contenu pédagogique uniquement (liste blanche), pour les cas que les autres outils ne couvrent pas. Une seule instruction SELECT ; sous-requêtes et CTE admises si elles ne lisent que des tables de contenu ; fonctions courantes seulement ; LIMIT forcé (≤ 500) ; tables personnelles, information_schema et variables refusés. En bypass RGPD : tables hors secrets admises. Réservé aux administrateurs ; désactivé par défaut.',
      inputSchema: z.strictObject({
        sql: z.string().min(6).max(4000).describe('Une requête SELECT'),
        limit: z.number().int().min(1).max(500).optional().describe('Lignes max (défaut 100)'),
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

module.exports = { buildSqlSelectTools, refreshGrants, sqlToolAvailable, validateSelectSql };
