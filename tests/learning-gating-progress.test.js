'use strict';

// Agrégats prof « en attente / réussi / bloqué » d'une ressource conditionnée
// (GET /api/learning-links/progress). La route répondait 500 depuis sa livraison : deux
// colonnes inexistantes (`users.deleted_at`, `learning_acknowledgements.resource_type`) et
// aucun test ne l'exerçait (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, constat A2).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { setSetting } = require('../lib/settings');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const catSlug = `pgcat${stamp}`.slice(0, 64);
const qcode = `QPG${stamp}`.slice(0, 16);
const glossaryCode = `pgterm${stamp}`.slice(0, 64);
const students = ['satisfied', 'locked', 'pending'].map((k) => `pg-${k}-${stamp}`.slice(0, 64));
let token = '';
let tutorialId = 0;

const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  await execute(
    "INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index) VALUES (?, 'PG', 'sciences', 999)",
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
     VALUES (?, ?, 1, 'Q ?', 'A', 'B', 'C', 'A', 'college')`,
    [qcode, catSlug],
  );
  const tut = await execute(
    "INSERT INTO tutorials (title, slug, type, is_active, created_at, updated_at) VALUES ('PG tuto', ?, 'html', 1, NOW(), NOW())",
    [`pg-tuto-${stamp}`.slice(0, 80)],
  );
  tutorialId = tut.insertId;
  await execute(
    `INSERT IGNORE INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('tutorial', ?, ?, 1, 1, 'manual', 'approved')`,
    [String(tutorialId), qcode],
  );
  await execute(
    `INSERT IGNORE INTO glossary_terms (glossary_code, terme, definition_courte, categorie, statut)
     VALUES (?, 'Terme PG', 'def', 'general', 'actif')`,
    [glossaryCode],
  );
  await execute(
    `INSERT IGNORE INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('glossary', ?, ?, 1, 1, 'manual', 'approved')`,
    [glossaryCode, qcode],
  );

  // Trois élèves : un qui a réussi, un verrouillé, un qui n'a rien fait.
  for (const id of students) {
    await execute(
      `INSERT IGNORE INTO users (id, user_type, first_name, last_name, pseudo, display_name, affiliation, is_active, created_at, updated_at)
       VALUES (?, 'student', 'Pg', ?, ?, 'PG', 'both', 1, NOW(), NOW())`,
      [id, id.slice(0, 40), id.slice(0, 50)],
    );
  }
  await execute(
    `INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct)
     VALUES (?, ?, ?, 1)`,
    [students[0], qcode, catSlug],
  );
  await execute(
    `INSERT INTO resource_gating_cooldowns
      (user_id, resource_type, resource_ref, question_code, locked_until, wrong_question_code, wrong_attempts)
     VALUES (?, 'tutorial', ?, '', DATE_ADD(NOW(), INTERVAL 2 DAY), ?, 1)`,
    [students[1], String(tutorialId), qcode],
  );
  await execute(
    `INSERT IGNORE INTO learning_acknowledgements (user_id, target_type, target_code)
     VALUES (?, 'glossary', ?)`,
    [students[0], glossaryCode],
  );
  await setSetting('learning.gating.enabled', true, {});
});

after(async () => {
  await setSetting('learning.gating.enabled', false, {}).catch(() => {});
  for (const id of students) {
    await execute('DELETE FROM users WHERE id = ?', [id]).catch(() => {});
  }
  await execute('DELETE FROM resource_question_links WHERE question_code = ?', [qcode]).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_questions WHERE question_code = ?', [qcode]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM glossary_terms WHERE glossary_code = ?', [glossaryCode]).catch(
    () => {},
  );
  if (tutorialId) await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
});

test('progress — refus sans permission', async () => {
  await request(app)
    .get(`/api/learning-links/progress?resourceType=tutorial&resourceRef=${tutorialId}`)
    .expect(401);
});

test('progress — un tutoriel conditionné : réussi, bloqué et en attente sont comptés', async () => {
  const res = await request(app)
    .get(`/api/learning-links/progress?resourceType=tutorial&resourceRef=${tutorialId}`)
    .set(auth())
    .expect(200);
  const s = res.body.summary;
  assert.ok(s, 'un résumé est renvoyé');
  assert.ok(s.total_students >= 3, 'les trois élèves du test sont comptés');
  assert.ok(s.satisfied_count >= 1, 'au moins un élève a réussi');
  assert.ok(s.locked_count >= 1, 'au moins un élève est verrouillé');
  assert.ok(s.pending_count >= 1, 'au moins un élève est en attente');
  assert.equal(s.required_correct, 1);
  assert.equal(s.gating_questions, 1);
  assert.equal(
    s.total_students,
    s.satisfied_count + s.locked_count + s.pending_count,
    'chaque élève est dans une seule colonne',
  );
});

test('progress — un terme de glossaire (la table des accusés porte target_type / target_code)', async () => {
  const res = await request(app)
    .get(`/api/learning-links/progress?resourceType=glossary&resourceRef=${glossaryCode}`)
    .set(auth())
    .expect(200);
  assert.ok(res.body.summary.read_count >= 1, "l'accusé du premier élève est compté");
});

test('progress — un seuil au-delà du nombre de questions reste satisfiable', async () => {
  // Un seuil de 5 sur 1 question : l'accusé le borne à 1, les agrégats doivent faire de même,
  // sinon l'élève qui a réussi serait compté « en attente » alors que sa validation passe.
  await request(app)
    .put('/api/learning-links/policy')
    .set(auth())
    .send({
      resourceType: 'tutorial',
      resourceRef: String(tutorialId),
      mode: 'threshold',
      required_correct: 5,
    })
    .expect(200);
  const res = await request(app)
    .get(`/api/learning-links/progress?resourceType=tutorial&resourceRef=${tutorialId}`)
    .set(auth())
    .expect(200);
  assert.equal(res.body.summary.required_correct, 1, 'seuil borné au nombre de questions');
  assert.ok(res.body.summary.satisfied_count >= 1, "l'élève qui a réussi reste « réussi »");
  await execute(
    "DELETE FROM resource_gating_policy WHERE resource_type = 'tutorial' AND resource_ref = ?",
    [String(tutorialId)],
  );
});

test('progress — conditionnement éteint : tout le monde est « réussi »', async () => {
  await setSetting('learning.gating.enabled', false, {});
  const res = await request(app)
    .get(`/api/learning-links/progress?resourceType=tutorial&resourceRef=${tutorialId}`)
    .set(auth())
    .expect(200);
  assert.equal(res.body.summary.pending_count, 0);
  assert.equal(res.body.summary.locked_count, 0);
  await setSetting('learning.gating.enabled', true, {});
});
