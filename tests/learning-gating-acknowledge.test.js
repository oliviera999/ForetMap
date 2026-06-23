'use strict';

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { setSetting } = require('../lib/settings');
const glSettings = require('../lib/glSettings');
const runtime = require('../lib/learningGatingRuntime');
const acknowledge = require('../lib/learningGatingAcknowledge');

const db = require('../database');
const stamp = Date.now();
const qcode = `QFR${stamp}`.slice(0, 16);
const catSlug = `rtcat${stamp}`.slice(0, 64);
const glq = `GQR${stamp}`.slice(0, 16);
const speciesRef = `SPR${stamp}`.slice(0, 64);
const userId = `rt-student-${stamp}`.slice(0, 64);
const reader = { userType: 'gl_player', userId: `9${stamp}`.slice(0, 12) };
let tutorialId = null;
let studentToken = '';
let studentUserId = '';

before(async () => {
  await initSchema();
  await execute(
    "INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'RT', 'sciences', 999)",
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
     VALUES (?, ?, 1, 'Q ?', 'A', 'B', 'C', 'A', 'college')`,
    [qcode, catSlug],
  );
  const tut = await execute(
    "INSERT INTO tutorials (title, slug, type, is_active, created_at, updated_at) VALUES ('RT tuto', ?, 'html', 1, NOW(), NOW())",
    [`rt-tuto-${stamp}`.slice(0, 80)],
  );
  tutorialId = tut.insertId;
  await execute(
    `INSERT IGNORE INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('tutorial', ?, ?, 1, 1, 'manual', 'approved')`,
    [String(tutorialId), qcode],
  );
  await execute(
    `INSERT IGNORE INTO users (id, user_type, pseudo, display_name, affiliation, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, 'RT', 'both', 1, NOW(), NOW())`,
    [userId, `rt${stamp}`.slice(0, 50)],
  );
  await execute(
    `INSERT IGNORE INTO gl_resource_question_links
      (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('qcm', 'species', ?, ?, 1, 1, 'manual', 'approved')`,
    [speciesRef, glq],
  );

  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Gating',
      lastName: `RT${stamp}`,
      pseudo: `rtack${stamp}`.slice(0, 40),
      password: 'testpass1234',
      affiliation: 'both',
    });
  studentToken = reg.body.authToken;
  studentUserId = reg.body.id;
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  glSettings.setGatingCacheForTests(null);
  await execute('DELETE FROM user_tutorial_reads WHERE user_id = ?', [userId]).catch(() => {});
  await execute('DELETE FROM user_quiz_attempts WHERE user_id = ?', [userId]).catch(() => {});
  if (studentUserId) {
    await execute('DELETE FROM user_tutorial_reads WHERE user_id = ?', [studentUserId]).catch(
      () => {},
    );
    await execute('DELETE FROM user_quiz_attempts WHERE user_id = ?', [studentUserId]).catch(
      () => {},
    );
    await execute('DELETE FROM users WHERE id = ?', [studentUserId]).catch(() => {});
  }
  await execute('DELETE FROM resource_question_links WHERE question_code = ?', [qcode]).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_questions WHERE question_code = ?', [qcode]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
  if (tutorialId) await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
  await execute('DELETE FROM gl_resource_question_links WHERE question_code = ?', [glq]).catch(
    () => {},
  );
  await execute(
    'DELETE FROM gl_learning_acknowledgements WHERE reader_user_type = ? AND reader_user_id = ?',
    [reader.userType, reader.userId],
  ).catch(() => {});
  await execute('DELETE FROM gl_qcm_attempts WHERE reader_user_id = ?', [reader.userId]).catch(
    () => {},
  );
});

test('GL — gating ON : tentative enregistrée sans auto-marquage', async () => {
  glSettings.setGatingCacheForTests({
    enabled: true,
    autoMarkOnCorrect: true,
    granularity: 'player',
    defaultMode: 'any',
    defaultRequiredCorrect: 1,
  });
  await runtime.recordGlQcmAttemptIfGatingEnabled(db, {
    glAuth: reader,
    dataset: 'qcm',
    questionCode: glq,
    isCorrect: true,
  });
  const attempt = await queryOne(
    'SELECT is_correct FROM gl_qcm_attempts WHERE reader_user_id = ? AND question_code = ? LIMIT 1',
    [reader.userId, glq],
  );
  assert.ok(attempt, 'la tentative QCM GL doit être enregistrée');
  const ack = await queryOne(
    `SELECT 1 AS x FROM gl_learning_acknowledgements
      WHERE reader_user_type = ? AND reader_user_id = ? AND target_type = 'species' AND target_code = ? LIMIT 1`,
    [reader.userType, reader.userId, speciesRef],
  );
  assert.equal(ack, undefined, "l'espèce ne doit pas être auto-marquée");
});

test('GL — gating OFF : aucune écriture de tentative', async () => {
  glSettings.setGatingCacheForTests({ enabled: false });
  const reader2 = { userType: 'gl_player', userId: `8${stamp}`.slice(0, 12) };
  await runtime.recordGlQcmAttemptIfGatingEnabled(db, {
    glAuth: reader2,
    dataset: 'qcm',
    questionCode: glq,
    isCorrect: true,
  });
  const attempt = await queryOne(
    'SELECT 1 AS x FROM gl_qcm_attempts WHERE reader_user_id = ? LIMIT 1',
    [reader2.userId],
  );
  assert.equal(attempt, undefined);
});

test('FM — GET challenge requis avec question liée si gating ON', async () => {
  await setSetting('learning.gating.enabled', true, {});
  const res = await request(app)
    .get(
      `/api/learning/gating/challenge?resourceType=tutorial&resourceRef=${encodeURIComponent(String(tutorialId))}`,
    )
    .set('Authorization', 'Bearer ' + studentToken)
    .expect(200);
  assert.equal(res.body.required, true);
  assert.equal(res.body.mode, 'all');
  assert.ok(res.body.questions.some((q) => q.question_code === qcode));
  assert.equal(res.body.pending_count, 1);
});

test('FM — acknowledge tutoriel 403 sans bonne réponse puis 200 après quiz', async () => {
  await setSetting('learning.gating.enabled', true, {});
  await execute('DELETE FROM user_tutorial_reads WHERE user_id = ?', [studentUserId]);
  await execute('DELETE FROM user_quiz_attempts WHERE user_id = ?', [studentUserId]);

  const blocked = await request(app)
    .post(`/api/tutorials/${tutorialId}/acknowledge-read`)
    .set('Authorization', 'Bearer ' + studentToken)
    .send({ confirm: true })
    .expect(403);
  assert.ok(Array.isArray(blocked.body.missing_question_codes));
  assert.ok(blocked.body.missing_question_codes.includes(qcode));

  await execute(
    'INSERT INTO user_quiz_attempts (user_id, question_code, is_correct) VALUES (?, ?, 1)',
    [studentUserId, qcode],
  );

  const ok = await request(app)
    .post(`/api/tutorials/${tutorialId}/acknowledge-read`)
    .set('Authorization', 'Bearer ' + studentToken)
    .send({ confirm: true })
    .expect(200);
  assert.equal(ok.body.success, true);

  const row = await queryOne(
    'SELECT 1 AS x FROM user_tutorial_reads WHERE user_id = ? AND tutorial_id = ? LIMIT 1',
    [studentUserId, tutorialId],
  );
  assert.ok(row);
});

test('FM — gating OFF : challenge non requis', async () => {
  await setSetting('learning.gating.enabled', false, {});
  const state = await acknowledge.getChallengeState(db, {
    product: 'fm',
    resourceType: 'tutorial',
    resourceRef: String(tutorialId),
    userId: studentUserId,
  });
  assert.equal(state.required, false);
});
