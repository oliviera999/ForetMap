'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
const qcode = `QFT${stamp}`.slice(0, 16);
const resourceRef = `T${stamp}`.slice(0, 64);
let token = '';

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();

  // Question quiz dediee (FK question_code -> quiz_questions).
  await execute(
    `INSERT IGNORE INTO quiz_categories (slug, nom, theme, order_index)
     VALUES ('test_gating', 'Test gating', 'sciences', 999)`,
  );
  await execute(
    `INSERT IGNORE INTO quiz_questions
      (question_code, categorie_slug, numero_dans_categorie, question, choix_a, choix_b, choix_c, reponse_correcte, niveau)
     VALUES (?, 'test_gating', 1, 'Question test ?', 'A', 'B', 'C', 'A', 'college')`,
    [qcode],
  );
});

const auth = () => ({ Authorization: `Bearer ${token}` });

test('refus sans authentification', async () => {
  const res = await request(app).get('/api/learning-links');
  assert.ok([401, 403].includes(res.status), `statut inattendu ${res.status}`);
});

test('POST cree un lien ressource <-> question', async () => {
  const res = await request(app)
    .post('/api/learning-links')
    .set(auth())
    .send({ resource_type: 'tutorial', resource_ref: resourceRef, question_code: qcode })
    .expect(201);
  assert.equal(res.body.link.resource_type, 'tutorial');
  assert.equal(res.body.link.question_code, qcode);
  assert.equal(res.body.link.is_gating, 1);
});

test('POST type de ressource invalide -> 400', async () => {
  await request(app)
    .post('/api/learning-links')
    .set(auth())
    .send({ resource_type: 'feuillet', resource_ref: 'x', question_code: qcode })
    .expect(400);
});

test('POST question inexistante -> 404', async () => {
  await request(app)
    .post('/api/learning-links')
    .set(auth())
    .send({ resource_type: 'tutorial', resource_ref: resourceRef, question_code: 'QF_INCONNU' })
    .expect(404);
});

test('GET liste filtree par questionCode', async () => {
  const res = await request(app)
    .get(`/api/learning-links?questionCode=${qcode}`)
    .set(auth())
    .expect(200);
  assert.ok(Array.isArray(res.body.links));
  assert.ok(res.body.links.some((l) => l.resource_ref === resourceRef));
});

test('PATCH bascule is_gating', async () => {
  const list = await request(app).get(`/api/learning-links?questionCode=${qcode}`).set(auth());
  const id = list.body.links.find((l) => l.resource_ref === resourceRef).id;
  const res = await request(app)
    .patch(`/api/learning-links/${id}`)
    .set(auth())
    .send({ is_gating: false })
    .expect(200);
  assert.equal(res.body.link.is_gating, 0);
});

test('PUT policy + GET policy effective (threshold, active par ressource)', async () => {
  const put = await request(app)
    .put('/api/learning-links/policy')
    .set(auth())
    .send({
      resource_type: 'tutorial',
      resource_ref: resourceRef,
      mode: 'threshold',
      required_correct: 2,
      enabled: true,
    })
    .expect(200);
  assert.equal(put.body.effective.enabled, true);
  assert.equal(put.body.effective.mode, 'threshold');
  assert.equal(put.body.effective.requiredCorrect, 2);

  const get = await request(app)
    .get(`/api/learning-links/policy?resourceType=tutorial&resourceRef=${resourceRef}`)
    .set(auth())
    .expect(200);
  assert.equal(get.body.policy.enabled, 1);
  assert.equal(get.body.effective.mode, 'threshold');
});

test('GET config — gating desactive par defaut (site)', async () => {
  const res = await request(app).get('/api/learning-links/config').set(auth()).expect(200);
  assert.equal(res.body.gating.enabled, false);
  assert.ok(Array.isArray(res.body.resource_types));
});

test('DELETE supprime le lien', async () => {
  const list = await request(app).get(`/api/learning-links?questionCode=${qcode}`).set(auth());
  const id = list.body.links.find((l) => l.resource_ref === resourceRef).id;
  await request(app).delete(`/api/learning-links/${id}`).set(auth()).expect(200);
  const after = await request(app).get(`/api/learning-links?questionCode=${qcode}`).set(auth());
  assert.ok(!after.body.links.some((l) => l.resource_ref === resourceRef));
});
