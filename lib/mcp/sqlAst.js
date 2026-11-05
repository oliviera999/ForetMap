'use strict';

/**
 * Analyse syntaxique (AST) des requêtes de `foretmap_sql_select` — remplace l'analyse par
 * expressions régulières, contournable (`SELECT * FROM (users)` passait la liste blanche :
 * relecture de sécurité de la PR #616, constat B1).
 *
 * Parseur : `node-sql-parser` (Apache-2.0, https://github.com/taozhi8833998/node-sql-parser),
 * grammaire MariaDB. Principe **fail-closed** :
 *
 * - le texte doit être analysable et donner **une seule** instruction `select` ;
 * - l'AST est parcouru **récursivement** (sous-requêtes, tables dérivées, `FROM (t)` parenthésé,
 *   jointures, CTE `WITH`, `UNION`, expressions de `SELECT` / `WHERE` / `HAVING` / `ORDER BY`) ;
 *   toutes les tables rencontrées sont collectées — y compris par la `tableList` que le
 *   parseur calcule lui-même, les deux devant concorder — et **une seule** table hors liste
 *   blanche suffit à refuser ;
 * - un nom de CTE n'est admis que s'il est défini dans la requête **et** ne masque pas le nom
 *   d'une table réelle ;
 * - tout qualificatif de base (`db.t`, `information_schema.t`, `mysql.t`,
 *   `performance_schema.t`, `sys.t`) est refusé ;
 * - refusés aussi : `INTO`, verrouillage (`FOR UPDATE` / `LOCK IN SHARE MODE`), variables
 *   (`@x`, `@@x`, affectation `:=`), fonctions hors **liste blanche** de fonctions pures
 *   (`LOAD_FILE`, `SLEEP`, `BENCHMARK`, `GET_LOCK`, `USER()`… ne sont donc jamais admis), et
 *   tout type de nœud que ce module ne connaît pas ;
 * - les colonnes nominatives (`email`, `*_by`, `*_user_id`…) restent refusées.
 *
 * Le texte d'origine n'est exécuté qu'après cette validation, enveloppé dans
 * `SELECT * FROM (…) AS mcp_q LIMIT n`, en transaction `READ ONLY`, et — exigence de
 * l'outil — par le compte MySQL `DB_MCP_USER`, qui ne doit avoir que `SELECT` sur les tables
 * de contenu (`scripts/mcp-print-grants.js`) : deux barrières indépendantes.
 */

const { Parser } = require('node-sql-parser/build/mariadb');
const {
  CONTENT_TABLES,
  DENIED_COLUMN_RE,
  McpDataAccessError,
  assertTableReadable,
} = require('./sqlGuard');
const { isSecretColumn, isSecretTable } = require('./secretGuard');

const PARSER_OPTIONS = Object.freeze({ database: 'MariaDB' });
const parser = new Parser();

/** Fonctions pures admises (tout le reste est refusé). Noms en majuscules. */
const ALLOWED_FUNCTIONS = Object.freeze(
  new Set([
    // agrégats
    'COUNT',
    'SUM',
    'AVG',
    'MIN',
    'MAX',
    'GROUP_CONCAT',
    // opérateur sur sous-requête (la sous-requête est analysée comme le reste)
    'EXISTS',
    // conditions
    'IFNULL',
    'NULLIF',
    'COALESCE',
    'IF',
    'GREATEST',
    'LEAST',
    // chaînes
    'LOWER',
    'UPPER',
    'LCASE',
    'UCASE',
    'LENGTH',
    'CHAR_LENGTH',
    'CHARACTER_LENGTH',
    'TRIM',
    'LTRIM',
    'RTRIM',
    'SUBSTRING',
    'SUBSTR',
    'LEFT',
    'RIGHT',
    'CONCAT',
    'CONCAT_WS',
    'REPLACE',
    'LOCATE',
    'INSTR',
    'POSITION',
    'LPAD',
    'RPAD',
    'REVERSE',
    'SOUNDEX',
    'FIELD',
    'FIND_IN_SET',
    'HEX',
    'ASCII',
    'ORD',
    'SPACE',
    'REPEAT',
    'FORMAT',
    'STRCMP',
    // nombres
    'ABS',
    'ROUND',
    'FLOOR',
    'CEIL',
    'CEILING',
    'MOD',
    'TRUNCATE',
    'SIGN',
    'SQRT',
    'POWER',
    'POW',
    // dates (sur les colonnes : `NOW()` / `CURDATE()` admis, sans effet de bord)
    'DATE',
    'YEAR',
    'MONTH',
    'DAY',
    'DAYOFWEEK',
    'DAYOFMONTH',
    'WEEK',
    'DATEDIFF',
    'DATE_FORMAT',
    'DATE_ADD',
    'DATE_SUB',
    'TIMESTAMPDIFF',
    'NOW',
    'CURDATE',
    'CURRENT_DATE',
    // JSON (lecture)
    'JSON_EXTRACT',
    'JSON_UNQUOTE',
    'JSON_LENGTH',
    'JSON_CONTAINS',
    'JSON_VALID',
  ]),
);

/** Types de nœuds d'expression connus et admis. */
const ALLOWED_NODE_TYPES = Object.freeze(
  new Set([
    'select',
    'column_ref',
    'star',
    'binary_expr',
    'unary_expr',
    'number',
    'bool',
    'null',
    'single_quote_string',
    'double_quote_string',
    'natural_string',
    'hex_string',
    'bit_string',
    'string',
    'expr_list',
    'function',
    'aggr_func',
    'case',
    'when',
    'else',
    'cast',
    'default',
    'backticks_quote_string',
    'interval',
    'datatype',
    'param',
    'origin',
    'ASC',
    'DESC',
    'full_hex_string',
    'regex_string',
  ]),
);

/** Nœuds explicitement refusés (message clair). */
const DENIED_NODE_TYPES = Object.freeze(
  new Map([
    ['var', 'Variables SQL refusées'],
    ['assign', 'Affectation de variable refusée'],
  ]),
);

function reject(message) {
  throw new McpDataAccessError(message, 'MCP_SQL_REJECTED');
}

function functionName(node) {
  const n = node?.name;
  if (typeof n === 'string') return n.toUpperCase();
  const parts = Array.isArray(n?.name) ? n.name : [];
  if (parts.length !== 1) return null; // `schema.fonction()` : refusé
  return String(parts[0]?.value || '').toUpperCase() || null;
}

/**
 * Valide une requête et renvoie les tables qu'elle lit.
 * @param {string} sql
 * @returns {{ tables: string[] }}
 */
/**
 * Contrôle du **texte brut**, avant toute analyse (contre-vérification de la PR #616, B1).
 *
 * MariaDB **exécute** le contenu des commentaires `/*! … *\/`, `/*!50000 … *\/` et
 * `/*M! … *\/`, que `node-sql-parser` ignore comme de simples commentaires : une
 * `UNION SELECT … FROM users` y passait la validation. On refuse donc, sur le texte normalisé
 * (Unicode NFKC, qui ramène `／` et `＊` pleine chasse à `/` et `*`), tout commentaire (`/*`,
 * `*\/`, `#`, `--`), tout `;`, et tout caractère de contrôle ou de format (catégories Unicode
 * Cc et Cf, hors espace, tabulation et fin de ligne) — y compris dans les chaînes littérales :
 * une requête légitime de lecture du contenu n'en a pas besoin.
 * @returns {string} texte normalisé
 */
function assertPlainSqlText(sql) {
  const raw = String(sql ?? '');
  const text = raw.normalize('NFKC');
  // Contrôle (Cc) hors tabulation / fin de ligne, format (Cf : U+200B, U+2060, U+FEFF…),
  // séparateurs de ligne et de paragraphe Unicode.
  if (/[\p{Cf}\p{Zl}\p{Zp}]|[^\P{Cc}\t\n\r]/u.test(text)) {
    reject('Caractère de contrôle ou de format refusé');
  }
  if (text.includes('/*') || text.includes('*/')) reject('Commentaires SQL refusés (/* … */)');
  if (text.includes('#')) reject('Commentaires SQL refusés (#)');
  if (text.includes('--')) reject('Commentaires SQL refusés (--)');
  if (text.includes(';')) reject('Une seule instruction, sans « ; »');
  if (text !== raw) reject('Caractères Unicode non canoniques refusés (normalisation NFKC)');
  return text;
}

/**
 * @param {string} sql
 * @param {{ privacyBypass?: boolean }} [opts]
 *   `privacyBypass` : refuse seulement les tables/colonnes secrètes (plus de liste blanche).
 */
function analyzeSelect(sql, opts = {}) {
  const privacyBypass = !!opts.privacyBypass;
  assertPlainSqlText(sql);
  let ast;
  let tableList;
  try {
    ast = parser.astify(sql, PARSER_OPTIONS);
    tableList = parser.tableList(sql, PARSER_OPTIONS);
  } catch {
    reject('Requête non analysable : seules des requêtes SELECT simples sont admises');
  }
  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1) reject('Une seule instruction SELECT est admise');
  const root = statements[0];
  if (!root || root.type !== 'select') reject('Seul SELECT est admis');

  const tables = new Set();
  const cteNames = new Set();
  // `SELECT *` / `t.*` : sur le pool principal (sans droits par colonne), l'appelant refuse
  // l'étoile pour toute table qui porte une colonne secrète.
  let hasStar = false;

  const visitSelect = (sel) => {
    if (!sel || sel.type !== 'select') reject('Sous-instruction non SELECT refusée');
    if (sel.into && (sel.into.type || sel.into.expr || sel.into.keyword)) reject('INTO refusé');
    if (sel.locking_read) reject('Verrouillage de lignes refusé');
    for (const cte of sel.with || []) {
      const name = String(cte?.name?.value ?? cte?.name ?? '').toLowerCase();
      if (!name) reject('CTE sans nom');
      if (CONTENT_TABLES.has(name)) reject(`Le nom de CTE « ${name} » masque une table`);
      cteNames.add(name);
      visitNode(cte.stmt?.ast ?? cte.stmt);
    }
    for (const item of sel.from || []) {
      if (item.table !== undefined && item.expr === undefined) {
        if (item.db) reject(`Référence qualifiée « ${item.db}.${item.table} » refusée`);
        const name = String(item.table).toLowerCase();
        tables.add(name);
      } else if (item.expr) {
        visitNode(item.expr.ast ?? item.expr);
      } else {
        reject('Clause FROM non reconnue');
      }
      if (item.on) visitNode(item.on);
      if (item.using) for (const u of item.using) visitNode(u);
    }
    for (const key of ['columns', 'where', 'groupby', 'having', 'orderby', 'limit', 'window']) {
      const v = sel[key];
      if (v == null) continue;
      if (key === 'columns' && v === '*') {
        hasStar = true;
        continue;
      }
      if (key === 'window') reject('WINDOW refusé');
      visitNode(v);
    }
    if (sel._next) visitSelect(sel._next);
  };

  const visitNode = (node) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visitNode);
      return;
    }
    if (node.ast && node.tableList) {
      visitSelect(node.ast);
      return;
    }
    if (node.type === 'select') {
      visitSelect(node);
      return;
    }
    if (node.type && DENIED_NODE_TYPES.has(node.type)) reject(DENIED_NODE_TYPES.get(node.type));
    if (node.type === 'function' || node.type === 'aggr_func') {
      const name = functionName(node);
      if (!name || !ALLOWED_FUNCTIONS.has(name)) reject(`Fonction refusée : ${name || '?'}`);
    }
    if (node.type === 'column_ref') {
      const col = typeof node.column === 'string' ? node.column : node.column?.expr?.value;
      if (col === '*') hasStar = true;
      if (col && col !== '*') {
        if (privacyBypass) {
          if (isSecretColumn(String(col))) reject(`Colonne secrète « ${col} » interdite`);
        } else if (DENIED_COLUMN_RE.test(String(col))) {
          reject(`Colonne « ${col} » interdite au connecteur`);
        }
      }
      if (node.db) reject('Colonne qualifiée par une base refusée');
    }
    if (node.type && typeof node.type === 'string' && !ALLOWED_NODE_TYPES.has(node.type)) {
      reject(`Construction SQL non admise (${node.type})`);
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'type' || v == null || typeof v !== 'object') continue;
      visitNode(v);
    }
  };

  visitSelect(root);

  for (const entry of tableList || []) {
    const [, db, table] = String(entry).split('::');
    if (db && db !== 'null') reject(`Référence qualifiée « ${db}.${table} » refusée`);
    tables.add(String(table).toLowerCase());
  }
  for (const t of tables) {
    if (cteNames.has(t)) continue;
    if (privacyBypass) {
      if (isSecretTable(t)) reject(`Table secrète « ${t} » interdite au connecteur`);
      continue;
    }
    try {
      assertTableReadable(t, 'content');
    } catch (err) {
      reject(err.message);
    }
    if (!CONTENT_TABLES.has(t)) reject(`Table « ${t} » hors de la liste blanche du connecteur`);
  }
  return {
    tables: [...tables].filter((t) => !cteNames.has(t)).sort(),
    privacyBypass,
    hasStar,
  };
}

module.exports = { ALLOWED_FUNCTIONS, analyzeSelect, assertPlainSqlText };
