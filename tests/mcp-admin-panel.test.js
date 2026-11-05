'use strict';

/**
 * Administration du connecteur Claude (lot E) : `GET /api/settings/admin/mcp/status` (réglages,
 * sources, verrou, outils par profil, activité `via: 'mcp'`) et `POST …/write-off`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const { initSchema, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');
const { getMcpConfig, resolveMcpSettings } = require('../lib/mcp/config');

let admin;
let jwt;

test.before(async () => {
  await initSchema();
  await execute("DELETE FROM app_settings WHERE `key` LIKE 'mcp.%'");
  admin = await fx.createAccount('admin');
  jwt = await signAuthToken({
    userType: 'teacher',
    userId: admin.id,
    roleSlug: 'admin',
    mfa: true,
  });
});

test.after(async () => {
  await execute("DELETE FROM app_settings WHERE `key` LIKE 'mcp.%'");
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('status : réglages avec source et verrou, outils par profil', async () => {
  process.env.MCP_SQL_DDL_ENABLED = 'false';
  const res = await request(app)
    .get('/api/settings/admin/mcp/status')
    .set('Authorization', `Bearer ${jwt}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const ddl = res.body.settings.find((s) => s.key === 'mcp.sql_ddl_enabled');
  assert.deepEqual([ddl.source, ddl.locked, ddl.env], ['env', true, 'MCP_SQL_DDL_ENABLED']);
  const adminProfile = res.body.profiles.find((p) => p.profile === 'admin');
  assert.ok(adminProfile.connector);
  assert.ok(adminProfile.tools.includes('foretmap_api'));
  assert.ok(adminProfile.tools.includes('foretmap_sql_execute'));
  const prof = res.body.profiles.find((p) => p.profile === 'prof');
  assert.ok(prof.connector);
  assert.ok(prof.scopes.includes('foretmap.write'), 'app_permissions : écriture pour un prof');
  assert.ok(!prof.tools.includes('foretmap_sql_execute'));
  assert.ok(Array.isArray(res.body.activity));
});

test('write-off : coupe le pont, le SQL d’écriture, passe en plan ; clé verrouillée signalée', async () => {
  process.env.MCP_WRITE_REQUIRE_PLAN = 'false';
  const res = await request(app)
    .post('/api/settings/admin/mcp/write-off')
    .set('Authorization', `Bearer ${jwt}`)
    .send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.applied.map((a) => a.key).sort(), [
    'mcp.api_bridge_enabled',
    'mcp.sql_write_enabled',
  ]);
  assert.equal(res.body.locked[0].key, 'mcp.write_mode');
  const cfg = getMcpConfig(await resolveMcpSettings({ force: true }));
  assert.equal(cfg.apiBridgeEnabled, false);
  assert.equal(cfg.sqlWriteEnabled, false);
});

test('status refusé sans droit de lecture des réglages', async () => {
  const prof = await fx.createAccount('prof_classe');
  const token = await signAuthToken({
    userType: 'teacher',
    userId: prof.id,
    roleSlug: 'prof_classe',
  });
  const res = await request(app)
    .get('/api/settings/admin/mcp/status')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 403);
});
