'use strict';

/**
 * Interrupteurs des modules pédagogiques adoptés le 25/09/2026 : clés d'identification,
 * individus suivis, séances pédagogiques et récompenses (`ui.modules.*_enabled`).
 *
 * Convention suivie (celle du forum et du carnet) : module éteint → **tout** le routeur répond
 * `503 { error: '… désactivé(e)s' }`, lecture publique comme gestion prof. Récompenses éteintes :
 * en plus, la fin de séance n'attribue plus rien. Chaque réglage retrouve en fin de suite l'état
 * qu'il avait avant (`tests/helpers/settingsSnapshot.js`), pas une valeur devinée.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const { FM_MODULE_KEYS, isModuleEnabled } = require('../lib/shared/moduleGate');

const MODULE_KEYS = [
  'ui.modules.id_keys_enabled',
  'ui.modules.individuals_enabled',
  'ui.modules.pedago_sessions_enabled',
  'ui.modules.rewards_enabled',
];

const stamp = Date.now();
let adminToken = '';
let studentId = '';
let studentToken = '';
const snapshots = [];
const admin = () => ({ Authorization: `Bearer ${adminToken}` });
const student = () => ({ Authorization: `Bearer ${studentToken}` });

/** Bascule un module par la route d'administration (même chemin que la console Paramètres). */
async function setModule(key, value) {
  await request(app).put(`/api/settings/admin/${key}`).set(admin()).send({ value }).expect(200);
}

function assertDisabled(res, pattern) {
  assert.equal(res.status, 503, `503 attendu, reçu ${res.status}`);
  assert.match(String(res.body?.error || ''), pattern);
}

before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken();
  for (const key of MODULE_KEYS) snapshots.push(await snapshotSetting(key));
  // Point de départ connu : tous allumés (défaut du registre).
  for (const key of MODULE_KEYS) await setModule(key, true);
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Module', lastName: `Toggle${stamp}`, password: 'pwd12345' })
    .expect(201);
  studentId = reg.body.id;
  studentToken = reg.body.authToken;
});

after(async () => {
  for (const snap of snapshots) await restoreSetting(snap);
  if (studentId) {
    await execute('DELETE FROM pedago_session_runs WHERE user_id = ?', [studentId]).catch(() => {});
    await execute('DELETE FROM user_rewards WHERE user_id = ?', [studentId]).catch(() => {});
    await execute('DELETE FROM users WHERE id = ?', [studentId]).catch(() => {});
  }
});

test('registre : quatre interrupteurs publics, allumés par défaut, lus par moduleGate', async () => {
  assert.equal(FM_MODULE_KEYS.id_keys, 'ui.modules.id_keys_enabled');
  assert.equal(FM_MODULE_KEYS.individuals, 'ui.modules.individuals_enabled');
  assert.equal(FM_MODULE_KEYS.pedago_sessions, 'ui.modules.pedago_sessions_enabled');
  assert.equal(FM_MODULE_KEYS.rewards, 'ui.modules.rewards_enabled');

  const res = await request(app).get('/api/settings/public').expect(200);
  const modules = res.body?.settings?.ui?.modules || {};
  assert.equal(modules.id_keys_enabled, true);
  assert.equal(modules.individuals_enabled, true);
  assert.equal(modules.pedago_sessions_enabled, true);
  assert.equal(modules.rewards_enabled, true);

  const adminList = await request(app).get('/api/settings/admin').set(admin()).expect(200);
  const rows = new Map((adminList.body?.settings || []).map((r) => [r.key, r]));
  for (const key of MODULE_KEYS) {
    assert.ok(rows.has(key), `${key} absent de la console d'administration`);
    assert.equal(rows.get(key).scope, 'public');
  }
});

test('clés d’identification : éteint → 503 (lecture et gestion), rallumé → 200', async () => {
  await setModule('ui.modules.id_keys_enabled', false);
  try {
    assert.equal(await isModuleEnabled('foret', 'id_keys'), false);
    assertDisabled(await request(app).get('/api/id-keys'), /Clés d’identification désactivées/);
    assertDisabled(await request(app).get('/api/id-keys/cle-inexistante'), /désactivées/);
    assertDisabled(
      await request(app)
        .post('/api/id-keys')
        .set(admin())
        .send({ slug: `cle-off-${stamp}`, title: 'Clé off' }),
      /désactivées/,
    );
    // Les autres modules pédagogiques ne sont pas entraînés par celui-ci.
    await request(app).get('/api/pedago-sessions').expect(200);
  } finally {
    await setModule('ui.modules.id_keys_enabled', true);
  }
  const res = await request(app).get('/api/id-keys').expect(200);
  assert.ok(Array.isArray(res.body.items));
});

test('individus suivis : éteint → 503 (lecture et gestion), rallumé → 200', async () => {
  await setModule('ui.modules.individuals_enabled', false);
  try {
    assertDisabled(await request(app).get('/api/individuals'), /Suivi des individus désactivé/);
    assertDisabled(await request(app).get('/api/individuals/1'), /désactivé/);
    assertDisabled(
      await request(app).post('/api/individuals').set(admin()).send({ label: 'Arbre off' }),
      /désactivé/,
    );
  } finally {
    await setModule('ui.modules.individuals_enabled', true);
  }
  const res = await request(app).get('/api/individuals').expect(200);
  assert.ok(Array.isArray(res.body.items));
});

test('séances : éteint → 503 pour les routes élèves et la gestion prof, rallumé → 200', async () => {
  const slug = 'college-qui-mange-qui';
  await setModule('ui.modules.pedago_sessions_enabled', false);
  try {
    const pattern = /Séances pédagogiques désactivées/;
    assertDisabled(await request(app).get('/api/pedago-sessions'), pattern);
    assertDisabled(await request(app).get(`/api/pedago-sessions/${slug}`), pattern);
    assertDisabled(await request(app).get('/api/pedago-sessions/me/runs').set(student()), pattern);
    assertDisabled(
      await request(app).post(`/api/pedago-sessions/${slug}/runs/start`).set(student()),
      pattern,
    );
    assertDisabled(
      await request(app).post(`/api/pedago-sessions/${slug}/runs/complete`).set(student()),
      pattern,
    );
    // Gestion prof : même convention que le forum (modération) et le carnet (lecture prof).
    assertDisabled(await request(app).get('/api/pedago-sessions/stats').set(admin()), pattern);
    assertDisabled(
      await request(app)
        .post('/api/pedago-sessions')
        .set(admin())
        .send({ templateKey: 'custom', slug: `seance-off-${stamp}` }),
      pattern,
    );
    const run = await queryOne('SELECT COUNT(*) AS n FROM pedago_session_runs WHERE user_id = ?', [
      studentId,
    ]);
    assert.equal(Number(run?.n), 0, 'aucune exécution enregistrée module éteint');
  } finally {
    await setModule('ui.modules.pedago_sessions_enabled', true);
  }
  const list = await request(app).get('/api/pedago-sessions').expect(200);
  assert.ok(list.body.items.some((s) => s.slug === slug));
  await request(app).post(`/api/pedago-sessions/${slug}/runs/start`).set(student()).expect(200);
});

test('récompenses : éteint → fin de séance sans badge et lecture en 503 ; rallumé → badges', async () => {
  const slug = 'college-qui-mange-qui';
  await setModule('ui.modules.rewards_enabled', false);
  try {
    assert.equal(await isModuleEnabled('foret', 'rewards'), false);
    // La séance, elle, reste utilisable : seule la distribution de badges est coupée.
    const done = await request(app)
      .post(`/api/pedago-sessions/${slug}/runs/complete`)
      .set(student())
      .expect(200);
    assert.equal(done.body.run.completed, true);
    assert.deepEqual(done.body.rewards, []);
    const stored = await queryOne('SELECT COUNT(*) AS n FROM user_rewards WHERE user_id = ?', [
      studentId,
    ]);
    assert.equal(Number(stored?.n), 0, 'aucun badge écrit module éteint');
    assertDisabled(
      await request(app).get('/api/rewards/me').set(student()),
      /Récompenses désactivées/,
    );
  } finally {
    await setModule('ui.modules.rewards_enabled', true);
  }
  const again = await request(app)
    .post(`/api/pedago-sessions/${slug}/runs/complete`)
    .set(student())
    .expect(200);
  const keys = again.body.rewards.map((r) => r.key);
  assert.ok(keys.includes('session_first'));
  assert.ok(keys.includes('session_replay'));
  const mine = await request(app).get('/api/rewards/me').set(student()).expect(200);
  assert.ok(mine.body.rewards.some((r) => r.key === 'session_first'));
});
