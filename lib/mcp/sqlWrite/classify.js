'use strict';

/**
 * Classification d'une instruction SQL pour `foretmap_sql_execute`.
 *
 * Fail-closed : texte brut sans commentaire / « ; » (`assertPlainSqlText`), puis
 * reconnaissance DML/DDL (AST `node-sql-parser`) ou DCL (mot-clé). Tout le reste est refusé.
 */

const { Parser } = require('node-sql-parser/build/mariadb');
const { assertPlainSqlText } = require('../sqlAst');
const { CONTENT_TABLES } = require('../sqlGuard');
const { isSecretColumn, isSecretTable, normalizeTableName } = require('../secretGuard');
const { McpToolError } = require('../registry');
const { getMcpConfig } = require('../config');

const PARSER_OPTIONS = Object.freeze({ database: 'MariaDB' });
const parser = new Parser();

/** Tables dont toute écriture / DDL est refusée (journaux, connecteur, schéma). */
const PROTECTED_TABLES = Object.freeze(
  new Set([
    'audit_log',
    'security_events',
    'elevation_audit',
    'mcp_confirmations',
    'mcp_oauth_clients',
    'mcp_oauth_auth_codes',
    'mcp_oauth_tokens',
    'mcp_content_plans',
    'mcp_memory',
    'mcp_health_reports',
    'schema_version',
  ]),
);

/** Tables d'autorisation : écriture admise seulement après confirmation par code. */
const AUTHZ_TABLES = Object.freeze(
  new Set([
    'users',
    'user_roles',
    'roles',
    'role_permissions',
    'permissions',
    'rbac_seeded_permissions',
  ]),
);

const DML_TYPES = new Set(['insert', 'replace', 'update', 'delete']);
const DDL_TYPES = new Set(['create', 'alter', 'drop', 'truncate', 'rename']);

const FORBIDDEN_HEAD_RE =
  /^\s*(?:LOAD\s+DATA|LOAD\s+XML|SELECT\b|SHUTDOWN\b|KILL\b|SET\s+PASSWORD\b|SET\s+GLOBAL\b|INSTALL\s+|UNINSTALL\s+|HANDLER\b|CALL\b|DO\b|SHOW\b|DESCRIBE\b|EXPLAIN\b|ANALYZE\b|USE\b|FLUSH\b|RESET\b|PURGE\b|BACKUP\b|RESTORE\b)/i;

const INTO_FILE_RE = /\bINTO\s+(?:OUTFILE|DUMPFILE)\b/i;
const LOAD_FILE_RE = /\bLOAD_FILE\s*\(/i;
const ALTER_USER_IDENTIFIED_RE = /\bALTER\s+USER\b[\s\S]*\bIDENTIFIED\b/i;

function reject(message, code = 'MCP_SQL_WRITE_REJECTED') {
  throw new McpToolError(message, code);
}

function collectTablesFromAst(node, out = new Set()) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectTablesFromAst(n, out));
    return out;
  }
  if (node.table && typeof node.table === 'string') {
    out.add(normalizeTableName(node.table));
  }
  if (node.table && typeof node.table === 'object' && node.table.table) {
    out.add(normalizeTableName(node.table.table));
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') collectTablesFromAst(v, out);
  }
  return out;
}

function collectColumnsFromAst(node, out = new Set()) {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectColumnsFromAst(n, out));
    return out;
  }
  if (node.type === 'column_ref') {
    const col = typeof node.column === 'string' ? node.column : node.column?.expr?.value;
    if (col && col !== '*') out.add(String(col));
  }
  // SET col = … dans un UPDATE (ou ON DUPLICATE KEY UPDATE).
  if (node.column && typeof node.column === 'string' && node.value !== undefined) {
    out.add(node.column);
  }
  // INSERT / REPLACE : `(password_hash, …)` est un tableau de chaînes, pas des column_ref.
  // Sans ce relevé, la colonne secrète n’était jamais vue et l’écriture passait.
  if (Array.isArray(node.columns)) {
    for (const col of node.columns) {
      if (typeof col !== 'string') continue;
      const name = col.replace(/`/g, '').trim();
      if (name && name !== '*') out.add(name);
    }
  }
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') collectColumnsFromAst(v, out);
  }
  return out;
}

function hasWhere(ast) {
  if (!ast) return false;
  if (ast.where) return true;
  if (Array.isArray(ast)) return ast.some(hasWhere);
  return false;
}

function columnIdentity(node) {
  if (!node || node.type !== 'column_ref') return null;
  const col = typeof node.column === 'string' ? node.column : node.column?.expr?.value;
  if (!col || col === '*') return null;
  const table = node.table ? String(node.table).toLowerCase() : '';
  return `${table}.${String(col).replace(/`/g, '').trim().toLowerCase()}`;
}

function literalOf(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'number') {
    const value = Number(node.value);
    return Number.isFinite(value) ? { kind: 'number', value } : null;
  }
  if (node.type === 'bool') {
    return {
      kind: 'bool',
      value: node.value === true || String(node.value).toLowerCase() === 'true',
    };
  }
  if (
    node.type === 'single_quote_string' ||
    node.type === 'double_quote_string' ||
    node.type === 'string'
  ) {
    return { kind: 'string', value: String(node.value) };
  }
  return null;
}

function exprName(node) {
  const n = node?.name;
  if (typeof n === 'string') return n.toUpperCase();
  const parts = Array.isArray(n?.name) ? n.name : [];
  if (parts.length !== 1) return '';
  return String(parts[0]?.value || '').toUpperCase();
}

function exprArgs(node) {
  const value = node?.args?.value;
  return Array.isArray(value) ? value : [];
}

/**
 * Vrai quand le prédicat est structurellement toujours vrai (toutes les lignes, ou toutes
 * les lignes non NULL pour `col = col` / `LIKE '%'`).
 *
 * `WHERE 1=1`, `WHERE TRUE`, `WHERE id = id`, `WHERE name LIKE '%'` ou
 * `WHERE id = 5 OR 1=1` passaient pour un filtre : sous le plafond de lignes, l'écriture
 * partait sans le code e-mail prévu pour un UPDATE/DELETE sans WHERE.
 * On ne couvre pas un prédicat arbitraire (`CASE`, sous-requête) : seulement les formes
 * dont la valeur ne dépend pas des données.
 */
function isVacuousPredicate(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'bool')
    return node.value === true || String(node.value).toLowerCase() === 'true';
  if (node.type === 'number') return Number(node.value) !== 0;
  if (node.type === 'unary_expr' && String(node.operator || '').toUpperCase() === 'NOT') {
    return isVacuousFalse(node.expr);
  }
  if (node.type === 'function' && exprName(node) === 'NOT') {
    const [arg] = exprArgs(node);
    return isVacuousFalse(arg);
  }
  if (node.type === 'function' && exprName(node) === 'IF') {
    const [cond, whenTrue, whenFalse] = exprArgs(node);
    if (isVacuousPredicate(cond)) return isVacuousPredicate(whenTrue);
    if (isVacuousFalse(cond)) return isVacuousPredicate(whenFalse);
    return false;
  }
  if (node.type !== 'binary_expr') return false;
  const op = String(node.operator || '').toUpperCase();
  if (op === 'AND') return isVacuousPredicate(node.left) && isVacuousPredicate(node.right);
  if (op === 'OR') return isVacuousPredicate(node.left) || isVacuousPredicate(node.right);
  if (op === 'LIKE') {
    const pattern = literalOf(node.right);
    return (
      !!pattern &&
      pattern.kind === 'string' &&
      pattern.value.length > 0 &&
      /^%+$/.test(pattern.value)
    );
  }
  const leftCol = columnIdentity(node.left);
  const rightCol = columnIdentity(node.right);
  if (leftCol && rightCol && leftCol === rightCol && (op === '=' || op === '<=' || op === '>=')) {
    return true;
  }
  const leftLit = literalOf(node.left);
  const rightLit = literalOf(node.right);
  if (!leftLit || !rightLit || leftLit.kind !== rightLit.kind) return false;
  if (op === '=') return leftLit.value === rightLit.value;
  if (op === '!=' || op === '<>') return leftLit.value !== rightLit.value;
  if (leftLit.kind === 'string' || leftLit.kind === 'bool') return false;
  if (op === '<') return leftLit.value < rightLit.value;
  if (op === '>') return leftLit.value > rightLit.value;
  if (op === '<=') return leftLit.value <= rightLit.value;
  if (op === '>=') return leftLit.value >= rightLit.value;
  return false;
}

/** Complément de `isVacuousPredicate` : prédicat structurellement toujours faux. */
function isVacuousFalse(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'bool')
    return node.value === false || String(node.value).toLowerCase() === 'false';
  if (node.type === 'number') return Number(node.value) === 0;
  if (node.type === 'unary_expr' && String(node.operator || '').toUpperCase() === 'NOT') {
    return isVacuousPredicate(node.expr);
  }
  if (node.type === 'function' && exprName(node) === 'NOT') {
    const [arg] = exprArgs(node);
    return isVacuousPredicate(arg);
  }
  if (node.type === 'function' && exprName(node) === 'IF') {
    const [cond, whenTrue, whenFalse] = exprArgs(node);
    if (isVacuousPredicate(cond)) return isVacuousFalse(whenTrue);
    if (isVacuousFalse(cond)) return isVacuousFalse(whenFalse);
    return false;
  }
  if (node.type !== 'binary_expr') return false;
  const op = String(node.operator || '').toUpperCase();
  if (op === 'AND') return isVacuousFalse(node.left) || isVacuousFalse(node.right);
  if (op === 'OR') return isVacuousFalse(node.left) && isVacuousFalse(node.right);
  if (op === 'NOT LIKE') {
    const pattern = literalOf(node.right);
    return (
      !!pattern &&
      pattern.kind === 'string' &&
      pattern.value.length > 0 &&
      /^%+$/.test(pattern.value)
    );
  }
  const leftCol = columnIdentity(node.left);
  const rightCol = columnIdentity(node.right);
  if (
    leftCol &&
    rightCol &&
    leftCol === rightCol &&
    (op === '<>' || op === '!=' || op === '<' || op === '>')
  ) {
    return true;
  }
  const leftLit = literalOf(node.left);
  const rightLit = literalOf(node.right);
  if (!leftLit || !rightLit || leftLit.kind !== rightLit.kind) return false;
  if (op === '=') return leftLit.value !== rightLit.value;
  if (op === '!=' || op === '<>') return leftLit.value === rightLit.value;
  if (leftLit.kind === 'string' || leftLit.kind === 'bool') return false;
  if (op === '<') return !(leftLit.value < rightLit.value);
  if (op === '>') return !(leftLit.value > rightLit.value);
  if (op === '<=') return !(leftLit.value <= rightLit.value);
  if (op === '>=') return !(leftLit.value >= rightLit.value);
  return false;
}

/**
 * Masque les littéraux après IDENTIFIED BY dans une instruction (audit / logs).
 */
function maskSqlForAudit(sql) {
  return String(sql).replace(
    /\bIDENTIFIED\s+BY\s+(?:PASSWORD\s+)?('[^']*'|"[^"]*"|[^\s;]+)/gi,
    'IDENTIFIED BY [masqué]',
  );
}

/**
 * Reconnaît un DCL par mot-clé (le parseur MariaDB ne couvre pas toujours GRANT/REVOKE).
 * @returns {'grant'|'revoke'|'create_user'|'drop_user'|null}
 */
function detectDcl(text) {
  const t = text.trim();
  if (/^GRANT\b/i.test(t)) return 'grant';
  if (/^REVOKE\b/i.test(t)) return 'revoke';
  if (/^CREATE\s+USER\b/i.test(t)) return 'create_user';
  if (/^DROP\s+USER\b/i.test(t)) return 'drop_user';
  return null;
}

/**
 * Classifie une instruction.
 * @returns {{
 *   kind: 'dml'|'ddl'|'dcl',
 *   subtype: string,
 *   tables: string[],
 *   columns: string[],
 *   hasWhere: boolean,
 *   requiresConfirm: boolean,
 *   confirmReasons: string[],
 *   sql: string,
 *   ast: object|null,
 * }}
 */
function classifySql(sql) {
  const text = assertPlainSqlText(String(sql ?? '')).trim();
  if (!text) reject('Instruction vide');
  if (text.length > 8000) reject('Instruction trop longue (8000 caractères max)');

  if (FORBIDDEN_HEAD_RE.test(text)) {
    reject('Instruction interdite (SELECT, LOAD DATA, SHUTDOWN, SET PASSWORD, SET GLOBAL…)');
  }
  if (INTO_FILE_RE.test(text)) reject('INTO OUTFILE / DUMPFILE interdit');
  if (LOAD_FILE_RE.test(text)) reject('LOAD_FILE() interdit');
  if (ALTER_USER_IDENTIFIED_RE.test(text)) reject('ALTER USER … IDENTIFIED interdit');

  const cfg = getMcpConfig();
  const dcl = detectDcl(text);
  if (dcl) {
    if (!cfg.sqlDdlEnabled) {
      reject('DDL/DCL désactivés (MCP_SQL_DDL_ENABLED=false)', 'MCP_SQL_DDL_DISABLED');
    }
    return {
      kind: 'dcl',
      subtype: dcl,
      tables: [],
      columns: [],
      hasWhere: true,
      requiresConfirm: true,
      confirmReasons: ['dcl'],
      sql: text,
      ast: null,
    };
  }

  let ast;
  let tableList;
  try {
    ast = parser.astify(text, PARSER_OPTIONS);
    tableList = parser.tableList(text, PARSER_OPTIONS);
  } catch {
    reject('Instruction non analysable');
  }
  const statements = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1) reject('Une seule instruction est admise');
  const root = statements[0];
  if (!root || !root.type) reject('Instruction non reconnue');

  const type = String(root.type).toLowerCase();
  let kind;
  if (DML_TYPES.has(type)) kind = 'dml';
  else if (
    DDL_TYPES.has(type) ||
    type.startsWith('create') ||
    type.startsWith('drop') ||
    type.startsWith('alter')
  ) {
    kind = 'ddl';
  } else {
    reject(`Type d’instruction non admis : ${root.type}`);
  }

  if (kind === 'ddl' && !cfg.sqlDdlEnabled) {
    reject('DDL/DCL désactivés (MCP_SQL_DDL_ENABLED=false)', 'MCP_SQL_DDL_DISABLED');
  }

  const tables = collectTablesFromAst(root);
  for (const entry of tableList || []) {
    const [, db, table] = String(entry).split('::');
    if (db && db !== 'null') reject(`Référence qualifiée « ${db}.${table} » refusée`);
    if (table) tables.add(normalizeTableName(table));
  }
  const tableListArr = [...tables].filter(Boolean).sort();

  for (const t of tableListArr) {
    if (PROTECTED_TABLES.has(t) || t.startsWith('mcp_oauth_')) {
      reject(`Table protégée « ${t} » : écriture / DDL refusés`);
    }
    if (isSecretTable(t)) {
      reject(`Table secrète « ${t} » : écriture / DDL refusés`);
    }
  }

  const columns = [...collectColumnsFromAst(root)];
  // Sans liste explicite, un INSERT / REPLACE positionnel écrit toutes les colonnes
  // de la table, y compris `password_hash`, sans jamais la nommer.
  if (
    (type === 'insert' || type === 'replace') &&
    (!Array.isArray(root.columns) || root.columns.length === 0)
  ) {
    reject(
      'INSERT / REPLACE sans liste de colonnes refusé : impossible d’exclure les colonnes secrètes',
    );
  }
  for (const col of columns) {
    if (isSecretColumn(col)) {
      reject(`Colonne secrète « ${col} » : écriture refusée`);
    }
  }

  const wherePresent =
    kind === 'dml' && (type === 'update' || type === 'delete') ? hasWhere(root) : true;

  const confirmReasons = [];
  if (kind === 'ddl') confirmReasons.push('ddl');
  if ((type === 'update' || type === 'delete') && !wherePresent) {
    confirmReasons.push('no_where');
  } else if (
    (type === 'update' || type === 'delete') &&
    wherePresent &&
    isVacuousPredicate(root.where)
  ) {
    // Même danger qu'un UPDATE/DELETE sans WHERE : la clause ne filtre aucune ligne.
    confirmReasons.push('unfiltered_where');
  }
  if (tableListArr.some((t) => AUTHZ_TABLES.has(t))) {
    confirmReasons.push('authz_table');
  }

  return {
    kind,
    subtype: type,
    tables: tableListArr,
    columns,
    hasWhere: wherePresent,
    requiresConfirm: confirmReasons.length > 0,
    confirmReasons,
    sql: text,
    ast: root,
    touchesContent: tableListArr.some((t) => CONTENT_TABLES.has(t)),
    onlyContent: tableListArr.length > 0 && tableListArr.every((t) => CONTENT_TABLES.has(t)),
  };
}

module.exports = {
  AUTHZ_TABLES,
  PROTECTED_TABLES,
  classifySql,
  maskSqlForAudit,
};
