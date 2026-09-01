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
  if (tutorialId) {
    await execute(
      'DELETE FROM resource_gating_policy WHERE resource_type = ? AND resource_ref IN (?, ?)',
      ['tutorial', String(tutorialId), '*'],
    ).catch(() => {});
  }
  if (studentUserId) {
    await execute('DELETE FROM resource_gating_cooldowns WHERE user_id = ?', [studentUserId]).catch(
      () => {},
    );
  }
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {}).catch(() => {});
  await setSetting('learning.gating.retry_cooldown_days', 3, {}).catch(() => {});
});

test('GL — gating ON : tentative enregistrée sans auto-marquage', async () => {
  glSettings.setGatingCacheForTests({
    enabled: true,
    autoMarkOnCorrect: true,
    granularity: 'player',
    defaultMode: 'any',
    defaultRequiredCorrect: 1,
  });
  await runtime.recordGlQcmAttemptForReader(db, {
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

test('GL — gating OFF : la tentative est quand même enregistrée (activation rétroactive)', async () => {
  // F3 (audit 2026-08) : l'écriture ne dépend plus de gating.enabled, sinon allumer
  // l'interrupteur repose des questions déjà réussies. Seule la lecture reste conditionnée.
  glSettings.setGatingCacheForTests({ enabled: false });
  const reader2 = { userType: 'gl_player', userId: `8${stamp}`.slice(0, 12) };
  await runtime.recordGlQcmAttemptForReader(db, {
    glAuth: reader2,
    dataset: 'qcm',
    questionCode: glq,
    isCorrect: true,
  });
  const attempt = await queryOne(
    'SELECT is_correct FROM gl_qcm_attempts WHERE reader_user_id = ? AND question_code = ? LIMIT 1',
    [reader2.userId, glq],
  );
  assert.ok(attempt, 'la tentative doit être enregistrée même conditionnement éteint');
  assert.equal(Number(attempt.is_correct), 1);
  // …mais rien n'est marqué appris pour autant.
  const ack = await queryOne(
    `SELECT 1 AS x FROM gl_learning_acknowledgements
      WHERE reader_user_type = ? AND reader_user_id = ? LIMIT 1`,
    [reader2.userType, reader2.userId],
  );
  assert.equal(ack, undefined, 'aucun marquage automatique');
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
  // Le mode du site est désormais appliqué (audit F1) : `learning.gating.default_mode` vaut
  // `any` par défaut, et une seule question est liée ici — une réussite suffit.
  assert.equal(res.body.mode, 'any');
  assert.equal(res.body.required_correct, 1);
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

async function resetFmCooldownFixture() {
  await execute(
    'DELETE FROM resource_gating_cooldowns WHERE user_id = ? AND resource_type = ? AND resource_ref = ?',
    [studentUserId, 'tutorial', String(tutorialId)],
  );
}

test('FM — l’écriture du verrou honore la tolérance de la fiche, pas celle du site', async () => {
  // Site : verrou dès la 1re faute. Fiche : 2 erreurs tolérées.
  // Avant le correctif, la 1re faute verrouillait quand même (réglages site seuls).
  await setSetting('learning.gating.enabled', true, {});
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {});
  await setSetting('learning.gating.retry_cooldown_days', 3, {});
  await execute(
    `INSERT INTO resource_gating_policy
      (resource_type, resource_ref, mode, required_correct, enabled, allowed_wrong_attempts)
     VALUES ('tutorial', ?, 'inherit', 1, 1, 2)
     ON DUPLICATE KEY UPDATE allowed_wrong_attempts = 2, enabled = 1, retry_cooldown_days = NULL`,
    [String(tutorialId)],
  );
  await resetFmCooldownFixture();

  const first = await runtime.registerFmCooldownOnWrongIfGating(db, {
    userId: studentUserId,
    resourceType: 'tutorial',
    resourceRef: String(tutorialId),
    questionCode: qcode,
    isCorrect: false,
  });
  assert.equal(first?.locked, false, 'la 1re faute sous tolérance fiche ne doit pas verrouiller');
  assert.equal(first?.wrong_attempts, 1);
  assert.equal(first?.attempts_left, 1);

  const second = await runtime.registerFmCooldownOnWrongIfGating(db, {
    userId: studentUserId,
    resourceType: 'tutorial',
    resourceRef: String(tutorialId),
    questionCode: qcode,
    isCorrect: false,
  });
  assert.equal(second?.locked, false);
  assert.equal(second?.wrong_attempts, 2);

  const third = await runtime.registerFmCooldownOnWrongIfGating(db, {
    userId: studentUserId,
    resourceType: 'tutorial',
    resourceRef: String(tutorialId),
    questionCode: qcode,
    isCorrect: false,
  });
  assert.equal(third?.locked, true, 'la 3e faute doit poser le verrou');
});

test('FM — le délai de verrou de la fiche s’applique même si le site est à 0', async () => {
  await setSetting('learning.gating.enabled', true, {});
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {});
  await setSetting('learning.gating.retry_cooldown_days', 0, {});
  await execute(
    `INSERT INTO resource_gating_policy
      (resource_type, resource_ref, mode, required_correct, enabled,
       allowed_wrong_attempts, retry_cooldown_days)
     VALUES ('tutorial', ?, 'inherit', 1, 1, 0, 3)
     ON DUPLICATE KEY UPDATE allowed_wrong_attempts = 0, retry_cooldown_days = 3, enabled = 1`,
    [String(tutorialId)],
  );
  await resetFmCooldownFixture();

  const res = await runtime.registerFmCooldownOnWrongIfGating(db, {
    userId: studentUserId,
    resourceType: 'tutorial',
    resourceRef: String(tutorialId),
    questionCode: qcode,
    isCorrect: false,
  });
  assert.equal(res?.locked, true, 'le délai de la fiche (3 j) doit poser le verrou malgré site=0');
  assert.equal(res?.retry_days, 3);
});

test('FM — préréglage par type (resource_ref=*) appliqué à l’écriture du verrou', async () => {
  await setSetting('learning.gating.enabled', true, {});
  await setSetting('learning.gating.allowed_wrong_attempts', 0, {});
  await setSetting('learning.gating.retry_cooldown_days', 3, {});
  await execute(
    `DELETE FROM resource_gating_policy WHERE resource_type = 'tutorial' AND resource_ref IN (?, '*')`,
    [String(tutorialId)],
  );
  await execute(
    `INSERT INTO resource_gating_policy
      (resource_type, resource_ref, mode, required_correct, enabled, allowed_wrong_attempts)
     VALUES ('tutorial', '*', 'inherit', 1, 1, 2)`,
  );
  await resetFmCooldownFixture();

  const first = await runtime.registerFmCooldownOnWrongIfGating(db, {
    userId: studentUserId,
    resourceType: 'tutorial',
    resourceRef: String(tutorialId),
    questionCode: qcode,
    isCorrect: false,
  });
  assert.equal(first?.locked, false, 'la tolérance du type tutoriel doit compter');
  assert.equal(first?.attempts_left, 1);
});
