'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');

const LEGACY_IMAGE_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=';

test.before(async () => {
  await initSchema();
});

test('Route prof sans token -> 401', async () => {
  await request(app).get('/api/stats/all').expect(401);
});

test('Route prof avec token invalide -> 401', async () => {
  const res = await request(app)
    .get('/api/stats/all')
    .set('Authorization', 'Bearer token-invalide')
    .expect(401);
  assert.ok((res.body.error || '').toLowerCase().includes('token'));
});

test('POST /api/admin/restart sans DEPLOY_SECRET -> 403', async () => {
  const prev = process.env.DEPLOY_SECRET;
  delete process.env.DEPLOY_SECRET;
  const res = await request(app).post('/api/admin/restart').send({ secret: 'x' }).expect(403);
  assert.ok(res.body.error);
  process.env.DEPLOY_SECRET = prev;
});

test('POST /api/admin/restart avec mauvais secret -> 403', async () => {
  const prev = process.env.DEPLOY_SECRET;
  process.env.DEPLOY_SECRET = 'restart-test-secret';
  const res = await request(app)
    .post('/api/admin/restart')
    .set('X-Deploy-Secret', 'wrong-secret')
    .expect(403);
  assert.ok(res.body.error);
  process.env.DEPLOY_SECRET = prev;
});

test('Route image legacy zone (image_data) reste compatible', async () => {
  const zoneId = `zone-legacy-${Date.now()}`;
  await execute(
    'INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, points, color) VALUES (?, ?, 0, 0, 0, 0, ?, ?, 0, ?, ?)',
    [zoneId, 'Zone legacy image', '', 'empty', '[]', '#86efac80']
  );
  const now = new Date().toISOString();
  const result = await execute(
    'INSERT INTO zone_photos (zone_id, image_data, image_path, caption, uploaded_at) VALUES (?, ?, ?, ?, ?)',
    [zoneId, LEGACY_IMAGE_DATA, null, 'legacy', now]
  );

  const res = await request(app)
    .get(`/api/zones/${zoneId}/photos/${result.insertId}/data`)
    .expect(200);
  assert.strictEqual(res.body.image_data, LEGACY_IMAGE_DATA);
});
