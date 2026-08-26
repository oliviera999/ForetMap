'use strict';

// Vue enseignante des verrous (constat C4 de l'audit : le dispositif pouvait
// bloquer un élève plusieurs jours sans que personne ne le voie).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const catSlug = `lockcat${stamp}`.slice(0, 64);
const qcode = `QLK${stamp}`.slice(0, 16);
const slug = `tuto-lock-${stamp}`.slice(0, 190);
let token = '';
let tutorialId = 0;
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
     VALUES (?, 'Test verrous', 'jardinage', 996)`,
    [catSlug],
  );
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question,
       choix_a, choix_b, choix_c, reponse_correcte, niveau, statut)
     VALUES (?, ?, 1, 'Question verrou ?', 'A', 'B', 'C', 'A', 'college', 'actif')`,
    [qcode, catSlug],
  );
  await execute(
    `INSERT INTO tutorials (title, slug, type, is_active, sort_order)
     VALUES (?, ?, 'html', 1, 898)`,
    [`Tuto verrou ${stamp}`, slug],
  );
  tutorialId = Number(
    (await queryOne('SELECT id FROM tutorials WHERE slug = ? LIMIT 1', [slug])).id,
  );
});

after(async () => {
  await execute('DELETE FROM resource_gating_cooldowns WHERE resource_ref = ?', [
    String(tutorialId),
  ]).catch(() => {});
  await execute('DELETE FROM quiz_questions WHERE question_code = ?', [qcode]).catch(() => {});
  await execute('DELETE FROM quiz_categories WHERE slug = ?', [catSlug]).catch(() => {});
  if (tutorialId) await execute('DELETE FROM tutorials WHERE id = ?', [tutorialId]).catch(() => {});
});

/** Pose un verrou brut en base (le chemin nominal passe par une mauvaise réponse). */
async function seedLock({ days = 3, questionCode = '', attempts = 1 } = {}) {
  await execute(
    `INSERT INTO resource_gating_cooldowns
      (user_id, resource_type, resource_ref, question_code, locked_until, wrong_question_code, wrong_attempts)
     VALUES (?, 'tutorial', ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?)
     ON DUPLICATE KEY UPDATE locked_until = VALUES(locked_until), wrong_attempts = VALUES(wrong_attempts)`,
    [String(userId), String(tutorialId), questionCode, days, qcode, attempts],
  );
}

test('refus sans authentification', async () => {
  const res = await request(app).get('/api/learning-links/locks');
  assert.ok([401, 403].includes(res.status), `statut inattendu ${res.status}`);
});

test('liste les verrous en cours avec le libellé du tutoriel', async () => {
  await seedLock({ days: 3 });
  const res = await request(app).get('/api/learning-links/locks').set(auth());
  assert.equal(res.status, 200);
  const mine = res.body.locks.find((l) => l.resource_ref === String(tutorialId));
  assert.ok(mine, 'le verrou posé doit remonter');
  // « tutorial 12 » ne dit rien à un professeur ; le titre, si.
  assert.equal(mine.resource_label, `Tuto verrou ${stamp}`);
  assert.equal(mine.scope, 'resource');
  assert.equal(mine.expired, false);
  assert.ok(mine.remaining_days >= 1 && mine.remaining_days <= 3);
  assert.equal(mine.wrong_question_code, qcode);
});

test('un verrou expiré est masqué par défaut, visible sur demande', async () => {
  await execute('DELETE FROM resource_gating_cooldowns WHERE resource_ref = ?', [
    String(tutorialId),
  ]);
  await execute(
    `INSERT INTO resource_gating_cooldowns
      (user_id, resource_type, resource_ref, question_code, locked_until, wrong_attempts)
     VALUES (?, 'tutorial', ?, '', DATE_SUB(NOW(), INTERVAL 1 DAY), 1)`,
    [String(userId), String(tutorialId)],
  );

  const actifs = await request(app).get('/api/learning-links/locks').set(auth());
  assert.ok(!actifs.body.locks.some((l) => l.resource_ref === String(tutorialId)));

  const tous = await request(app).get('/api/learning-links/locks?includeExpired=1').set(auth());
  const mine = tous.body.locks.find((l) => l.resource_ref === String(tutorialId));
  assert.ok(mine);
  assert.equal(mine.expired, true);
  assert.equal(mine.remaining_days, 0);
});

test('la portée « question » est distinguée dans la liste', async () => {
  await execute('DELETE FROM resource_gating_cooldowns WHERE resource_ref = ?', [
    String(tutorialId),
  ]);
  await seedLock({ days: 2, questionCode: qcode });
  const res = await request(app).get('/api/learning-links/locks').set(auth());
  const mine = res.body.locks.find((l) => l.resource_ref === String(tutorialId));
  assert.equal(mine.scope, 'question');
  assert.equal(mine.locked_question_code, qcode);
});

test('filtre par type de ressource', async () => {
  await seedLock({ days: 3 });
  const ok = await request(app).get('/api/learning-links/locks?resourceType=tutorial').set(auth());
  assert.ok(ok.body.locks.some((l) => l.resource_ref === String(tutorialId)));

  const autre = await request(app).get('/api/learning-links/locks?resourceType=plant').set(auth());
  assert.ok(!autre.body.locks.some((l) => l.resource_ref === String(tutorialId)));

  const invalide = await request(app)
    .get('/api/learning-links/locks?resourceType=chaussette')
    .set(auth());
  assert.equal(invalide.status, 400);
});

test('le professeur peut lever un verrou', async () => {
  await execute('DELETE FROM resource_gating_cooldowns WHERE resource_ref = ?', [
    String(tutorialId),
  ]);
  await seedLock({ days: 3 });
  const res = await request(app)
    .delete('/api/learning-links/locks')
    .set(auth())
    .send({ user_id: userId, resource_type: 'tutorial', resource_ref: String(tutorialId) });
  assert.equal(res.status, 200);
  assert.equal(res.body.released, 1);

  const reste = await queryOne(
    'SELECT COUNT(*) AS n FROM resource_gating_cooldowns WHERE resource_ref = ?',
    [String(tutorialId)],
  );
  assert.equal(Number(reste.n), 0, 'le verrou doit avoir disparu');
});

test('lever un verrou de question ne touche pas le verrou de ressource', async () => {
  await execute('DELETE FROM resource_gating_cooldowns WHERE resource_ref = ?', [
    String(tutorialId),
  ]);
  await seedLock({ days: 3, questionCode: '' });
  await seedLock({ days: 3, questionCode: qcode });

  const res = await request(app)
    .delete('/api/learning-links/locks')
    .set(auth())
    .send({
      user_id: userId,
      resource_type: 'tutorial',
      resource_ref: String(tutorialId),
      question_code: qcode,
    });
  assert.equal(res.body.released, 1);

  const reste = await queryOne(
    'SELECT question_code FROM resource_gating_cooldowns WHERE resource_ref = ? LIMIT 1',
    [String(tutorialId)],
  );
  assert.equal(reste.question_code, '', 'le verrou de ressource subsiste');
});

test('lever un verrou inexistant renvoie 404', async () => {
  const res = await request(app)
    .delete('/api/learning-links/locks')
    .set(auth())
    .send({ user_id: userId, resource_type: 'tutorial', resource_ref: '99999999' });
  assert.equal(res.status, 404);
});

test('requête de levée incomplète → 400', async () => {
  const res = await request(app)
    .delete('/api/learning-links/locks')
    .set(auth())
    .send({ resource_type: 'tutorial' });
  assert.equal(res.status, 400);
});
