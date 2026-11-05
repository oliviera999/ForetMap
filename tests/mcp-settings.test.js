'use strict';

/**
 * Réglages `mcp.*` du connecteur Claude (lot A) : défauts ouverts, variable d'environnement
 * qui gagne et verrouille, valeur en base prise en compte (cache invalidé à l'écriture), effet
 * sur `tools/list`, portée d'écriture selon la politique, audit `mcp.settings.change`.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');
const { setSetting } = require('../lib/settings');
const {
  getMcpConfig,
  resolveMcpSettings,
  invalidateMcpSettingsCache,
  resetPrivacyBypassStartupLogForTests,
  logPrivacyBypassStartupStatus,
} = require('../lib/mcp/config');
const { resetToolDefsForTests } = require('../lib/mcp/server');
const { signAuthToken } = require('../middleware/requireTeacher');

let admin;
let prof;
let adminToken;

async function clearMcpRows() {
  await execute("DELETE FROM app_settings WHERE `key` LIKE 'mcp.%'");
  invalidateMcpSettingsCache();
}

test.before(async () => {
  await initSchema();
  await clearMcpRows();
  admin = await fx.createAccount('admin');
  prof = await fx.createAccount('prof');
  adminToken = (await fx.obtainTokens(app, admin)).access_token;
});

test.beforeEach(async () => {
  fx.enableMcpEnv();
  await clearMcpRows();
  resetToolDefsForTests();
});

test.after(async () => {
  await clearMcpRows();
  await fx.cleanupAccounts();
});

test('défauts ouverts sans aucune variable posée', async () => {
  const cfg = getMcpConfig(await resolveMcpSettings({ force: true }));
  assert.equal(cfg.writeMode, 'direct');
  assert.equal(cfg.directWriteEnabled, true);
  assert.equal(cfg.writeScopePolicy, 'app_permissions');
  assert.equal(cfg.apiBridgeEnabled, true);
  assert.deepEqual(cfg.apiBridgeMethods, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  assert.equal(cfg.apiBridgeSensitiveAuth, false);
  assert.deepEqual(cfg.domainsDisabled, []);
  assert.equal(cfg.sqlEnabled, true);
  assert.equal(cfg.sqlSelectPool, 'auto');
  assert.equal(cfg.sqlWriteEnabled, true);
  assert.equal(cfg.sqlDdlEnabled, true);
  assert.equal(cfg.sqlMaxAffectedRows, 10000);
  assert.equal(cfg.confirmMode, 'off');
  assert.equal(cfg.privacyBypassActive, true);
  assert.equal(cfg.opsEnabled, true);
  assert.equal(cfg.filesEnabled, true);
  assert.equal(cfg.maxRows, 2000);
  assert.equal(cfg.maxOutputChars, 400000);
  assert.equal(cfg.toolProfile, 'complet');
  for (const entry of Object.values(cfg.settings)) assert.equal(entry.source, 'défaut');
});

test('valeur en base prise en compte ; cache invalidé à l’écriture ; audit', async () => {
  await resolveMcpSettings({ force: true });
  await setSetting('mcp.max_rows', 300, { userType: 'teacher', userId: admin.id });
  const cfg = getMcpConfig(await resolveMcpSettings());
  assert.equal(cfg.maxRows, 300, 'pas de valeur périmée après écriture');
  assert.equal(cfg.settings['mcp.max_rows'].source, 'base');
  const audit = await queryOne(
    `SELECT payload_json FROM audit_log WHERE action = 'mcp.settings.change' AND target_id = ?
     ORDER BY id DESC LIMIT 1`,
    ['mcp.max_rows'],
  );
  assert.ok(audit, 'ligne mcp.settings.change');
  const payload =
    typeof audit.payload_json === 'string' ? JSON.parse(audit.payload_json) : audit.payload_json;
  assert.equal(payload.old_value, 2000);
  assert.equal(payload.new_value, 300);
});

test('la variable d’environnement gagne et verrouille la clé', async () => {
  await setSetting('mcp.sql_write_enabled', true, {});
  process.env.MCP_SQL_WRITE_ENABLED = 'false';
  const cfg = getMcpConfig(await resolveMcpSettings({ force: true }));
  assert.equal(cfg.sqlWriteEnabled, false);
  assert.deepEqual(
    { source: cfg.settings['mcp.sql_write_enabled'].source, locked: true },
    { source: 'env', locked: cfg.settings['mcp.sql_write_enabled'].locked },
  );
  // L'interface ne peut pas écrire une clé verrouillée.
  const jwt = await signAuthToken({
    userType: 'teacher',
    userId: admin.id,
    roleSlug: 'admin',
    mfa: true,
  });
  const res = await request(app)
    .put('/api/settings/admin/mcp.sql_write_enabled')
    .set('Authorization', `Bearer ${jwt}`)
    .send({ value: true });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.equal(res.body.code, 'MCP_SETTING_LOCKED');
});

test('tools/list suit write_mode et sql_* résolus depuis la base', async () => {
  let tools = await fx.listTools(app, adminToken);
  assert.ok(tools.includes('foretmap_content_change'));
  assert.ok(tools.includes('foretmap_sql_execute'));
  await setSetting('mcp.write_mode', 'plan', {});
  await setSetting('mcp.sql_write_enabled', false, {});
  tools = await fx.listTools(app, adminToken);
  assert.ok(!tools.includes('foretmap_content_change'));
  assert.ok(tools.includes('foretmap_plan_content_change'));
  assert.ok(!tools.includes('foretmap_sql_execute'));
});

test('profil essentiel : outils hors socle retirés', async () => {
  const full = await fx.listTools(app, adminToken);
  await setSetting('mcp.tool_profile', 'essentiel', {});
  const slim = await fx.listTools(app, adminToken);
  assert.ok(slim.length < full.length, `${slim.length} < ${full.length}`);
  assert.ok(slim.includes('foretmap_search'));
  assert.ok(!slim.includes('gl_get_board'));
});

test('portée foretmap.write accordée à un prof en app_permissions, refusée en admin_only', async () => {
  const open = await fx.obtainTokens(app, prof, {
    scope: 'foretmap.read foretmap.write offline_access',
  });
  assert.equal(open.scope, 'foretmap.read foretmap.write');
  await setSetting('mcp.write_scope_policy', 'admin_only', {});
  const closed = await fx.obtainTokens(app, prof, {
    scope: 'foretmap.read foretmap.write offline_access',
  });
  assert.equal(closed.scope, 'foretmap.read');
  // Les outils qui contournent le RBAC restent refusés au prof, même avec la portée.
  const profTools = await fx.listTools(app, open.access_token);
  for (const n of ['foretmap_sql_execute', 'foretmap_content_change', 'foretmap_list_students']) {
    assert.ok(!profTools.includes(n), n);
  }
});

test('bypass actif sans accusé : outils nominatifs présents, journal warn', async () => {
  resetPrivacyBypassStartupLogForTests();
  const status = logPrivacyBypassStartupStatus();
  assert.equal(status.active, true);
  assert.equal(status.reason, 'absent');
  const tools = await fx.listTools(app, adminToken);
  assert.ok(tools.includes('foretmap_get_student'));
});
