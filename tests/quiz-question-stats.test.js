'use strict';

// Taux de réussite par question : repérer les questions que tout le monde rate
// (le plus souvent mal formulées plutôt que difficiles).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const stats = require('../lib/quizQuestionStats');

const stamp = Date.now();
const catSlug = `statcat${stamp}`.slice(0, 64);
const facile = `QSF${stamp}`.slice(0, 16);
const ratee = `QSR${stamp}`.slice(0, 16);
let token = '';
let userId = '';

const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  userId = (
    await queryOne("SELECT id FROM users WHERE user_type = 'teacher' ORDER BY created_at LIMIT 1")
  ).id;

  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Test stats', 'jardinage', 995)`,
    [catSlug],
  );
  for (const [i, code] of [facile, ratee].entries()) {
    await execute(
      `INSERT IGNORE INTO quiz_questions
        (question_code, categorie_slug, numero_dans_categorie, question,
         choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
       VALUES (?, ?, ?, ?, 'A', 'B', 'C', 'A', 'college', 'actif')`,
      [code, catSlug, i + 1, `Question ${code} ?`],
    );
  }
  // Question réussie 8 fois sur 10 ; question ratée 9 fois sur 10.
  for (let i = 0; i < 10; i += 1) {
    await execute(
      `INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct)
       VALUES (?, ?, ?, ?)`,
      [userId, facile, catSlug, i < 8 ? 1 : 0],
    );
    await execute(
      `INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct)
       VALUES (?, ?, ?, ?)`,
      [userId, ratee, catSlug, i < 1 ? 1 : 0],
    );
  }
});

after(async () => {
  for (const code of [facile, ratee]) {
    await execute('DELETE FROM user_quiz_attempts WHERE question_code = ?', [code]).catch(() => {});
    await execute('DELETE FROM resource_question_links WHERE question_code = ?', [code]).catch(
      () => {},
    );
    await execute('DELETE FROM quiz_questions WHERE question_code = ?', [code]).catch(() => {});
  }
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
});

test('decorate — le signalement exige assez de tentatives', () => {
  // Sur deux essais, 0 % ne veut rien dire : pas de signalement.
  assert.equal(stats.decorate({ question_code: 'Q', attempts: 2, correct: 0 }).suspect, false);
  assert.equal(stats.decorate({ question_code: 'Q', attempts: 10, correct: 2 }).suspect, true);
  assert.equal(stats.decorate({ question_code: 'Q', attempts: 10, correct: 8 }).suspect, false);
});

test('decorate — taux et compteurs cohérents', () => {
  const d = stats.decorate({ question_code: 'Q', attempts: 10, correct: 3, learners: 4 });
  assert.equal(d.success_rate, 0.3);
  assert.equal(d.wrong, 7);
  assert.equal(d.learners, 4);
});

test('decorate — aucune tentative : pas de taux inventé', () => {
  const d = stats.decorate({ question_code: 'Q', attempts: 0, correct: 0 });
  assert.equal(d.success_rate, null);
  assert.equal(d.suspect, false);
});

test('refus sans authentification', async () => {
  const res = await request(app).get('/api/quiz/admin/questions/stats');
  assert.ok([401, 403].includes(res.status), `statut inattendu ${res.status}`);
});

test('les questions les plus ratées arrivent en tête', async () => {
  const res = await request(app).get('/api/quiz/admin/questions/stats?minAttempts=5').set(auth());
  assert.equal(res.status, 200);
  const codes = res.body.stats.map((s) => s.question_code);
  const iRatee = codes.indexOf(ratee);
  const iFacile = codes.indexOf(facile);
  assert.ok(iRatee >= 0 && iFacile >= 0, 'les deux questions de test doivent remonter');
  assert.ok(iRatee < iFacile, 'la question ratée doit précéder la question réussie');
});

test('la question ratée est signalée, la question réussie ne l’est pas', async () => {
  const res = await request(app).get('/api/quiz/admin/questions/stats?minAttempts=5').set(auth());
  const byCode = new Map(res.body.stats.map((s) => [s.question_code, s]));
  assert.equal(byCode.get(ratee).suspect, true);
  assert.equal(byCode.get(ratee).success_rate, 0.1);
  assert.equal(byCode.get(facile).suspect, false);
  assert.equal(byCode.get(facile).success_rate, 0.8);
});

test('l’énoncé accompagne le code, pour juger sans aller le chercher', async () => {
  const res = await request(app).get('/api/quiz/admin/questions/stats?minAttempts=5').set(auth());
  const mine = res.body.stats.find((s) => s.question_code === ratee);
  assert.equal(mine.question, `Question ${ratee} ?`);
  assert.equal(mine.categorie_slug, catSlug);
});

test('minAttempts écarte les questions trop peu jouées', async () => {
  const res = await request(app).get('/api/quiz/admin/questions/stats?minAttempts=50').set(auth());
  const codes = res.body.stats.map((s) => s.question_code);
  assert.ok(!codes.includes(ratee));
});

test('onlyGating ne garde que les questions qui bloquent réellement', async () => {
  const sans = await request(app)
    .get('/api/quiz/admin/questions/stats?minAttempts=5&onlyGating=1')
    .set(auth());
  assert.ok(!sans.body.stats.some((s) => s.question_code === ratee));

  await execute(
    `INSERT IGNORE INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, status, origin)
     VALUES ('tutorial', '999999', ?, 1, 'approved', 'manual')`,
    [ratee],
  );
  const avec = await request(app)
    .get('/api/quiz/admin/questions/stats?minAttempts=5&onlyGating=1')
    .set(auth());
  const mine = avec.body.stats.find((s) => s.question_code === ratee);
  assert.ok(mine, 'la question devenue bloquante doit apparaître');
  assert.equal(mine.is_gating, true);
});

test('les seuils de signalement sont annoncés au client', async () => {
  const res = await request(app).get('/api/quiz/admin/questions/stats').set(auth());
  assert.equal(res.body.min_attempts_for_flag, stats.MIN_ATTEMPTS_FOR_FLAG);
  assert.equal(res.body.suspect_success_rate, stats.SUSPECT_SUCCESS_RATE);
});
