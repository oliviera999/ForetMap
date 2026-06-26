require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

test.before(async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await initSchema();
      break;
    } catch (err) {
      if (err?.code !== 'ER_LOCK_DEADLOCK' || attempt === 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
});

const VALID_ANCHORS = [
  { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
  { xp: 90, yp: 12, lat: 48.85, lng: 2.31 },
  { xp: 12, yp: 88, lat: 48.84, lng: 2.3 },
];

async function createTempMap(token) {
  const id = `geo_${Date.now()}`.slice(0, 31);
  await request(app)
    .post('/api/settings/admin/maps')
    .set('Authorization', `Bearer ${token}`)
    .send({ id, label: 'Plan georef test', sort_order: 90, map_image_url: '/map.png' })
    .expect(201);
  return id;
}

test('PUT /admin/maps/:id/georef refuse sans authentification', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const id = await createTempMap(token);
  await request(app)
    .put(`/api/settings/admin/maps/${id}/georef`)
    .send({ anchors: VALID_ANCHORS, gps_enabled: true })
    .expect(401);
  await execute('DELETE FROM maps WHERE id = ?', [id]);
});

test('PUT /admin/maps/:id/georef rejette des ancres invalides (400)', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const id = await createTempMap(token);
  // Points colinéaires → triangle dégénéré.
  const collinear = [
    { xp: 0, yp: 0, lat: 1, lng: 1 },
    { xp: 50, yp: 50, lat: 2, lng: 2 },
    { xp: 100, yp: 100, lat: 3, lng: 3 },
  ];
  const res = await request(app)
    .put(`/api/settings/admin/maps/${id}/georef`)
    .set('Authorization', `Bearer ${token}`)
    .send({ anchors: collinear, gps_enabled: true })
    .expect(400);
  assert.ok(String(res.body?.error || '').length > 0);
  await execute('DELETE FROM maps WHERE id = ?', [id]);
});

test('PUT /admin/maps/:id/georef enregistre le calage et l’expose via GET /api/maps', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const id = await createTempMap(token);
  const saved = await request(app)
    .put(`/api/settings/admin/maps/${id}/georef`)
    .set('Authorization', `Bearer ${token}`)
    .send({ anchors: VALID_ANCHORS, gps_enabled: true })
    .expect(200);
  assert.strictEqual(saved.body.gps_enabled, true);
  assert.ok(Array.isArray(saved.body.georef));
  assert.strictEqual(saved.body.georef.length, 3);

  const list = await request(app).get('/api/maps').expect(200);
  const map = list.body.find((m) => m.id === id);
  assert.ok(map, 'plan présent dans la liste publique');
  assert.strictEqual(map.gps_enabled, true);
  assert.ok(Array.isArray(map.georef) && map.georef.length === 3);
  assert.strictEqual(map.georef[0].lat, VALID_ANCHORS[0].lat);

  await execute('DELETE FROM maps WHERE id = ?', [id]);
});

test('PUT /admin/maps/:id/georef force gps_enabled=false sans ancres', async () => {
  const token = await ensureAdminTeacherAuthToken();
  const id = await createTempMap(token);
  const res = await request(app)
    .put(`/api/settings/admin/maps/${id}/georef`)
    .set('Authorization', `Bearer ${token}`)
    .send({ anchors: [], gps_enabled: true })
    .expect(200);
  assert.strictEqual(res.body.gps_enabled, false);
  assert.strictEqual(res.body.georef, null);
  await execute('DELETE FROM maps WHERE id = ?', [id]);
});
