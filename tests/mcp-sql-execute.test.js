'use strict';

/**
 * `foretmap_sql_execute` — DML, dry_run, plafond, DDL, interdits, migration, audit.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, execute } = require('../database');
const { resetToolDefsForTests } = require('../lib/mcp/server');
const { classifySql } = require('../lib/mcp/sqlWrite/classify');
const { buildEquivalentMigration } = require('../lib/mcp/sqlWrite/migration');
const { requestConfirmation } = require('../lib/mcp/confirm');
const { McpToolError } = require('../lib/mcp/registry');

fx.enableMcpEnv({
  MCP_SQL_WRITE_ENABLED: 'true',
  MCP_SQL_DDL_ENABLED: 'false',
  MCP_CONFIRM_REQUIRED: 'false',
  MCP_SQL_MAX_AFFECTED_ROWS: '100',
});

const { app } = require('../server');

let admin;
let prof;
let adminToken;
let profToken;
let plantId;

test.before(async () => {
  await initSchema();
  admin = await fx.createAccount('admin');
  prof = await fx.createAccount('prof');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
  profToken = (await fx.obtainTokens(app, prof)).access_token;
  const p = await queryOne('SELECT id FROM plants ORDER BY id LIMIT 1');
  plantId = p?.id || 1;
  requestConfirmation._sendEmail = async (payload) => {
    requestConfirmation._lastCode = payload.code;
    return true;
  };
});

test.after(async () => {
  delete requestConfirmation._sendEmail;
  await fx.cleanupAccounts();
});

test.beforeEach(() => {
  fx.enableMcpEnv({
    MCP_SQL_WRITE_ENABLED: 'true',
    MCP_SQL_DDL_ENABLED: 'false',
    MCP_CONFIRM_REQUIRED: 'false',
    MCP_SQL_MAX_AFFECTED_ROWS: '100',
  });
  resetToolDefsForTests();
});

test('outil absent pour un prof ; présent pour admin si drapeau on', async () => {
  const adminTools = await fx.listTools(app, adminToken);
  assert.ok(adminTools.includes('foretmap_sql_execute'));
  const profTools = await fx.listTools(app, profToken);
  assert.ok(!profTools.includes('foretmap_sql_execute'));
  process.env.MCP_SQL_WRITE_ENABLED = 'false';
  resetToolDefsForTests();
  const off = await fx.listTools(app, adminToken);
  assert.ok(!off.includes('foretmap_sql_execute'));
});

test('classify : interdits', () => {
  for (const sql of [
    'SELECT * FROM plants',
    'LOAD DATA INFILE "x" INTO TABLE plants',
    'SELECT id INTO OUTFILE "/tmp/x" FROM plants',
    'SHUTDOWN',
    'SET PASSWORD = PASSWORD("x")',
    'SET GLOBAL max_connections = 1',
    'KILL 1',
  ]) {
    assert.throws(() => classifySql(sql), McpToolError);
  }
});

test('classify : table protégée et colonne secrète', () => {
  assert.throws(() => classifySql('DELETE FROM audit_log WHERE id = 1'), McpToolError);
  assert.throws(
    () => classifySql("UPDATE users SET password_hash = 'x' WHERE id = 'a'"),
    McpToolError,
  );
});

test('DML UPDATE dry_run puis réel', async () => {
  const before = await queryOne('SELECT name FROM plants WHERE id = ?', [plantId]);
  const dry = await fx.callTool(app, adminToken, 'foretmap_sql_execute', {
    sql: `UPDATE plants SET name = ${JSON.stringify(before.name)} WHERE id = ${plantId}`,
    dry_run: true,
  });
  assert.equal(dry.isError, false, dry.text);
  assert.equal(dry.data.dry_run, true);
  assert.equal(dry.data.rolled_back, true);
  assert.ok(dry.data.affected_rows >= 0);

  const marker = `mcp_sql_${Date.now()}`;
  const run = await fx.callTool(app, adminToken, 'foretmap_sql_execute', {
    sql: `UPDATE plants SET remarks = ${JSON.stringify(marker)} WHERE id = ${plantId}`,
  });
  assert.equal(run.isError, false, run.text);
  assert.equal(run.data.dry_run, false);
  assert.ok(run.data.affected_rows >= 1);
  assert.ok(run.data.migration_sql);
  const after = await queryOne('SELECT remarks FROM plants WHERE id = ?', [plantId]);
  assert.equal(after.remarks, marker);

  const audit = await queryOne(
    `SELECT action FROM audit_log WHERE action = 'mcp.sql.execute' AND actor_user_id = ?
     ORDER BY id DESC LIMIT 1`,
    [admin.id],
  );
  assert.ok(audit);

  // Restaurer
  await execute('UPDATE plants SET remarks = ? WHERE id = ?', [null, plantId]);
});

test('DDL refusé si MCP_SQL_DDL_ENABLED=false', async () => {
  const res = await fx.callTool(app, adminToken, 'foretmap_sql_execute', {
    sql: 'CREATE TABLE IF NOT EXISTS mcp_tmp_ddl_test (id INT PRIMARY KEY)',
  });
  assert.equal(res.isError, true);
  assert.match(String(res.data.error || res.text), /DDL|désactiv/i);
});

test('DDL dry_run sans exécution ; confirmation si requis', async () => {
  process.env.MCP_SQL_DDL_ENABLED = 'true';
  process.env.MCP_CONFIRM_REQUIRED = 'true';
  resetToolDefsForTests();
  const dry = await fx.callTool(app, adminToken, 'foretmap_sql_execute', {
    sql: 'CREATE TABLE IF NOT EXISTS mcp_tmp_ddl_test (id INT PRIMARY KEY)',
    dry_run: true,
  });
  assert.equal(dry.isError, false, dry.text);
  assert.equal(dry.data.executed, false);
  assert.equal(dry.data.dry_run, true);

  const ask = await fx.callTool(app, adminToken, 'foretmap_sql_execute', {
    sql: 'CREATE TABLE IF NOT EXISTS mcp_tmp_ddl_test (id INT PRIMARY KEY)',
  });
  assert.equal(ask.isError, false, ask.text);
  assert.equal(ask.data.confirmation_required, true);
  const code = requestConfirmation._lastCode;
  const done = await fx.callTool(app, adminToken, 'foretmap_sql_execute', {
    sql: 'CREATE TABLE IF NOT EXISTS mcp_tmp_ddl_test (id INT PRIMARY KEY)',
    confirmation_id: ask.data.confirmation_id,
    confirmation_code: code,
  });
  assert.equal(done.isError, false, done.text);
  assert.equal(done.data.executed, true);
  await execute('DROP TABLE IF EXISTS mcp_tmp_ddl_test');
});

test('UPDATE sans WHERE exige confirmation', async () => {
  process.env.MCP_CONFIRM_REQUIRED = 'true';
  resetToolDefsForTests();
  const ask = await fx.callTool(app, adminToken, 'foretmap_sql_execute', {
    sql: 'UPDATE plants SET remarks = remarks',
  });
  assert.equal(ask.isError, false, ask.text);
  assert.equal(ask.data.confirmation_required, true);
  assert.match(String(ask.data.summary || ''), /SANS WHERE|WHERE/i);
});

test('plafond max_affected_rows', async () => {
  process.env.MCP_CONFIRM_REQUIRED = 'true';
  process.env.MCP_SQL_MAX_AFFECTED_ROWS = '1';
  resetToolDefsForTests();
  // Toucher plusieurs plantes (s'il y en a au moins 2)
  const count = await queryOne('SELECT COUNT(*) AS n FROM plants');
  if (Number(count.n) < 2) return;
  const ask = await fx.callTool(app, adminToken, 'foretmap_sql_execute', {
    sql: "UPDATE plants SET remarks = COALESCE(remarks, '')",
    max_affected_rows: 1,
  });
  assert.equal(ask.isError, false, ask.text);
  // Soit confirmation d'emblée (authz? non) soit après détection du plafond
  assert.ok(
    ask.data.confirmation_required === true || ask.data.affected_rows_detected > 1,
    JSON.stringify(ask.data),
  );
});

test('migration hors corpus = null ; DCL classifié', () => {
  const dml = classifySql(`UPDATE plants SET name = 'x' WHERE id = ${plantId}`);
  const mig = buildEquivalentMigration(dml);
  assert.ok(mig.migration_sql);

  const userUpd = classifySql("UPDATE users SET display_name = 'x' WHERE id = 'abc'");
  const mig2 = buildEquivalentMigration(userUpd);
  assert.equal(mig2.migration_sql, null);

  process.env.MCP_SQL_DDL_ENABLED = 'true';
  const dcl = classifySql("GRANT SELECT ON `foretmap`.`plants` TO 'u'@'localhost'");
  assert.equal(dcl.kind, 'dcl');
  assert.equal(dcl.requiresConfirm, true);
});

test('prof ne peut pas appeler même avec drapeau', async () => {
  const res = await fx.callTool(app, profToken, 'foretmap_sql_execute', {
    sql: `UPDATE plants SET name = name WHERE id = ${plantId}`,
  });
  assert.equal(res.isError, true);
});
