require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');

let teacherToken;
let plantId;

test.before(async () => {
  await initSchema();
  const auth = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  teacherToken = auth.body.token;
});

test('POST /api/plants rejette les URLs photo en http', async () => {
  const res = await request(app)
    .post('/api/plants')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      name: `Plante HTTP ${Date.now()}`,
      emoji: '🌿',
      photo: 'http://example.com/photo.jpg',
    })
    .expect(400);

  assert.ok(res.body.error.includes('HTTPS'));
});

test('POST /api/plants accepte les URLs photo en https', async () => {
  const res = await request(app)
    .post('/api/plants')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      name: `Plante HTTPS ${Date.now()}`,
      emoji: '🌱',
      photo: 'https://example.com/photo.jpg',
      photo_leaf: 'https://example.com/leaf.jpg, https://example.com/leaf-2.jpg',
    })
    .expect(201);

  assert.ok(res.body.id);
  plantId = res.body.id;
});

test('PUT /api/plants/:id rejette les URLs photo en http', async () => {
  const res = await request(app)
    .put(`/api/plants/${plantId}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      photo_flower: 'http://example.com/flower.jpg',
    })
    .expect(400);

  assert.ok(res.body.error.includes('HTTPS'));
});

test('GET /api/health expose une CSP avec img-src restreint', async () => {
  const res = await request(app).get('/api/health').expect(200);
  const csp = res.headers['content-security-policy'] || '';
  assert.ok(csp.includes("img-src 'self' https: data: blob:;"));
});
