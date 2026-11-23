'use strict';

// `GET /api/tutorials/:id` → `linked_id_keys` : lecture inverse du lien clé ↔ tutoriel
// (`id_key_tutorials`, migration `id_keys_credits_chemins_tutoriels`). Suite proposée par le
// flux F2 du chantier CPT. Même visibilité que `GET /api/id-keys` : clés publiées ; brouillons
// pour `id_keys.manage` ; module des clés éteint → liste vide, sauf pour le gestionnaire.
// Tests BDD partagée : exécution séquentielle ; le réglage retrouve son état d'avant.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { snapshotSetting, restoreSetting } = require('./helpers/settingsSnapshot');

const MODULE_KEY = 'ui.modules.id_keys_enabled';
const stamp = Date.now().toString(36);
let adminToken = '';
let tutorialId = 0;
let lonelyTutorialId = 0;
const keyIds = {};
let snapshot = null;

const admin = () => ({ Authorization: `Bearer ${adminToken}` });

async function setModule(value) {
  await request(app)
    .put(`/api/settings/admin/${MODULE_KEY}`)
    .set(admin())
    .send({ value })
    .expect(200);
}

async function insertKey(slug, title, published) {
  const r = await execute(`INSERT INTO id_keys (slug, title, is_published) VALUES (?, ?, ?)`, [
    slug,
    title,
    published ? 1 : 0,
  ]);
  return r.insertId;
}

async function insertTutorial(title, slug) {
  return (
    await execute(
      `INSERT INTO tutorials (title, slug, type, summary, html_content, is_active, sort_order)
       VALUES (?, ?, 'html', NULL, '<p>clés liées</p>', 1, 961)`,
      [title, slug],
    )
  ).insertId;
}

before(async () => {
  await initSchema();
  adminToken = await ensureAdminTeacherAuthToken({ extraPermissions: ['id_keys.manage'] });
  snapshot = await snapshotSetting(MODULE_KEY);
  await setModule(true);
  tutorialId = await insertTutorial(`Tutoriel clés ${stamp}`, `tuto-cles-${stamp}`);
  lonelyTutorialId = await insertTutorial(`Tutoriel seul ${stamp}`, `tuto-seul-${stamp}`);
  // Titres choisis pour vérifier l'ordre alphabétique, indépendant de l'ordre d'insertion.
  keyIds.zeta = await insertKey(`cle-zeta-${stamp}`, `Zeta clé ${stamp}`, true);
  keyIds.alpha = await insertKey(`cle-alpha-${stamp}`, `Alpha clé ${stamp}`, true);
  keyIds.draft = await insertKey(`cle-brouillon-${stamp}`, `Brouillon clé ${stamp}`, false);
  let order = 0;
  for (const id of [keyIds.zeta, keyIds.alpha, keyIds.draft]) {
    await execute(
      'INSERT INTO id_key_tutorials (key_id, tutorial_id, sort_order) VALUES (?, ?, ?)',
      [id, tutorialId, order],
    );
    order += 1;
  }
});

after(async () => {
  await restoreSetting(snapshot);
  for (const id of Object.values(keyIds)) {
    await execute('DELETE FROM id_keys WHERE id = ?', [id]).catch(() => {});
  }
  for (const id of [tutorialId, lonelyTutorialId]) {
    await execute('DELETE FROM tutorials WHERE id = ?', [id]).catch(() => {});
  }
});

const ids = (res) => res.body.linked_id_keys.map((k) => k.id);

test('linked_id_keys : clés publiées seulement, triées par titre, sans authentification', async () => {
  const res = await request(app).get(`/api/tutorials/${tutorialId}`).expect(200);
  assert.deepEqual(ids(res), [keyIds.alpha, keyIds.zeta]);
  assert.deepEqual(res.body.linked_id_keys[0], {
    id: keyIds.alpha,
    slug: `cle-alpha-${stamp}`,
    title: `Alpha clé ${stamp}`,
    is_published: true,
  });
});

test('linked_id_keys : le gestionnaire des clés voit aussi les brouillons', async () => {
  const res = await request(app).get(`/api/tutorials/${tutorialId}`).set(admin()).expect(200);
  assert.deepEqual(ids(res), [keyIds.alpha, keyIds.draft, keyIds.zeta]);
  const draft = res.body.linked_id_keys.find((k) => k.id === keyIds.draft);
  assert.equal(draft.is_published, false);
});

test('linked_id_keys : tableau vide pour un tutoriel sans clé', async () => {
  const res = await request(app).get(`/api/tutorials/${lonelyTutorialId}`).expect(200);
  assert.deepEqual(res.body.linked_id_keys, []);
});

test('linked_id_keys : module des clés éteint → vide pour le public, intact pour le gestionnaire', async () => {
  await setModule(false);
  try {
    const pub = await request(app).get(`/api/tutorials/${tutorialId}`).expect(200);
    assert.deepEqual(pub.body.linked_id_keys, []);
    const mgr = await request(app).get(`/api/tutorials/${tutorialId}`).set(admin()).expect(200);
    assert.deepEqual(ids(mgr), [keyIds.alpha, keyIds.draft, keyIds.zeta]);
  } finally {
    await setModule(true);
  }
});

test('linked_id_keys : la clé supprimée disparaît (ON DELETE CASCADE)', async () => {
  await execute('DELETE FROM id_keys WHERE id = ?', [keyIds.zeta]);
  delete keyIds.zeta;
  const res = await request(app).get(`/api/tutorials/${tutorialId}`).expect(200);
  assert.deepEqual(ids(res), [keyIds.alpha]);
});
