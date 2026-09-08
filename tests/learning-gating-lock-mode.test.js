'use strict';

// Sévérité du verrou (`lock_mode`) et délai en heures — lot 2 de
// docs/AUDIT_VALIDATION_QUIZ_2026-09.md (A4, A5, A6, A8), côté ForetMap.
//
// Ce que ce fichier verrouille :
//   - `flow` (défaut) : le contexte ressource est gravé dans le jeton à la présentation ;
//     un contexte envoyé dans le corps sans jeton contextualisé est ignoré ;
//   - `advisory` : comportement historique, le corps est honoré ;
//   - `strict` : une question réservée n'est ni présentable hors flux (403) ni tirée au hasard ;
//   - l'interrupteur global reste maître : conditionnement éteint, rien n'est réservé ;
//   - le parcours complet : erreur avec contexte → verrou 6 h → 403 à l'accusé → levée par le
//     prof → bonne réponse → accusé 200 ;
//   - A6 : le compteur d'erreurs sous tolérance est relu par le challenge ;
//   - A5 : une question archivée ne conditionne plus rien ;
//   - A8 : une ressource déjà validée n'est plus annoncée par le résumé.

require('./helpers/setup');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { setSetting } = require('../lib/settings');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const catSlug = `lmcat${stamp}`.slice(0, 64);
const qcode = `QLM${stamp}`.slice(0, 16);
let tutorialId = 0;
let studentToken = '';
let studentUserId = '';
let teacherToken = '';

const student = () => ({ Authorization: `Bearer ${studentToken}` });
const teacher = () => ({ Authorization: `Bearer ${teacherToken}` });
const ref = () => String(tutorialId);
const withContext = () =>
  `?resourceType=tutorial&resourceRef=${encodeURIComponent(String(tutorialId))}`;

function present(query = '') {
  return request(app).get(`/api/quiz/questions/${qcode}/present${query}`).set(student());
}

/** Répond à une présentation : `correct` choisit la bonne réponse (texte 'Bonne'). */
function answer(presentation, { correct, body = {} }) {
  const choice = presentation.choices.find((c) => (c.text === 'Bonne') === correct);
  return request(app)
    .post(`/api/quiz/questions/${qcode}/answer`)
    .set(student())
    .send({ presentationToken: presentation.presentationToken, choiceId: choice.id, ...body });
}

async function challenge() {
  const res = await request(app)
    .get(`/api/learning/gating/challenge?resourceType=tutorial&resourceRef=${tutorialId}`)
    .set(student())
    .expect(200);
  return res.body;
}

async function setTypePolicy(patch) {
  await request(app)
    .put('/api/learning-links/type-policy')
    .set(teacher())
    .send({ resource_type: 'tutorial', ...patch })
    .expect(200);
}

before(async () => {
  await initSchema();
  teacherToken = await ensureAdminTeacherAuthToken();
  await execute(
    "INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'LM', 'sciences', 999)",
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
     VALUES (?, ?, 1, 'Quelle réponse ?', 'Bonne', 'Fausse 1', 'Fausse 2', 'A', 'college', 'actif')`,
    [qcode, catSlug],
  );
  const tut = await execute(
    "INSERT INTO tutorials (title, slug, type, is_active, created_at, updated_at) VALUES ('LM tuto', ?, 'html', 1, NOW(), NOW())",
    [`lm-tuto-${stamp}`.slice(0, 80)],
  );
  tutorialId = tut.insertId;
  await execute(
    `INSERT IGNORE INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('tutorial', ?, ?, 1, 1, 'manual', 'approved')`,
    [ref(), qcode],
  );
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Lock',
      lastName: `Mode${stamp}`,
      pseudo: `lockmode${stamp}`.slice(0, 40),
      password: 'testpass1234',
      affiliation: 'both',
    })
    .expect(201);
  studentToken = reg.body.authToken;
  studentUserId = reg.body.id;
  await setSetting('learning.gating.enabled', true, {});
  await setSetting('learning.gating.default_mode', 'any', {});
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {});
  await setSetting('learning.gating.retry_cooldown_hours', 6, {});
  await setSetting('learning.gating.lock_mode', 'flow', {});
  await setSetting('learning.gating.cooldown_scope', 'resource', {});
});

beforeEach(async () => {
  await execute('DELETE FROM user_quiz_attempts WHERE user_id = ?', [studentUserId]);
  await execute('DELETE FROM resource_gating_cooldowns WHERE user_id = ?', [studentUserId]);
  await execute('DELETE FROM user_tutorial_reads WHERE user_id = ?', [studentUserId]);
  await execute(
    "DELETE FROM resource_gating_policy WHERE resource_type = 'tutorial' AND resource_ref IN (?, '*')",
    [ref()],
  );
  await execute("UPDATE quiz_questions SET statut = 'actif' WHERE question_code = ?", [qcode]);
  await setSetting('learning.gating.enabled', true, {});
  await setSetting('learning.gating.lock_mode', 'flow', {});
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {});
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  await setSetting('learning.gating.lock_mode', 'flow', {}).catch(() => {});
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {}).catch(() => {});
  if (studentUserId) {
    await execute('DELETE FROM users WHERE id = ?', [studentUserId]).catch(() => {});
  }
  await execute(
    "DELETE FROM resource_gating_policy WHERE resource_type = 'tutorial' AND resource_ref IN (?, '*')",
    [ref()],
  ).catch(() => {});
  await execute('DELETE FROM resource_question_links WHERE question_code = ?', [qcode]).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_questions WHERE question_code = ?', [qcode]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  if (tutorialId) await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
});

test('flow (défaut) — le contexte du corps est ignoré : pas de verrou sans jeton contextualisé', async () => {
  const state = await challenge();
  assert.equal(state.lock_mode, 'flow');
  assert.equal(state.retry_cooldown_hours, 6, 'délai réglé plus haut par ce test : 6 h');
  assert.equal(state.retry_cooldown_label, '6 h');

  const free = await present().expect(200);
  assert.equal(free.body.resource, null, 'présentation libre : aucun contexte');
  const res = await answer(free.body, {
    correct: false,
    body: { resourceType: 'tutorial', resourceRef: ref() },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.correct, false);
  assert.equal(res.body.cooldown, undefined, 'le corps ne pose aucun verrou en sévérité normale');
  assert.equal((await challenge()).cooldown.locked, false);
});

test('flow — parcours complet : erreur avec jeton contextualisé → verrou 6 h → 403 → levée → accusé', async () => {
  const shown = await present(withContext()).expect(200);
  assert.deepEqual(shown.body.resource, { type: 'tutorial', ref: ref() });

  const wrong = await answer(shown.body, { correct: false });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.body.cooldown?.locked, true, 'une erreur dans le flux pose le verrou');
  assert.equal(wrong.body.cooldown.retry_hours, 6);
  assert.equal(wrong.body.cooldown.retry_label, '6 h');
  assert.ok(wrong.body.cooldown.remaining_hours >= 1 && wrong.body.cooldown.remaining_hours <= 6);
  assert.match(wrong.body.cooldown.remaining_label, /h|min/);

  const locked = await challenge();
  assert.equal(locked.cooldown.locked, true);

  const refused = await request(app)
    .post(`/api/tutorials/${tutorialId}/acknowledge-read`)
    .set(student())
    .send({ confirm: true })
    .expect(403);
  assert.equal(refused.body.cooldown?.locked, true);
  assert.match(refused.body.error, /réessaie dans/);

  // Le professeur lève le verrou.
  await request(app)
    .delete('/api/learning-links/locks')
    .set(teacher())
    .send({ user_id: studentUserId, resource_type: 'tutorial', resource_ref: ref() })
    .expect(200);

  const again = await present(withContext()).expect(200);
  const right = await answer(again.body, { correct: true });
  assert.equal(right.body.correct, true);
  assert.equal((await challenge()).satisfied, true);
  await request(app)
    .post(`/api/tutorials/${tutorialId}/acknowledge-read`)
    .set(student())
    .send({ confirm: true })
    .expect(200);
});

test('présentation — un contexte qui ne correspond à aucun lien bloquant est refusé (400)', async () => {
  const res = await present(`?resourceType=tutorial&resourceRef=999999999`).expect(400);
  assert.match(res.body.error, /ne conditionne pas/);
  await present(`?resourceType=zone&resourceRef=1`).expect(400);
});

test('advisory — le contexte du corps est honoré (comportement historique)', async () => {
  await setTypePolicy({ lock_mode: 'advisory' });
  assert.equal((await challenge()).lock_mode, 'advisory');
  const free = await present().expect(200);
  const res = await answer(free.body, {
    correct: false,
    body: { resourceType: 'tutorial', resourceRef: ref() },
  });
  assert.equal(res.body.cooldown?.locked, true, 'en sévérité souple, le corps suffit');
});

test('strict — question réservée : refusée hors flux, exclue du tirage, présentable avec contexte', async () => {
  await setTypePolicy({ lock_mode: 'strict' });
  assert.equal((await challenge()).lock_mode, 'strict');

  const refused = await present().expect(403);
  assert.match(refused.body.error, /depuis la fiche/);
  assert.deepEqual(refused.body.reserved_for, [{ type: 'tutorial', ref: ref() }]);

  const draw = await request(app)
    .get(`/api/quiz/draw?categorieSlug=${encodeURIComponent(catSlug)}&niveau=college`)
    .set(student());
  assert.equal(draw.status, 404, 'la seule question de la catégorie est réservée');

  const shown = await present(withContext()).expect(200);
  assert.deepEqual(shown.body.resource, { type: 'tutorial', ref: ref() });

  // Interrupteur global maître : éteint, plus rien n'est réservé.
  await setSetting('learning.gating.enabled', false, {});
  await present().expect(200);
  const drawn = await request(app)
    .get(`/api/quiz/draw?categorieSlug=${encodeURIComponent(catSlug)}&niveau=college`)
    .set(student())
    .expect(200);
  assert.equal(drawn.body.question_code, qcode);
});

test('A6 — le compteur d’erreurs sous tolérance est relu par le challenge', async () => {
  await setSetting('learning.gating.allowed_wrong_attempts', 2, {});
  const shown = await present(withContext()).expect(200);
  const wrong = await answer(shown.body, { correct: false });
  assert.equal(wrong.body.cooldown?.locked, false);
  assert.equal(wrong.body.cooldown.wrong_attempts, 1);
  assert.equal(wrong.body.cooldown.attempts_left, 1);
  const state = await challenge();
  assert.equal(state.cooldown.locked, false);
  assert.equal(state.cooldown.wrong_attempts, 1, 'la faute consommée est visible avant le clic');
});

test('A5 — une question archivée ne conditionne plus rien', async () => {
  assert.equal((await challenge()).required, true);
  await execute("UPDATE quiz_questions SET statut = 'inactif' WHERE question_code = ?", [qcode]);
  const state = await challenge();
  assert.equal(state.required, false, 'plus aucune question bloquante active');
  await request(app)
    .post(`/api/tutorials/${tutorialId}/acknowledge-read`)
    .set(student())
    .send({ confirm: true })
    .expect(200);
});

test('A8 — une ressource déjà validée n’est plus annoncée par le résumé', async () => {
  await execute(
    `INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct) VALUES (?, ?, ?, 1)`,
    [studentUserId, qcode, catSlug],
  );
  await request(app)
    .post(`/api/tutorials/${tutorialId}/acknowledge-read`)
    .set(student())
    .send({ confirm: true })
    .expect(200);
  const res = await request(app)
    .get(`/api/learning/gating/summary?resourceType=tutorial&resourceRefs=${tutorialId}`)
    .set(student())
    .expect(200);
  const item = res.body.items.find((i) => i.resource_ref === ref());
  assert.equal(item.required, false, 'déjà lu : rien à conditionner');
});
