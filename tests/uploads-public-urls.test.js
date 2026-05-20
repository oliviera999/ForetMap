'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { saveBase64ToDisk } = require('../lib/uploads');
const {
  isSafePublicZonePhotoRelativePath,
  isSafePublicMarkerPhotoRelativePath,
  zoneMapPhotoImageUrl,
  markerMapPhotoImageUrl,
  companionMapPhotoThumbRelativePath,
} = require('../lib/uploadsPublicUrls');
const { PUBLIC_IMAGE_CACHE_CONTROL } = require('../lib/httpImageCache');

const SAMPLE_IMAGE_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=';
let studentToken = '';

test.before(async () => {
  await initSchema();
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Upload', lastName: `Public${Date.now()}`, password: 'pass1234' })
    .expect(201);
  studentToken = reg.body.authToken;
});

test('Validateurs chemins publics zones / repères', () => {
  assert.strictEqual(isSafePublicZonePhotoRelativePath('zones/z1/12.jpg'), true);
  assert.strictEqual(isSafePublicZonePhotoRelativePath('zones/../evil/12.jpg'), false);
  assert.strictEqual(isSafePublicMarkerPhotoRelativePath('markers/mk-1/3.jpg'), true);
  assert.strictEqual(companionMapPhotoThumbRelativePath('zones/z1/12.jpg'), 'zones/z1/12.thumb.jpg');
});

test('zoneMapPhotoImageUrl expose /uploads pour chemin canonique', () => {
  const u = zoneMapPhotoImageUrl('zones/my-zone/99.jpg', 'my-zone', 99);
  assert.strictEqual(u, '/uploads/zones/my-zone/99.jpg');
});

test('markerMapPhotoImageUrl expose /uploads pour chemin canonique', () => {
  const u = markerMapPhotoImageUrl('markers/abc/7.jpg', 'abc', 7);
  assert.strictEqual(u, '/uploads/markers/abc/7.jpg');
});

test('GET /uploads/... image pose Cache-Control public', async () => {
  const zoneId = `zone-cache-${Date.now()}`;
  await execute(
    'INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, points, color) VALUES (?, ?, 0, 0, 0, 0, ?, ?, 0, ?, ?)',
    [zoneId, 'Zone cache hdr', '', 'empty', '[]', '#86efac80']
  );
  const created = await execute(
    'INSERT INTO zone_photos (zone_id, image_path, caption, uploaded_at) VALUES (?, ?, ?, ?)',
    [zoneId, null, 'c', new Date().toISOString()]
  );
  const photoId = created.insertId;
  const relativePath = `zones/${zoneId}/${photoId}.jpg`;
  saveBase64ToDisk(relativePath, SAMPLE_IMAGE_DATA);

  const res = await request(app).get(`/uploads/${relativePath}`).expect(200);
  assert.strictEqual((res.headers['cache-control'] || '').toLowerCase(), PUBLIC_IMAGE_CACHE_CONTROL.toLowerCase());
});

test('GET /api/zones/:id/photos/:pid/data redirige vers /uploads (302, sans suivre)', async () => {
  const zoneId = `zone-redir-${Date.now()}`;
  await execute(
    'INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, points, color) VALUES (?, ?, 0, 0, 0, 0, ?, ?, 0, ?, ?)',
    [zoneId, 'Zone redir', '', 'empty', '[]', '#86efac80']
  );
  const created = await execute(
    'INSERT INTO zone_photos (zone_id, image_path, caption, uploaded_at) VALUES (?, ?, ?, ?)',
    [zoneId, null, 'r', new Date().toISOString()]
  );
  const photoId = created.insertId;
  const relativePath = `zones/${zoneId}/${photoId}.jpg`;
  saveBase64ToDisk(relativePath, SAMPLE_IMAGE_DATA);
  await execute('UPDATE zone_photos SET image_path = ? WHERE id = ?', [relativePath, photoId]);

  const res = await request(app)
    .get(`/api/zones/${zoneId}/photos/${photoId}/data`)
    .set('Authorization', `Bearer ${studentToken}`)
    .redirects(0)
    .expect(302);
  assert.strictEqual(res.headers.location, `/uploads/${relativePath}`);
});

test('GET /api/zones/:id/photos/:pid/data sans token renvoie 401', async () => {
  const zoneId = `zone-redir-auth-${Date.now()}`;
  await execute(
    'INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, points, color) VALUES (?, ?, 0, 0, 0, 0, ?, ?, 0, ?, ?)',
    [zoneId, 'Zone redir auth', '', 'empty', '[]', '#86efac80']
  );
  const created = await execute(
    'INSERT INTO zone_photos (zone_id, image_path, caption, uploaded_at) VALUES (?, ?, ?, ?)',
    [zoneId, `zones/${zoneId}/1.jpg`, 'a', new Date().toISOString()]
  );
  await request(app)
    .get(`/api/zones/${zoneId}/photos/${created.insertId}/data`)
    .redirects(0)
    .expect(401);
});
