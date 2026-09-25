'use strict';

/**
 * Interrupteurs des modules pédagogiques : clés d'identification, individus suivis, séances
 * pédagogiques et récompenses (`ui.modules.*_enabled`).
 *
 * Convention (décision du mainteneur, 25/09/2026, révisée) : l'interrupteur éteint le module
 * **pour les élèves**. Élève, visiteur ou appel anonyme → `503 { error: '… désactivé(e)s' }` ;
 * le compte qui porte la permission de gestion du module (`id_keys.manage`,
 * `individuals.manage`, `plants.manage` pour les séances) continue de préparer
 * (`lib/pedagoModuleGate.js`). Récompenses éteintes : lecture en 503, mais les badges mérités
 * sont enregistrés en silence et apparaissent au rallumage, sans doublon.
 *
 * Chaque réglage retrouve en fin de suite l'état qu'il avait avant
 * (`tests/helpers/settingsSnapshot.js`), pas une valeur devinée.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');
const { FM_MODULE_KEYS, isModuleEnabled } = require('../lib/shared/moduleGate');
const { PEDAGO_MODULE_MANAGE_PERMISSIONS } = require('../lib/pedagoModuleGate');

const MODULE_KEYS = [
  'ui.modules.id_keys_enabled',
  'ui.modules.individuals_enabled',
  'ui.modules.pedago_sessions_enabled',
  'ui.modules.rewards_enabled',
];
const SESSION_SLUG = 'college-qui-mange-qui';

const stamp = Date.now();
let adminToken = '';
let studentId = '';
let studentToken = '';
let plantId = 0;
const createdKeyIds = [];
const createdIndividualIds = [];
const createdSessionIds = [];
const snapshots = [];
const admin = () => ({ Authorization: `Bearer ${adminToken}` });
const student = () => ({ Authorization: `Bearer ${studentToken}` });

/** Bascule un module par la route d'administration (même chemin que la console Paramètres). */
async function setModule(key, value) {
  await request(app).put(`/api/settings/admin/${key}`).set(admin()).send({ value }).expect(200);
}

function assertDisabled(res, pattern) {
  assert.equal(res.status, 503, `503 attendu, reçu ${res.status} (${JSON.stringify(res.body)})`);
  assert.match(String(res.body?.error || ''), pattern);
}

async function studentRewardKeys() {
  const rows = await queryAll(
    'SELECT reward_key FROM user_rewards WHERE user_id = ? ORDER BY reward_key',
    [studentId],
  );
  return rows.map((r) => r.reward_key);
}

before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken({
    extraPermissions: ['id_keys.manage', 'individuals.manage', 'individuals.measure'],
  });
  for (const key of MODULE_KEYS) snapshots.push(await snapshotSetting(key));
  // Point de départ connu : tous allumés (défaut du registre).
  for (const key of MODULE_KEYS) await setModule(key, true);
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Module', lastName: `Toggle${stamp}`, password: 'pwd12345' })
    .expect(201);
  studentId = reg.body.id;
  studentToken = reg.body.authToken;
  const plant = await execute(
    `INSERT INTO plants (name, emoji, description) VALUES (?, '🌳', 'interrupteurs modules')`,
    [`Module Plant ${stamp}`],
  );
  plantId = plant.insertId;
});

after(async () => {
  for (const snap of snapshots) await restoreSetting(snap);
  for (const id of createdKeyIds) {
    await execute('DELETE FROM id_keys WHERE id = ?', [id]).catch(() => {});
  }
  for (const id of createdIndividualIds) {
    await execute('DELETE FROM tracked_individuals WHERE id = ?', [id]).catch(() => {});
  }
  for (const id of createdSessionIds) {
    await execute('DELETE FROM pedago_sessions WHERE id = ?', [id]).catch(() => {});
  }
  if (plantId) await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
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
  assert.deepEqual(PEDAGO_MODULE_MANAGE_PERMISSIONS, {
    id_keys: 'id_keys.manage',
    individuals: 'individuals.manage',
    pedago_sessions: 'plants.manage',
  });

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

test('clés d’identification éteintes : élève 503, gestionnaire 200 ; rallumé → 200', async () => {
  const slug = `cle-off-${stamp}`;
  await setModule('ui.modules.id_keys_enabled', false);
  try {
    assert.equal(await isModuleEnabled('foret', 'id_keys'), false);
    const pattern = /Clés d’identification désactivées/;
    // Lecture élève (et anonyme) : fermée.
    assertDisabled(await request(app).get('/api/id-keys'), pattern);
    assertDisabled(await request(app).get('/api/id-keys').set(student()), pattern);
    assertDisabled(await request(app).get('/api/id-keys/cle-inexistante'), pattern);
    // Un élève qui tente l'édition reçoit le 503 du module, pas un 403 qui l'annoncerait.
    assertDisabled(
      await request(app).post('/api/id-keys').set(student()).send({ slug, title: 'Clé off' }),
      pattern,
    );

    // Gestionnaire : préparation complète, brouillons compris.
    const created = await request(app)
      .post('/api/id-keys')
      .set(admin())
      .send({ slug, title: 'Clé préparée module éteint' })
      .expect(201);
    const keyId = Number(created.body?.id ?? created.body?.key?.id);
    assert.ok(keyId > 0, 'identifiant de clé attendu');
    createdKeyIds.push(keyId);
    await request(app).get('/api/id-keys').set(admin()).expect(200);
    const all = await request(app).get('/api/id-keys?all=1').set(admin()).expect(200);
    assert.ok(all.body.items.some((k) => Number(k.id) === keyId));
    await request(app).get(`/api/id-keys/${slug}`).set(admin()).expect(200);
    await request(app)
      .put(`/api/id-keys/${keyId}`)
      .set(admin())
      .send({ title: 'Clé préparée (modifiée)' })
      .expect(200);

    // Les autres modules pédagogiques ne sont pas entraînés par celui-ci.
    await request(app).get('/api/pedago-sessions').expect(200);
  } finally {
    await setModule('ui.modules.id_keys_enabled', true);
  }
  const res = await request(app).get('/api/id-keys').expect(200);
  assert.ok(Array.isArray(res.body.items));
});

test('individus éteints : lecture et mesure élève 503, gestionnaire 200 ; rallumé → 200', async () => {
  await setModule('ui.modules.individuals_enabled', false);
  try {
    const pattern = /Suivi des individus désactivé/;
    const created = await request(app)
      .post('/api/individuals')
      .set(admin())
      .send({ plant_id: plantId, map_id: 'foret', label: `Arbre préparé ${stamp}` })
      .expect(201);
    const individualId = created.body.id;
    createdIndividualIds.push(individualId);

    assertDisabled(await request(app).get('/api/individuals'), pattern);
    assertDisabled(await request(app).get(`/api/individuals/${individualId}`), pattern);
    assertDisabled(
      await request(app).get(`/api/individuals/${individualId}`).set(student()),
      pattern,
    );
    // Saisie de mesure = usage élève (`individuals.measure` existe chez des paliers élève).
    assertDisabled(
      await request(app)
        .post(`/api/individuals/${individualId}/measurements`)
        .set(student())
        .send({ measured_at: '2026-09-25', height_m: 2 }),
      pattern,
    );

    await request(app).get('/api/individuals').set(admin()).expect(200);
    const detail = await request(app)
      .get(`/api/individuals/${individualId}`)
      .set(admin())
      .expect(200);
    assert.equal(detail.body.label, `Arbre préparé ${stamp}`);
    await request(app)
      .post(`/api/individuals/${individualId}/measurements`)
      .set(admin())
      .send({ measured_at: '2026-09-25', height_m: 2 })
      .expect(201);
  } finally {
    await setModule('ui.modules.individuals_enabled', true);
  }
  const res = await request(app).get('/api/individuals').expect(200);
  assert.ok(Array.isArray(res.body.items));
});

test('séances éteintes : routes élèves 503, gestion prof 200 ; rallumé → 200', async () => {
  await setModule('ui.modules.pedago_sessions_enabled', false);
  try {
    const pattern = /Séances pédagogiques désactivées/;
    // Usage élève : catalogue, détail (lien direct / QR), exécutions.
    assertDisabled(await request(app).get('/api/pedago-sessions'), pattern);
    assertDisabled(await request(app).get('/api/pedago-sessions').set(student()), pattern);
    assertDisabled(await request(app).get(`/api/pedago-sessions/${SESSION_SLUG}`), pattern);
    assertDisabled(await request(app).get('/api/pedago-sessions/me/runs').set(student()), pattern);
    assertDisabled(
      await request(app).post(`/api/pedago-sessions/${SESSION_SLUG}/runs/start`).set(student()),
      pattern,
    );
    assertDisabled(
      await request(app).post(`/api/pedago-sessions/${SESSION_SLUG}/runs/complete`).set(student()),
      pattern,
    );
    assertDisabled(await request(app).get('/api/pedago-sessions/stats').set(student()), pattern);
    const run = await queryOne('SELECT COUNT(*) AS n FROM pedago_session_runs WHERE user_id = ?', [
      studentId,
    ]);
    assert.equal(Number(run?.n), 0, 'aucune exécution élève enregistrée module éteint');

    // Gestion prof (`plants.manage`) : tout reste ouvert.
    await request(app).get('/api/pedago-sessions').set(admin()).expect(200);
    const all = await request(app).get('/api/pedago-sessions?all=1').set(admin()).expect(200);
    assert.ok(all.body.items.some((s) => s.slug === SESSION_SLUG));
    await request(app).get(`/api/pedago-sessions/${SESSION_SLUG}`).set(admin()).expect(200);
    await request(app).get('/api/pedago-sessions/stats').set(admin()).expect(200);
    await request(app).get(`/api/pedago-sessions/${SESSION_SLUG}/runs`).set(admin()).expect(200);
    const share = await request(app)
      .get(`/api/pedago-sessions/${SESSION_SLUG}/share`)
      .set(admin())
      .expect(200);
    assert.match(share.body.link, /seance=/);
    const created = await request(app)
      .post('/api/pedago-sessions')
      .set(admin())
      .send({ templateKey: 'custom', slug: `seance-off-${stamp}` })
      .expect(201);
    createdSessionIds.push(created.body.id);
    await request(app)
      .put(`/api/pedago-sessions/${created.body.id}`)
      .set(admin())
      .send({ title: 'Séance préparée module éteint' })
      .expect(200);
    // Démonstration : le gestionnaire peut lancer une séance.
    await request(app)
      .post(`/api/pedago-sessions/${SESSION_SLUG}/runs/start`)
      .set(admin())
      .expect(200);
  } finally {
    await setModule('ui.modules.pedago_sessions_enabled', true);
  }
  const list = await request(app).get('/api/pedago-sessions').expect(200);
  assert.ok(list.body.items.some((s) => s.slug === SESSION_SLUG));
  await request(app)
    .post(`/api/pedago-sessions/${SESSION_SLUG}/runs/start`)
    .set(student())
    .expect(200);
});

test('récompenses éteintes : badges enregistrés sans annonce, rattrapés au rallumage, sans doublon', async () => {
  const complete = () =>
    request(app)
      .post(`/api/pedago-sessions/${SESSION_SLUG}/runs/complete`)
      .set(student())
      .expect(200);

  await setModule('ui.modules.rewards_enabled', false);
  try {
    assert.equal(await isModuleEnabled('foret', 'rewards'), false);
    // Première fin : la séance fonctionne, rien n'est annoncé, mais le badge est enregistré.
    const first = await complete();
    assert.equal(first.body.run.completed, true);
    assert.deepEqual(first.body.rewards, []);
    assert.deepEqual(await studentRewardKeys(), ['session_first']);
    // Deuxième fin : « séance refaite » mérité pendant la coupure, toujours sans annonce.
    const second = await complete();
    assert.equal(second.body.run.completionCount, 2);
    assert.deepEqual(second.body.rewards, []);
    assert.deepEqual(await studentRewardKeys(), ['session_first', 'session_replay']);
    // Lecture fermée à tous : aucune route de gestion pour les badges.
    assertDisabled(
      await request(app).get('/api/rewards/me').set(student()),
      /Récompenses désactivées/,
    );
    assertDisabled(await request(app).get('/api/rewards/me').set(admin()), /désactivées/);
  } finally {
    await setModule('ui.modules.rewards_enabled', true);
  }

  // Rallumage : les badges mérités pendant la coupure apparaissent.
  const mine = await request(app).get('/api/rewards/me').set(student()).expect(200);
  const keys = mine.body.rewards.map((r) => r.key).sort();
  assert.deepEqual(keys, ['session_first', 'session_replay']);
  assert.ok(
    mine.body.rewards.every((r) => r.awardedAt),
    'date d’obtention conservée',
  );

  // Une nouvelle fin n'annonce rien de neuf et ne duplique aucune ligne.
  const third = await complete();
  assert.deepEqual(third.body.rewards, []);
  const counts = await queryAll(
    'SELECT reward_key, COUNT(*) AS n FROM user_rewards WHERE user_id = ? GROUP BY reward_key',
    [studentId],
  );
  assert.equal(counts.length, 2);
  assert.ok(
    counts.every((row) => Number(row.n) === 1),
    'un badge = une ligne',
  );
});
