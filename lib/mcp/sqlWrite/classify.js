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
  // SET col = … dans un UPDATE
  if (node.column && typeof node.column === 'string' && node.value !== undefined) {
    out.add(node.column);
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
