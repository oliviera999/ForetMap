'use strict';

/**
 * `foretmap_sql_select` sur le pool principal (lot C) : sans `DB_MCP_USER` (hébergement
 * mutualisé), transaction READ ONLY + analyse syntaxique ; écriture déguisée refusée ;
 * colonnes secrètes refusées (y compris par `SELECT *`) ; plafond `mcp.max_rows`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const fx = require('./helpers/mcpFixtures');
const { initSchema, execute } = require('../database');

delete process.env.DB_MCP_USER;
fx.enableMcpEnv();

const { app } = require('../server');
const { withReadOnly } = require('../lib/mcp/readDb');

let admin;
let adminToken;

test.before(async () => {
  await initSchema();
  admin = await fx.createAccount('admin');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
});

test.after(async () => {
  await execute("DELETE FROM app_settings WHERE `key` LIKE 'mcp.%'");
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('outil présent sans DB_MCP_USER ; absent si dedicated_only', async () => {
  let tools = await fx.listTools(app, adminToken);
  assert.ok(tools.includes('foretmap_sql_select'));
  process.env.MCP_SQL_SELECT_POOL = 'dedicated_only';
  tools = await fx.listTools(app, adminToken);
  assert.ok(!tools.includes('foretmap_sql_select'));
});

test('lecture sur le pool principal, pagination', async () => {
  const r = await fx.callTool(app, adminToken, 'foretmap_sql_select', {
    sql: 'SELECT id, name FROM plants ORDER BY id',
    limit: 2,
  });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.pool, 'principal');
  assert.ok(r.data.rows.length <= 2);
  if (r.data.rows.length === 2) {
    assert.equal(r.data.next_offset, 2);
    const next = await fx.callTool(app, adminToken, 'foretmap_sql_select', {
      sql: 'SELECT id, name FROM plants ORDER BY id',
      limit: 2,
      offset: 2,
    });
    assert.equal(next.isError, false, next.text);
    assert.notDeepEqual(next.data.rows[0], r.data.rows[0]);
  }
});

test('écriture déguisée : refusée par l’analyse, et par READ ONLY (1792) en dernier recours', async () => {
  for (const sql of [
    "UPDATE plants SET name = 'x' WHERE id = 1",
    'SELECT id FROM plants FOR UPDATE',
    'SELECT id INTO @x FROM plants',
    'SELECT id FROM plants; DELETE FROM plants',
  ]) {
    const r = await fx.callTool(app, adminToken, 'foretmap_sql_select', { sql });
    assert.equal(r.isError, true, sql);
  }
  // Même si l'analyse était contournée, la transaction READ ONLY refuse l'écriture.
  await assert.rejects(
    withReadOnly((db) =>
      db.raw('UPDATE plants SET name = name WHERE id = -1', [], { astValidated: true }),
    ),
    (err) => err.errno === 1792 || /READ ONLY/i.test(String(err.message)),
  );
});

test('colonnes secrètes refusées, y compris par SELECT *', async () => {
  for (const sql of [
    'SELECT password_hash FROM users',
    'SELECT * FROM users',
    'SELECT u.* FROM users u',
    'SELECT * FROM user_totp',
  ]) {
    const r = await fx.callTool(app, adminToken, 'foretmap_sql_select', { sql });
    assert.equal(r.isError, true, sql);
  }
  const ok = await fx.callTool(app, adminToken, 'foretmap_sql_select', {
    sql: 'SELECT id, pseudo FROM users',
    limit: 3,
  });
  assert.equal(ok.isError, false, ok.text);
  assert.doesNotMatch(ok.text, /\$2[aby]\$/);
});

test('plafond mcp.max_rows', async () => {
  process.env.MCP_MAX_ROWS = '50';
  const r = await fx.callTool(app, adminToken, 'foretmap_sql_select', {
    sql: 'SELECT id FROM plants',
    limit: 1000,
  });
  assert.equal(r.isError, false, r.text);
  assert.equal(r.data.limit, 50);
  assert.ok(r.data.rows.length <= 50);
});
