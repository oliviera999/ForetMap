'use strict';

/**
 * Outils de domaine du lot D4 « réglages et administration » : `foretmap_settings`,
 * `foretmap_rbac`, `foretmap_audit_log`, `foretmap_calendar`, `foretmap_moodle`,
 * `foretmap_stats`. Lectures, une écriture représentative par outil avec son effet vérifié en
 * base, clé `mcp.*` verrouillée par l'environnement (409 relayé), refus nominatif sans bypass,
 * domaine désactivé.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fx = require('./helpers/mcpFixtures');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');

fx.enableMcpEnv();

const { app } = require('../server');

const STAMP = `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
const SETTING_KEY = 'ui.map.emoji_label_center_gap';
let token;
let settingSnapshot;
let roleId;
let studentId;
let yearId;

const call = (name, args) => fx.callTool(app, token, name, args);

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
  settingSnapshot = await snapshotSetting(SETTING_KEY);
  const res = await execute(
    'INSERT INTO roles (slug, display_name, `rank`, is_system) VALUES (?, ?, 10, 0)',
    [`mcp_role_${STAMP}`, `Profil MCP ${STAMP}`],
  );
  roleId = res.insertId;
  studentId = crypto.randomUUID();
  await execute(
    `INSERT INTO users (id, user_type, pseudo, first_name, last_name, display_name, is_active,
                        auth_provider, created_at, updated_at)
     VALUES (?, 'student', ?, 'Rbac', 'Mcp', 'Rbac Mcp', 1, 'local', NOW(), NOW())`,
    [studentId, `mcp_rbac_${STAMP}`],
  );
});

test.after(async () => {
  await restoreSetting(settingSnapshot);
  if (studentId) {
    await execute('DELETE FROM user_roles WHERE user_id = ?', [studentId]);
    await execute('DELETE FROM users WHERE id = ?', [studentId]);
  }
  if (roleId) {
    await execute('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    await execute('DELETE FROM roles WHERE id = ?', [roleId]);
  }
  if (yearId) await execute('DELETE FROM school_calendar_years WHERE id = ?', [yearId]);
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('settings : liste avec source, lecture, modification (effet en base)', async () => {
  const list = await call('foretmap_settings', { action: 'list', prefix: 'ui.map.', limit: 500 });
  assert.equal(list.isError, false, list.text);
  assert.ok(list.data.items.length > 3);
  assert.ok(list.data.items.every((r) => ['env', 'base', 'défaut'].includes(r.source)));
  assert.equal(list.data.items[0].domain !== undefined, true);

  const set = await call('foretmap_settings', { action: 'set', key: SETTING_KEY, value: 21 });
  assert.equal(set.isError, false, set.text);
  const row = await queryOne('SELECT value_json FROM app_settings WHERE `key` = ?', [SETTING_KEY]);
  assert.equal(Number(JSON.parse(row.value_json)), 21);
  const get = await call('foretmap_settings', { action: 'get', key: SETTING_KEY });
  assert.equal(get.isError, false, get.text);
  assert.equal(Number(get.data.value), 21);
  assert.equal(get.data.source, 'base');

  const bad = await call('foretmap_settings', { action: 'set', key: SETTING_KEY, value: 999 });
  assert.equal(bad.isError, true, 'hors bornes : refus de la route');
  const unknown = await call('foretmap_settings', { action: 'get', key: 'cle.inexistante' });
  assert.equal(unknown.isError, true);
});

test('settings : clé mcp.* verrouillée par l’environnement — source env, écriture refusée', async () => {
  process.env.MCP_WRITE_MODE = 'direct';
  const get = await call('foretmap_settings', { action: 'get', key: 'mcp.write_mode' });
  assert.equal(get.isError, false, get.text);
  assert.equal(get.data.source, 'env');
  assert.equal(get.data.locked, true);
  assert.equal(get.data.env, 'MCP_WRITE_MODE');
  const set = await call('foretmap_settings', {
    action: 'set',
    key: 'mcp.write_mode',
    value: 'plan',
  });
  assert.equal(set.isError, true);
  assert.match(set.text, /variable MCP_WRITE_MODE/);
  assert.match(set.text, /409/);
});

test('rbac : profils, permissions, accorder / retirer, attribuer un profil (effets en base)', async () => {
  const roles = await call('foretmap_rbac', { action: 'roles' });
  assert.equal(roles.isError, false, roles.text);
  assert.ok(roles.data.roles.some((r) => r.slug === 'admin'));
  const perms = await call('foretmap_rbac', { action: 'permissions' });
  assert.ok(perms.data.catalog.some((p) => p.key === 'mcp.ops'));
  assert.ok(perms.data.catalog.some((p) => p.key === 'notifications.send'));

  const slug = `mcp_role_${STAMP}`;
  const grant = await call('foretmap_rbac', {
    action: 'grant',
    role: slug,
    permissions: ['groups.read', 'stats.read.group'],
  });
  assert.equal(grant.isError, false, grant.text);
  assert.deepEqual(grant.data.added, ['groups.read', 'stats.read.group']);
  let keys = (
    await queryAll('SELECT permission_key FROM role_permissions WHERE role_id = ?', [roleId])
  ).map((r) => r.permission_key);
  assert.deepEqual(keys.sort(), ['groups.read', 'stats.read.group']);

  const revoke = await call('foretmap_rbac', {
    action: 'revoke',
    role: roleId,
    permissions: ['groups.read'],
  });
  assert.equal(revoke.isError, false, revoke.text);
  keys = (
    await queryAll('SELECT permission_key FROM role_permissions WHERE role_id = ?', [roleId])
  ).map((r) => r.permission_key);
  assert.deepEqual(keys, ['stats.read.group']);
  const one = await call('foretmap_rbac', { action: 'permissions', role: slug });
  assert.deepEqual(one.data.granted, ['stats.read.group']);
  const unknown = await call('foretmap_rbac', {
    action: 'grant',
    role: slug,
    permissions: ['permission.inexistante'],
  });
  assert.equal(unknown.isError, true);

  const assign = await call('foretmap_rbac', {
    action: 'set_user_role',
    user_type: 'student',
    user_id: studentId,
    role: 'eleve_avance',
  });
  assert.equal(assign.isError, false, assign.text);
  const primary = await queryOne(
    `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND ur.is_primary = 1`,
    [studentId],
  );
  assert.equal(primary.slug, 'eleve_avance');
});

test('audit_log : requête filtrée par via et préfixe ; journal de sécurité', async () => {
  const q = await call('foretmap_audit_log', {
    action: 'query',
    event: 'rbac_*',
    via: 'mcp',
    target_type: 'role',
    limit: 50,
  });
  assert.equal(q.isError, false, q.text);
  assert.ok(q.data.total >= 1);
  assert.ok(q.data.items.every((r) => r.action.startsWith('rbac_') && r.via === 'mcp'));
  assert.ok(q.data.items.some((r) => r.target_id === String(roleId)));
  const today = new Date().toISOString().slice(0, 10);
  const sec = await call('foretmap_audit_log', { action: 'security_events', from: today });
  assert.equal(sec.isError, false, sec.text);
  assert.ok(Array.isArray(sec.data.items ?? sec.data.rows ?? sec.data));
});

test('calendar : préparer une année, fermer une période (effets en base), lecture', async () => {
  const y = 2300 + Math.floor(Math.random() * 600);
  const prep = await call('foretmap_calendar', {
    action: 'prepare_year',
    label: `MCP ${STAMP}`,
    starts_on: `${y}-09-01`,
    ends_on: `${y}-09-30`,
  });
  assert.equal(prep.isError, false, prep.text);
  yearId = prep.data.year.id;
  const days = await queryAll('SELECT day_date FROM school_calendar_days WHERE year_id = ?', [
    yearId,
  ]);
  assert.equal(days.length, 30);

  const close = await call('foretmap_calendar', {
    action: 'set_days',
    from: `${y}-09-14`,
    to: `${y}-09-18`,
    mode: 'close',
    kind: 'vacation',
    label: 'Vacances MCP',
  });
  assert.equal(close.isError, false, close.text);
  // Les jours ouvrés de la période passent en vacances ; les week-ends restent des week-ends.
  const inRange = await queryAll(
    'SELECT is_open, kind FROM school_calendar_days WHERE year_id = ? AND day_date BETWEEN ? AND ?',
    [yearId, `${y}-09-14`, `${y}-09-18`],
  );
  assert.equal(inRange.length, 5);
  assert.ok(inRange.every((d) => Number(d.is_open) === 0));
  assert.ok(inRange.some((d) => d.kind === 'vacation'));

  const get = await call('foretmap_calendar', { action: 'get', year_id: yearId });
  assert.equal(get.isError, false, get.text);
  assert.equal(get.data.year_id, yearId);
  const range = await call('foretmap_calendar', {
    action: 'get',
    from: `${y}-09-01`,
    to: `${y}-09-07`,
  });
  assert.equal(range.isError, false, range.text);
  assert.equal(range.data.days.length, 7);
});

test('moodle : état et historique (lectures)', async () => {
  const st = await call('foretmap_moodle', { action: 'check' });
  assert.equal(st.isError, false, st.text);
  const runs = await call('foretmap_moodle', { action: 'runs', limit: 5 });
  assert.equal(runs.isError, false, runs.text);
  assert.ok(Array.isArray(runs.data.items));
});

test('stats : agrégats sans nom, détail nominatif, usage', async () => {
  const dash = await call('foretmap_stats', { action: 'dashboard' });
  assert.equal(dash.isError, false, dash.text);
  assert.equal(typeof dash.data.students_count, 'number');
  assert.ok(!JSON.stringify(dash.data).includes('first_name'));
  const students = await call('foretmap_stats', { action: 'students', limit: 5 });
  assert.equal(students.isError, false, students.text);
  assert.ok(Array.isArray(students.data.items));
  const usage = await call('foretmap_stats', { action: 'usage' });
  assert.equal(usage.isError, false, usage.text);
  assert.ok(Array.isArray(usage.data.rows));
});

test('nominatif refusé sans bypass (audit, stats par élève) ; agrégats conservés', async () => {
  process.env.MCP_PRIVACY_BYPASS = 'false';
  const q = await call('foretmap_audit_log', { action: 'query' });
  assert.equal(q.isError, true);
  assert.match(q.text, /bypass/);
  const s = await call('foretmap_stats', { action: 'students' });
  assert.equal(s.isError, true);
  const d = await call('foretmap_stats', { action: 'dashboard' });
  assert.equal(d.isError, false, d.text);
});

test('domaines désactivés : outils absents et appels refusés', async () => {
  process.env.MCP_DOMAINS_DISABLED = 'rbac,audit_log,calendar,moodle,stats,settings';
  const tools = await fx.listTools(app, token);
  for (const name of [
    'foretmap_rbac',
    'foretmap_audit_log',
    'foretmap_calendar',
    'foretmap_moodle',
    'foretmap_stats',
    'foretmap_settings',
  ]) {
    assert.ok(!tools.includes(name), `${name} doit être retiré`);
  }
  const r = await call('foretmap_rbac', { action: 'roles' });
  assert.equal(r.isError, true);
});
