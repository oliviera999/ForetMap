'use strict';

// Résumé groupé du conditionnement (GET /api/learning/gating/summary) : c'est lui
// qui permet d'annoncer le contrôle AVANT que l'élève ne clique sur « Marquer comme lu ».

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { setSetting } = require('../lib/settings');

const stamp = Date.now();
const catSlug = `sumcat${stamp}`.slice(0, 64);
const qcode = `QSU${stamp}`.slice(0, 16);
const slug = `tuto-summary-${stamp}`.slice(0, 190);
let token = '';
let tutorialId = 0;

const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();

  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Test résumé', 'jardinage', 997)`,
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
     VALUES (?, ?, 1, 'Question résumé ?', 'A', 'B', 'C', 'A', 'college', 'actif')`,
    [qcode, catSlug],
  );
  await execute(
    `INSERT INTO tutorials (title, slug, type, summary, is_active, sort_order)
     VALUES (?, ?, 'html', 'Résumé de test.', 1, 899)`,
    [`Tuto résumé ${stamp}`, slug],
  );
  tutorialId = Number(
    (await queryOne('SELECT id FROM tutorials WHERE slug = ? LIMIT 1', [slug])).id,
  );

  await execute(
    `INSERT IGNORE INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, status, origin)
     VALUES ('tutorial', ?, ?, 1, 'approved', 'manual')`,
    [String(tutorialId), qcode],
  );
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  await execute('DELETE FROM resource_question_links WHERE question_code = ?', [qcode]).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_questions WHERE question_code = ?', [qcode]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  if (tutorialId) {
    await execute('DELETE FROM resource_gating_cooldowns WHERE resource_ref = ?', [
      String(tutorialId),
    ]).catch(() => {});
    await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
  }
});

test('refus sans authentification', async () => {
  const res = await request(app).get('/api/learning/gating/summary?resourceType=tutorial');
  assert.ok([401, 403].includes(res.status), `statut inattendu ${res.status}`);
});

test('type de ressource invalide → 400', async () => {
  const res = await request(app)
    .get('/api/learning/gating/summary?resourceType=chaussette&resourceRefs=1')
    .set(auth());
  assert.equal(res.status, 400);
});

test('sans références, renvoie une liste vide sans erreur', async () => {
  const res = await request(app)
    .get('/api/learning/gating/summary?resourceType=tutorial&resourceRefs=')
    .set(auth());
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.items, []);
});

test('conditionnement éteint : rien n’est requis', async () => {
  await setSetting('learning.gating.enabled', false, {});
  const res = await request(app)
    .get(`/api/learning/gating/summary?resourceType=tutorial&resourceRefs=${tutorialId}`)
    .set(auth());
  assert.equal(res.status, 200);
  const item = res.body.items.find((i) => i.resource_ref === String(tutorialId));
  assert.ok(item);
  assert.equal(item.required, false);
  assert.equal(item.ask_count, 0);
});

test('conditionnement allumé : le résumé annonce la question à venir', async () => {
  await setSetting('learning.gating.enabled', true, {});
  const res = await request(app)
    .get(`/api/learning/gating/summary?resourceType=tutorial&resourceRefs=${tutorialId}`)
    .set(auth());
  assert.equal(res.status, 200);
  const item = res.body.items.find((i) => i.resource_ref === String(tutorialId));
  assert.ok(item, 'le tutoriel doit figurer dans le résumé');
  assert.equal(item.required, true);
  assert.equal(item.pending_count, 1);
  assert.equal(item.ask_count, 1, 'une question sera bien posée');
  assert.equal(item.satisfied, false);
  assert.equal(item.locked, false);
  assert.equal(typeof item.retry_days, 'number');
});

test('plusieurs ressources en un seul appel, doublons dédupliqués', async () => {
  await setSetting('learning.gating.enabled', true, {});
  const refs = `${tutorialId},${tutorialId},999999`;
  const res = await request(app)
    .get(`/api/learning/gating/summary?resourceType=tutorial&resourceRefs=${refs}`)
    .set(auth());
  assert.equal(res.status, 200);
  const mine = res.body.items.filter((i) => i.resource_ref === String(tutorialId));
  assert.equal(mine.length, 1, 'un doublon ne doit pas produire deux entrées');
});

test('le plafond par session borne ce qui sera posé maintenant', async () => {
  await setSetting('learning.gating.enabled', true, {});
  await setSetting('learning.gating.max_questions_per_session', 1, {});
  const res = await request(app)
    .get(`/api/learning/gating/summary?resourceType=tutorial&resourceRefs=${tutorialId}`)
    .set(auth());
  const item = res.body.items.find((i) => i.resource_ref === String(tutorialId));
  assert.ok(item.ask_count <= 1);
  await setSetting('learning.gating.max_questions_per_session', 3, {});
});
