'use strict';

// Portée « question seule » (`cooldown_scope = 'question'`) BRANCHÉE — lot 3 de
// docs/AUDIT_VALIDATION_QUIZ_2026-09.md (constat A1 : l'écriture existait, aucune lecture).
//
// Deux questions bloquantes Q1 et Q2 sur un tutoriel, verrou de 6 h :
//   - mode « une suffit » : Q1 ratée → Q1 bloquée, Q2 posée tout de suite, réussie → accusé 200 ;
//   - mode « toutes » : Q1 ratée, Q2 réussie → accusé 403 (portée question, délai de Q1) ;
//   - une question verrouillée n'est ni présentée ni répondue dans le flux (403 + cooldown) ;
//   - le résumé (chemin groupé) dit la même chose que le challenge (chemin unitaire) ;
//   - la tolérance se compte par question.

require('./helpers/setup');
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { setSetting } = require('../lib/settings');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const catSlug = `qscat${stamp}`.slice(0, 64);
const q1 = `QS1${stamp}`.slice(0, 16);
const q2 = `QS2${stamp}`.slice(0, 16);
let tutorialId = 0;
let studentToken = '';
let studentUserId = '';
let teacherToken = '';

const student = () => ({ Authorization: `Bearer ${studentToken}` });
const teacher = () => ({ Authorization: `Bearer ${teacherToken}` });
const ref = () => String(tutorialId);
const withContext = () =>
  `?resourceType=tutorial&resourceRef=${encodeURIComponent(String(tutorialId))}`;

function present(code, query = withContext()) {
  return request(app).get(`/api/quiz/questions/${code}/present${query}`).set(student());
}

function answer(code, presentation, { correct }) {
  const choice = presentation.choices.find((c) => (c.text === 'Bonne') === correct);
  return request(app)
    .post(`/api/quiz/questions/${code}/answer`)
    .set(student())
    .send({ presentationToken: presentation.presentationToken, choiceId: choice.id });
}

async function failQuestion(code) {
  const shown = await present(code).expect(200);
  return answer(code, shown.body, { correct: false });
}

async function passQuestion(code) {
  const shown = await present(code).expect(200);
  return answer(code, shown.body, { correct: true });
}

async function challenge() {
  const res = await request(app)
    .get(`/api/learning/gating/challenge?resourceType=tutorial&resourceRef=${tutorialId}`)
    .set(student())
    .expect(200);
  return res.body;
}

async function summaryItem() {
  const res = await request(app)
    .get(`/api/learning/gating/summary?resourceType=tutorial&resourceRefs=${tutorialId}`)
    .set(student())
    .expect(200);
  return res.body.items.find((i) => i.resource_ref === ref());
}

function acknowledge() {
  return request(app)
    .post(`/api/tutorials/${tutorialId}/acknowledge-read`)
    .set(student())
    .send({ confirm: true });
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
    "INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'QS', 'sciences', 999)",
    [catSlug],
  );
  for (const [code, n] of [
    [q1, 1],
    [q2, 2],
  ]) {
    await execute(
      `INSERT IGNORE INTO quiz_questions
        (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
       VALUES (?, ?, ?, 'Quelle réponse ?', 'Bonne', 'Fausse 1', 'Fausse 2', 'A', 'college', 'actif')`,
      [code, catSlug, n],
    );
  }
  const tut = await execute(
    "INSERT INTO tutorials (title, slug, type, is_active, created_at, updated_at) VALUES ('QS tuto', ?, 'html', 1, NOW(), NOW())",
    [`qs-tuto-${stamp}`.slice(0, 80)],
  );
  tutorialId = tut.insertId;
  for (const code of [q1, q2]) {
    await execute(
      `INSERT IGNORE INTO resource_question_links
        (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
       VALUES ('tutorial', ?, ?, 1, 1, 'manual', 'approved')`,
      [ref(), code],
    );
  }
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Scope',
      lastName: `Question${stamp}`,
      pseudo: `qscope${stamp}`.slice(0, 40),
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
  await setSetting('learning.gating.cooldown_scope', 'question', {});
  await setSetting('learning.gating.max_questions_per_session', 3, {});
});

beforeEach(async () => {
  await execute('DELETE FROM user_quiz_attempts WHERE user_id = ?', [studentUserId]);
  await execute('DELETE FROM resource_gating_cooldowns WHERE user_id = ?', [studentUserId]);
  await execute('DELETE FROM user_tutorial_reads WHERE user_id = ?', [studentUserId]);
  await execute(
    "DELETE FROM resource_gating_policy WHERE resource_type = 'tutorial' AND resource_ref IN (?, '*')",
    [ref()],
  );
  await setSetting('learning.gating.enabled', true, {});
  await setSetting('learning.gating.default_mode', 'any', {});
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {});
  await setSetting('learning.gating.cooldown_scope', 'question', {});
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  await setSetting('learning.gating.cooldown_scope', 'resource', {}).catch(() => {});
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {}).catch(() => {});
  if (studentUserId) {
    await execute('DELETE FROM users WHERE id = ?', [studentUserId]).catch(() => {});
  }
  await execute(
    "DELETE FROM resource_gating_policy WHERE resource_type = 'tutorial' AND resource_ref IN (?, '*')",
    [ref()],
  ).catch(() => {});
  await execute('DELETE FROM resource_question_links WHERE question_code IN (?, ?)', [
    q1,
    q2,
  ]).catch(() => {});
  await execute('DELETE FROM quiz_questions WHERE question_code IN (?, ?)', [q1, q2]).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  if (tutorialId) await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
});

test('mode « une suffit » — Q1 ratée ne bloque que Q1 : Q2 est posée, réussie, accusé accepté', async () => {
  const wrong = await failQuestion(q1);
  assert.equal(wrong.status, 200);
  assert.equal(wrong.body.cooldown?.locked, true);
  assert.equal(wrong.body.cooldown.scope, 'question');
  assert.equal(wrong.body.cooldown.locked_question_code, q1);

  const state = await challenge();
  assert.equal(state.cooldown_scope, 'question');
  assert.equal(state.cooldown.locked, false, 'la fiche reste ouverte : Q2 est posable');
  assert.deepEqual(state.cooldown.locked_questions, [q1]);
  const entry1 = state.questions.find((q) => q.question_code === q1);
  const entry2 = state.questions.find((q) => q.question_code === q2);
  assert.equal(entry1.locked, true);
  assert.match(entry1.remaining_label, /h|min/);
  assert.equal(entry2.locked, false);
  assert.equal(state.ask_count, 1, 'une seule question posable maintenant');

  // Q1 verrouillée : ni présentable ni répondable dans le flux.
  const refused = await present(q1).expect(403);
  assert.equal(refused.body.cooldown?.locked, true);
  assert.match(refused.body.error, /bloquée/);
  await present(q1, '').expect(200); // hors flux (Quiz libre), rien n'est refusé

  const item = await summaryItem();
  assert.equal(item.locked, false, 'le résumé dit la même chose que le challenge');
  assert.equal(item.ask_count, 1);

  const right = await passQuestion(q2);
  assert.equal(right.body.correct, true);
  assert.equal((await challenge()).satisfied, true);
  await acknowledge().expect(200);
});

test('mode « toutes » — Q1 ratée, Q2 réussie : la fiche attend la levée de Q1', async () => {
  await setSetting('learning.gating.default_mode', 'all', {});
  await failQuestion(q1);
  await passQuestion(q2);

  const state = await challenge();
  assert.equal(state.satisfied, false);
  assert.equal(state.pending_count, 1);
  assert.equal(state.ask_count, 0, 'plus rien à poser');
  assert.equal(state.cooldown.locked, true, 'aucune question posable : verrou de portée question');
  assert.equal(state.cooldown.scope, 'question');
  assert.deepEqual(state.cooldown.locked_questions, [q1]);
  assert.ok(state.cooldown.remaining_hours >= 1 && state.cooldown.remaining_hours <= 6);

  const item = await summaryItem();
  assert.equal(item.locked, true, 'résumé = challenge');
  assert.equal(item.pending_count, 1);

  const refused = await acknowledge().expect(403);
  assert.match(refused.body.error, /question ratée est bloquée/);
  assert.deepEqual(refused.body.missing_question_codes, [q1]);
  assert.equal(refused.body.cooldown.scope, 'question');

  // Le professeur lève le verrou de la question (clé = code de la question).
  await request(app)
    .delete('/api/learning-links/locks')
    .set(teacher())
    .send({
      user_id: studentUserId,
      resource_type: 'tutorial',
      resource_ref: ref(),
      question_code: q1,
    })
    .expect(200);
  assert.equal((await challenge()).cooldown.locked, false);
  await passQuestion(q1);
  await acknowledge().expect(200);
});

test('réponse à une question verrouillée entre-temps : refusée avant d’être comptée', async () => {
  const shown = await present(q1).expect(200);
  // Un autre onglet rate Q1 pendant ce temps.
  await failQuestion(q1);
  const late = await answer(q1, shown.body, { correct: true });
  assert.equal(late.status, 403);
  assert.equal(late.body.cooldown?.locked, true);
  const state = await challenge();
  assert.equal(
    state.questions.find((q) => q.question_code === q1).already_correct,
    false,
    'la bonne réponse tardive n’a pas été enregistrée',
  );
});

test('tolérance par question — deux fautes sur Q1 puis Q2 n’épuisent pas la même série', async () => {
  await setSetting('learning.gating.allowed_wrong_attempts', 1, {});
  const first = await failQuestion(q1);
  assert.equal(first.body.cooldown?.locked, false);
  assert.equal(first.body.cooldown.wrong_attempts, 1);
  const other = await failQuestion(q2);
  assert.equal(other.body.cooldown?.locked, false, 'la faute sur Q2 démarre sa propre série');
  assert.equal(other.body.cooldown.wrong_attempts, 1);
  const state = await challenge();
  assert.equal(state.cooldown.locked, false);
  assert.equal(state.questions.find((q) => q.question_code === q1).wrong_attempts, 1);
  const second = await failQuestion(q1);
  assert.equal(second.body.cooldown?.locked, true, 'deuxième faute sur Q1 : Q1 se bloque');
  assert.equal(second.body.cooldown.scope, 'question');
});

test('portée « ressource » (défaut) — Q1 ratée bloque toute la fiche, Q2 comprise', async () => {
  await setSetting('learning.gating.cooldown_scope', 'resource', {});
  await failQuestion(q1);
  const state = await challenge();
  assert.equal(state.cooldown.locked, true);
  assert.equal(state.cooldown.scope, 'resource');
  assert.equal(state.ask_count, 0);
  await present(q2).expect(403);
  await acknowledge().expect(403);
});

test('préréglage par type — la portée « question » se règle aussi par type de ressource', async () => {
  await setSetting('learning.gating.cooldown_scope', 'resource', {});
  await setTypePolicy({ cooldown_scope: 'question' });
  assert.equal((await challenge()).cooldown_scope, 'question');
  await failQuestion(q1);
  assert.equal((await challenge()).cooldown.locked, false);
});
