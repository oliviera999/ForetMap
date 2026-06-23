'use strict';

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { initSchema, queryOne, execute } = require('../database');
const { setSetting } = require('../lib/settings');
const glSettings = require('../lib/glSettings');
const runtime = require('../lib/learningGatingRuntime');

const db = require('../database');
const stamp = Date.now();
const qcode = `QFR${stamp}`.slice(0, 16);
const catSlug = `rtcat${stamp}`.slice(0, 64);
const glq = `GQR${stamp}`.slice(0, 16);
const speciesRef = `SPR${stamp}`.slice(0, 64);
const userId = `rt-student-${stamp}`.slice(0, 64);
const reader = { userType: 'gl_player', userId: `9${stamp}`.slice(0, 12) };
let tutorialId = null;

before(async () => {
  await initSchema();
  // ForetMap : categorie + question + tutoriel + lien (tutorial -> question) + eleve.
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
  // GL : lien polymorphe (pas besoin de gl_species : resource_ref est libre).
  await execute(
    `INSERT IGNORE INTO gl_resource_question_links
      (question_dataset, resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('qcm', 'species', ?, ?, 1, 1, 'manual', 'approved')`,
    [speciesRef, glq],
  );
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  glSettings.setGatingCacheForTests(null);
  await execute('DELETE FROM user_tutorial_reads WHERE user_id = ?', [userId]).catch(() => {});
  await execute('DELETE FROM user_quiz_attempts WHERE user_id = ?', [userId]).catch(() => {});
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

test('ForetMap — gating OFF : bonne réponse ne marque RIEN', async () => {
  await setSetting('learning.gating.enabled', false, {});
  await execute(
    'INSERT INTO user_quiz_attempts (user_id, question_code, is_correct) VALUES (?, ?, 1)',
    [userId, qcode],
  );
  await runtime.autoMarkFmOnAnswer(db, { userId, questionCode: qcode, isCorrect: true });
  const row = await queryOne(
    'SELECT 1 AS x FROM user_tutorial_reads WHERE user_id = ? AND tutorial_id = ? LIMIT 1',
    [userId, tutorialId],
  );
  assert.equal(row, undefined);
});

test('ForetMap — gating ON : bonne réponse auto-marque le tutoriel lié', async () => {
  await setSetting('learning.gating.enabled', true, {});
  await runtime.autoMarkFmOnAnswer(db, { userId, questionCode: qcode, isCorrect: true });
  const row = await queryOne(
    'SELECT 1 AS x FROM user_tutorial_reads WHERE user_id = ? AND tutorial_id = ? LIMIT 1',
    [userId, tutorialId],
  );
  assert.ok(row, 'le tutoriel lié doit être marqué comme lu');
});

test('ForetMap — mauvaise réponse n’auto-marque pas', async () => {
  await setSetting('learning.gating.enabled', true, {});
  await execute('DELETE FROM user_tutorial_reads WHERE user_id = ?', [userId]);
  await runtime.autoMarkFmOnAnswer(db, { userId, questionCode: qcode, isCorrect: false });
  const row = await queryOne(
    'SELECT 1 AS x FROM user_tutorial_reads WHERE user_id = ? AND tutorial_id = ? LIMIT 1',
    [userId, tutorialId],
  );
  assert.equal(row, undefined);
});

test('GL — gating ON : tentative enregistrée + espèce liée auto-marquée', async () => {
  glSettings.setGatingCacheForTests({
    enabled: true,
    autoMarkOnCorrect: true,
    granularity: 'player',
    defaultMode: 'any',
    defaultRequiredCorrect: 1,
  });
  await runtime.recordGlAttemptAndAutoMark(db, {
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
  assert.ok(ack, "l'espèce liée doit être marquée comme étudiée");
});

test('GL — gating OFF : aucune écriture', async () => {
  glSettings.setGatingCacheForTests({ enabled: false });
  const reader2 = { userType: 'gl_player', userId: `8${stamp}`.slice(0, 12) };
  await runtime.recordGlAttemptAndAutoMark(db, {
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
