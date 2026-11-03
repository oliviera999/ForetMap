'use strict';

/**
 * `foretmap_sql_select` — SELECT libre **borné**, désactivé par défaut.
 *
 * Quatre verrous, tous nécessaires :
 * 1. drapeau `MCP_SQL_ENABLED=true` ;
 * 2. permission `mcp.sql` (admin) et portée `foretmap.read` ;
 * 3. compte MySQL dédié **`DB_MCP_USER` obligatoire**, dont les droits **réels** sont lus
 *    (`SHOW GRANTS`, `lib/mcp/readOnlyGrants.js`) : `SELECT` sur les seules tables de contenu,
 *    rien d'autre — sinon l'outil n'est ni proposé ni exécutable. C'est la barrière qui tient
 *    même si l'analyse syntaxique se trompe ;
 * 4. analyse **syntaxique** de la requête (`lib/mcp/sqlAst.js`, parseur `node-sql-parser`) :
 *    une seule instruction SELECT, toutes les tables (sous-requêtes, `FROM (t)`, CTE, UNION…)
 *    dans la liste blanche, ni base qualifiée (`information_schema`, `mysql`…), ni `INTO`, ni
 *    verrou, ni variable, ni fonction hors liste blanche ; tout ce qui n'est pas analysable est
 *    refusé (fail-closed).
 *
 * Puis exécution enveloppée `SELECT * FROM (…) AS mcp_q LIMIT n` (≤ 500), en transaction
 * `READ ONLY` avec délai maximal, et nettoyage des sorties (`scrubValue`).
 *
 * Avant la relecture de sécurité de la PR #616, l'analyse se faisait par expressions
 * régulières, et `SELECT * FROM (users)` passait la liste blanche (constat B1). La
 * contre-vérification a montré qu'un commentaire exécutable MariaDB (`/*! … *\/`) échappait
 * aussi à l'analyse syntaxique : le texte brut est désormais refusé dès qu'il contient
 * `/*`, `*\/`, `#`, `--`, `;` ou un caractère de contrôle (`assertPlainSqlText`), et les
 * droits réels du compte sont vérifiés (verrou 3).
 *
 * `CAST`, `HEX`, `CONCAT` restent admis : ils ne lisent rien de plus que les colonnes déjà
 * lisibles ; la borne de ce qui est lisible est tenue par les droits MySQL vérifiés.
 */

const { z } = require('zod');
const { withReadOnly, MAX_ROWS, getReadPool, isReadOnlyPoolConfigured } = require('../readDb');
const { checkReadOnlyGrants, lastGrantsCheck } = require('../readOnlyGrants');
const logger = require('../../logger');
const { McpToolError } = require('../registry');
const { analyzeSelect, assertPlainSqlText } = require('../sqlAst');
const { SCOPES } = require('../config');

/**
 * Valide une requête et renvoie le texte nettoyé, ou lève. Exportée pour les tests de rejet.
 * @returns {string}
 */
function validateSelectSql(sql) {
  // Pas de retrait d'un « ; » final : tout « ; » est refusé en amont (contre-vérification B1).
  // Contrôle du texte brut AVANT `trim()` : `trim` retire aussi U+2028, U+FEFF…
  assertPlainSqlText(String(sql ?? ''));
  const text = String(sql || '').trim();
  if (!text) throw new McpToolError('Requête vide');
  if (text.length > 4000) throw new McpToolError('Requête trop longue (4000 caractères max)');
  analyzeSelect(text);
  return text;
}

function refreshGrants(opts = {}) {
  return checkReadOnlyGrants(() => getReadPool({ requireDedicated: true }), {
    ...opts,
    log: (entry) => logger.warn(entry, 'Outil SQL du connecteur MCP indisponible'),
  });
}

/** Disponibilité synchrone (liste d'outils) : compte configuré ET droits vérifiés conformes. */
function sqlToolAvailable() {
  if (!isReadOnlyPoolConfigured()) return false;
  return lastGrantsCheck()?.ok === true;
}

async function sqlSelect(args) {
  if (!isReadOnlyPoolConfigured()) {
    throw new McpToolError(
      'Outil indisponible : compte MySQL en lecture seule DB_MCP_USER non configuré',
      'MCP_READONLY_POOL_REQUIRED',
    );
  }
  // Droits réels du compte (SHOW GRANTS, y compris PUBLIC) : SELECT sur les seules tables de
  // contenu, rien d'autre — un compte élargi entre-temps coupe l'outil.
  // Contrôle forcé à chaque appel (outil rare) : aucun cache entre un élargissement des
  // droits et l'appel suivant.
  const grants = await refreshGrants({ force: true });
  if (!grants.ok) {
    throw new McpToolError(
      `Outil indisponible : droits du compte DB_MCP_USER trop larges (${grants.reason})`,
      'MCP_READONLY_GRANTS_REFUSED',
    );
  }
  const text = validateSelectSql(args.sql);
  const limit = Math.min(MAX_ROWS, Math.max(1, args.limit ?? 100));
  return withReadOnly(
    async (db) => {
      // Enveloppe : le LIMIT extérieur borne quoi que fasse la requête intérieure. Le texte a
      // été validé par l'analyse syntaxique, et le compte DB_MCP_USER ne lit que les tables
      // de contenu.
      const rows = await db.raw(`SELECT * FROM (${text}) AS mcp_q LIMIT ${limit}`, [], {
        astValidated: true,
      });
      return { rows, count: rows.length, limit };
    },
    { requireReadOnlyPool: true },
  );
}

function buildSqlSelectTools() {
  return [
    {
      name: 'foretmap_sql_select',
      title: 'Requête SELECT bornée (admin)',
      description:
        'Requête SQL en LECTURE sur les tables de contenu pédagogique uniquement (liste blanche), pour les cas que les autres outils ne couvrent pas. Une seule instruction SELECT ; sous-requêtes et CTE admises si elles ne lisent que des tables de contenu ; fonctions courantes seulement ; LIMIT forcé (≤ 500) ; tables personnelles, information_schema et variables refusés. Réservé aux administrateurs ; désactivé par défaut.',
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
      handler: sqlSelect,
    },
  ];
}

module.exports = { buildSqlSelectTools, refreshGrants, sqlToolAvailable, validateSelectSql };
