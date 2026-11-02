'use strict';

/**
 * `foretmap_sql_select` — SELECT libre **borné**, désactivé par défaut.
 *
 * Triple verrou : drapeau `MCP_SQL_ENABLED=true`, permission `mcp.sql` (admin) et portée
 * `foretmap.read`. Puis analyse stricte du texte :
 * - une seule instruction, qui commence par `SELECT` ou `WITH` ; aucun `;` ;
 * - aucun mot-clé d'écriture ou de verrouillage (`INTO`, `FOR UPDATE`, `LOCK IN SHARE MODE`,
 *   `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `CREATE`, `ALTER`, `DROP`, `GRANT`, `SET`,
 *   `CALL`, `HANDLER`, `LOAD`…) ;
 * - aucune fonction dangereuse (`LOAD_FILE`, `SLEEP`, `BENCHMARK`, `GET_LOCK`, `SYS_EXEC`…),
 *   aucune variable (`@`), aucun commentaire (`--`, `#`, `/*`) qui masquerait du texte ;
 * - tables : liste blanche de contenu seulement (`assertSqlReadable`) ; `information_schema`
 *   limité à `tables` / `columns` et filtré ensuite sur les tables blanches ;
 * - `LIMIT` forcé ≤ 500 (la requête est enveloppée : `SELECT * FROM (…) q LIMIT n`) ;
 * - exécution en transaction READ ONLY avec délai maximal par requête.
 */

const { z } = require('zod');
const { withReadOnly, MAX_ROWS } = require('../readDb');
const { McpToolError } = require('../registry');
const { CONTENT_TABLES, stripLiterals } = require('../sqlGuard');
const { SCOPES } = require('../config');

const FORBIDDEN_KEYWORDS_RE =
  /\b(?:INTO|INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE|SET|CALL|DO|HANDLER|LOAD|LOCK|UNLOCK|FLUSH|KILL|SHUTDOWN|PREPARE|EXECUTE|DEALLOCATE|OUTFILE|DUMPFILE|PROCEDURE|ANALYZE|OPTIMIZE|SHOW|DESCRIBE|EXPLAIN)\b/i;
const FOR_UPDATE_RE = /\bFOR\s+(?:UPDATE|SHARE)\b|\bLOCK\s+IN\s+SHARE\s+MODE\b/i;
const DANGEROUS_FUNCTIONS_RE =
  /\b(?:LOAD_FILE|SLEEP|BENCHMARK|GET_LOCK|RELEASE_LOCK|RELEASE_ALL_LOCKS|IS_FREE_LOCK|IS_USED_LOCK|MASTER_POS_WAIT|SYS_EXEC|SYS_EVAL|USER|CURRENT_USER|SESSION_USER|SYSTEM_USER|VERSION|CONNECTION_ID|LAST_INSERT_ID|ROW_COUNT|FOUND_ROWS|UUID_SHORT|NAME_CONST|EXTRACTVALUE|UPDATEXML|JSON_TABLE|COLUMN_CREATE|SEQUENCE)\s*\(/i;

/**
 * Valide une requête et renvoie le texte nettoyé (sans espace final), ou lève.
 * Exportée pour les tests de rejet.
 */
function validateSelectSql(sql) {
  const text = String(sql || '').trim();
  if (!text) throw new McpToolError('Requête vide');
  if (text.length > 4000) throw new McpToolError('Requête trop longue (4000 caractères max)');
  const structural = stripLiterals(text);
  if (structural.includes(';')) throw new McpToolError('Une seule instruction, sans « ; »');
  if (/--|#|\/\*/.test(structural)) throw new McpToolError('Commentaires SQL refusés');
  if (!/^(?:SELECT|WITH)\b/i.test(structural)) throw new McpToolError('Seul SELECT est admis');
  if (/@/.test(structural)) throw new McpToolError('Variables SQL refusées');
  if (FOR_UPDATE_RE.test(structural)) throw new McpToolError('Verrouillage de lignes refusé');
  if (FORBIDDEN_KEYWORDS_RE.test(structural)) {
    throw new McpToolError(`Mot-clé refusé : ${FORBIDDEN_KEYWORDS_RE.exec(structural)[0]}`);
  }
  if (DANGEROUS_FUNCTIONS_RE.test(structural)) {
    throw new McpToolError(`Fonction refusée : ${DANGEROUS_FUNCTIONS_RE.exec(structural)[0]}`);
  }
  if (/\bUNION\b/i.test(structural) && /information_schema/i.test(structural)) {
    throw new McpToolError('UNION avec information_schema refusé');
  }
  return text;
}

async function sqlSelect(args) {
  const text = validateSelectSql(args.sql);
  const limit = Math.min(MAX_ROWS, Math.max(1, args.limit ?? 100));
  const usesInfoSchema = /information_schema/i.test(stripLiterals(text));
  if (usesInfoSchema && !/\bTABLE_SCHEMA\s*=\s*DATABASE\(\)/i.test(stripLiterals(text))) {
    // Un autre schéma hébergé sur le même serveur MySQL ne doit jamais apparaître.
    throw new McpToolError('information_schema : filtre `TABLE_SCHEMA = DATABASE()` obligatoire');
  }
  return withReadOnly(async (db) => {
    // Enveloppe : le LIMIT extérieur borne quoi que fasse la requête intérieure.
    let rows = await db.raw(`SELECT * FROM (${text}) AS mcp_q LIMIT ${limit}`, [], {
      allowInformationSchemaTables: true,
    });
    if (usesInfoSchema) {
      // Métadonnées : seules les lignes décrivant une table blanche sont rendues ; une
      // projection sans TABLE_NAME ne renvoie rien.
      rows = rows.filter((r) => {
        const name = String(r.TABLE_NAME ?? r.table_name ?? '').toLowerCase();
        return name && CONTENT_TABLES.has(name);
      });
    }
    return { rows, count: rows.length, limit };
  });
}

function buildSqlSelectTools() {
  return [
    {
      name: 'foretmap_sql_select',
      title: 'Requête SELECT bornée (admin)',
      description:
        'Requête SQL en LECTURE sur les tables de contenu pédagogique uniquement (liste blanche), pour les cas que les autres outils ne couvrent pas. Une seule instruction SELECT, sans « ; », sans commentaire ; LIMIT forcé (≤ 500) ; tables personnelles refusées. information_schema.tables/columns admis, filtrés sur les tables de contenu. Réservé aux administrateurs ; désactivé par défaut.',
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
      requires: { scope: SCOPES.READ, permission: ['mcp.use', 'mcp.sql'], flag: 'sql' },
      handler: sqlSelect,
    },
  ];
}

module.exports = { buildSqlSelectTools, validateSelectSql };
