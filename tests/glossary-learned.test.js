'use strict';

// Glossaire ForetMap validable : « j'ai appris ce terme ».
//
// Le glossaire était purement consultatif — trois routes de lecture, aucune notion
// d'« appris ». Conséquence directe : un lien bloquant sur un terme était accepté mais
// restait inerte à jamais, faute de geste de validation auquel se rattacher. Gnomes &
// Licornes savait le faire depuis la migration 107 ; ForetMap depuis la 201.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const { invalidateSettingsCache } = require('../lib/settings');

const stamp = Date.now();
const code = `GA${stamp}`.slice(0, 16);
const qcode = `QGA${stamp}`.slice(0, 16);
const catSlug = `gacat${stamp}`.slice(0, 64);
let token = '';
let userId = '';

const auth = () => ({ Authorization: `Bearer ${token}` });

async function setGatingEnabled(value) {
  await execute(
    "INSERT INTO app_settings (`key`, scope, value_json) VALUES ('learning.gating.enabled', 'teacher', ?)\n     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json)",
    [JSON.stringify(value)],
  );
  invalidateSettingsCache();
}

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();

  await execute(
    `INSERT IGNORE INTO glossary_terms (glossary_code, terme, categorie, niveau, definition_courte, statut)
     VALUES (?, 'Terme de test appris', 'ecologie', 'base', 'Définition courte.', 'actif')`,
    [code],
  );
  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES (?, 'Test glossaire appris', 'sciences', 997)`,
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
     VALUES (?, ?, 1, 'Question glossaire ?', 'A', 'B', 'C', 'A', 'college')`,
    [qcode, catSlug],
  );

  // L'identifiant du compte vient de `/api/auth/me` (bloc `auth`), pas d'un `user` racine.
  const me = await request(app).get('/api/auth/me').set(auth()).expect(200);
  userId = String(me.body?.auth?.userId || '');
  assert.ok(userId, 'identifiant du compte de test introuvable');
});

after(async () => {
  await setGatingEnabled(false);
  await execute('DELETE FROM learning_acknowledgements WHERE target_code = ?', [code]).catch(
    () => {},
  );
  await execute('DELETE FROM resource_question_links WHERE question_code = ?', [qcode]).catch(
    () => {},
  );
  await execute('DELETE FROM resource_gating_cooldowns WHERE resource_ref = ?', [code]).catch(
    () => {},
  );
  await execute('DELETE FROM quiz_questions WHERE question_code = ?', [qcode]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  await execute('DELETE FROM glossary_terms WHERE glossary_code = ?', [code]).catch(() => {});
});

test('les deux routes exigent une session', async () => {
  await request(app).get('/api/glossary/me/learned-codes').expect(401);
  await request(app)
    .post(`/api/glossary/terms/${encodeURIComponent(code)}/acknowledge`)
    .send({ confirm: true })
    .expect(401);
});

test('l’accusé exige une confirmation explicite', async () => {
  const res = await request(app)
    .post(`/api/glossary/terms/${encodeURIComponent(code)}/acknowledge`)
    .set(auth())
    .send({})
    .expect(400);
  assert.match(res.body.error, /confirm/i);
});

test('un terme inexistant renvoie 404 plutôt qu’un accusé fantôme', async () => {
  await request(app)
    .post('/api/glossary/terms/INEXISTANT404/acknowledge')
    .set(auth())
    .send({ confirm: true })
    .expect(404);
});

test('marquer un terme appris, puis le retrouver dans la liste', async () => {
  await setGatingEnabled(false);
  const res = await request(app)
    .post(`/api/glossary/terms/${encodeURIComponent(code)}/acknowledge`)
    .set(auth())
    .send({ confirm: true })
    .expect(200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.glossary_code, code);

  const liste = await request(app).get('/api/glossary/me/learned-codes').set(auth()).expect(200);
  assert.ok(liste.body.glossary_codes.includes(code), 'le terme doit figurer parmi les appris');

  // Idempotent : re-marquer ne double pas la ligne, il rafraîchit la date.
  await request(app)
    .post(`/api/glossary/terms/${encodeURIComponent(code)}/acknowledge`)
    .set(auth())
    .send({ confirm: true })
    .expect(200);
  const row = await queryOne(
    'SELECT COUNT(*) AS n FROM learning_acknowledgements WHERE target_type = ? AND target_code = ?',
    ['glossary', code],
  );
  assert.equal(Number(row.n), 1);
});

test('le conditionnement s’applique au glossaire comme aux tutoriels', async () => {
  // C'est tout l'objet du lot : sans geste de validation, un lien bloquant sur un terme
  // ne conditionnait rien du tout.
  await execute('DELETE FROM learning_acknowledgements WHERE target_code = ?', [code]);
  await execute(
    `INSERT INTO resource_question_links
      (resource_type, resource_ref, question_code, is_gating, weight, origin, status)
     VALUES ('glossary', ?, ?, 1, 1, 'manual', 'approved')
     ON DUPLICATE KEY UPDATE is_gating = 1, status = 'approved'`,
    [code, qcode],
  );
  await setGatingEnabled(true);

  const refus = await request(app)
    .post(`/api/glossary/terms/${encodeURIComponent(code)}/acknowledge`)
    .set(auth())
    .send({ confirm: true })
    .expect(403);
  assert.ok(
    refus.body.missing_question_codes.includes(qcode),
    'la question manquante doit être nommée',
  );

  // Une bonne réponse enregistrée ouvre la validation, sans repasser par le quiz.
  await execute(
    `INSERT INTO user_quiz_attempts (user_id, question_code, is_correct, answered_at)
     VALUES (?, ?, 1, NOW())`,
    [String(userId), qcode],
  );
  await request(app)
    .post(`/api/glossary/terms/${encodeURIComponent(code)}/acknowledge`)
    .set(auth())
    .send({ confirm: true })
    .expect(200);

  await execute('DELETE FROM user_quiz_attempts WHERE question_code = ?', [qcode]).catch(() => {});
});

test('le résumé par lot couvre aussi le glossaire', async () => {
  const res = await request(app)
    .get(
      `/api/learning/gating/summary?resourceType=glossary&resourceRefs=${encodeURIComponent(code)}`,
    )
    .set(auth())
    .expect(200);
  assert.equal(res.body.resource_type, 'glossary');
  assert.ok(Array.isArray(res.body.items));
});
