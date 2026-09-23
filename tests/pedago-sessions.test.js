'use strict';

// Séances pédagogiques (pilotes A/B, migration 282).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

const stamp = Date.now();
let token = '';
const auth = () => ({ Authorization: `Bearer ${token}` });
let createdId = '';

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
});

after(async () => {
  if (createdId) {
    await execute('DELETE FROM pedago_sessions WHERE id = ?', [createdId]).catch(() => {});
  }
});

test('GET /api/pedago-sessions — seed A/B publiés', async () => {
  const res = await request(app).get('/api/pedago-sessions').expect(200);
  assert.ok(Array.isArray(res.body.items));
  const slugs = res.body.items.map((i) => i.slug);
  assert.ok(slugs.includes('college-reconaitre-sans-toucher'));
  assert.ok(slugs.includes('college-qui-mange-qui'));
  const a = res.body.items.find((i) => i.slug === 'college-reconaitre-sans-toucher');
  assert.equal(a.templateKey, 'college_reconaitre');
  assert.equal(a.level, 'college');
  assert.ok(a.steps.length >= 4);
  assert.equal(a.steps[0].action.type, 'message');
});

test('GET détail + PUT config prof', async () => {
  const detail = await request(app)
    .get('/api/pedago-sessions/college-reconaitre-sans-toucher')
    .expect(200);
  assert.equal(detail.body.slug, 'college-reconaitre-sans-toucher');

  const put = await request(app)
    .put('/api/pedago-sessions/college-reconaitre-sans-toucher')
    .set(auth())
    .send({
      keyIdOrSlug: `cle-test-${stamp}`,
      plantId: 1,
      notionNiveau: 'cycle3',
      isPublished: true,
    })
    .expect(200);
  assert.equal(put.body.config.keyIdOrSlug, `cle-test-${stamp}`);
  assert.equal(put.body.config.plantId, 1);
  assert.equal(put.body.config.notionNiveau, 'cycle3');
  const keyStep = put.body.steps.find((s) => s.action.type === 'open_id_key');
  assert.equal(keyStep.action.payload.keyIdOrSlug, `cle-test-${stamp}`);

  // Restaure placeholders pour ne pas polluer d'autres tests
  await request(app)
    .put('/api/pedago-sessions/college-reconaitre-sans-toucher')
    .set(auth())
    .send({
      keyIdOrSlug: null,
      plantId: null,
      plantIds: [],
      notionNiveau: 'cycle4',
      isPublished: true,
    })
    .expect(200);
});

test('POST crée une copie de template ; ?all=1 réservé manage', async () => {
  const denied = await request(app).get('/api/pedago-sessions?all=1').expect(403);
  assert.ok(denied.body.error);

  const created = await request(app)
    .post('/api/pedago-sessions')
    .set(auth())
    .send({
      templateKey: 'college_qui_mange',
      title: `Test séance ${stamp}`,
      slug: `test-seance-${stamp}`.slice(0, 120),
      isPublished: false,
      config: { plantIds: [11, 12, 13], notionNiveau: 'cycle4' },
    })
    .expect(201);
  createdId = created.body.id;
  assert.equal(created.body.templateKey, 'college_qui_mange');
  assert.equal(created.body.isPublished, false);
  assert.deepEqual(created.body.config.plantIds, [11, 12, 13]);

  const pub = await request(app).get('/api/pedago-sessions').expect(200);
  assert.ok(!pub.body.items.some((i) => i.id === createdId));

  const all = await request(app).get('/api/pedago-sessions?all=1').set(auth()).expect(200);
  assert.ok(all.body.items.some((i) => i.id === createdId));

  const hidden = await request(app).get(`/api/pedago-sessions/${createdId}`).expect(404);
  assert.ok(hidden.body.error);

  await request(app).get(`/api/pedago-sessions/${createdId}`).set(auth()).expect(200);
});

test('seed toujours présent en base après initSchema', async () => {
  const row = await queryOne(`SELECT slug, is_published FROM pedago_sessions WHERE slug = ?`, [
    'college-qui-mange-qui',
  ]);
  assert.ok(row);
  assert.equal(!!row.is_published, true);
});
