'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { saveBase64ToDisk } = require('../lib/uploads');

const SAMPLE_IMAGE_DATA =
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

test('Route image zone lit bien depuis disque', async () => {
  const zoneId = `zone-disk-${Date.now()}`;
  await execute(
    'INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, points, color) VALUES (?, ?, 0, 0, 0, 0, ?, ?, 0, ?, ?)',
    [zoneId, 'Zone disk image', '', 'empty', '[]', '#86efac80']
  );
  const created = await execute(
    'INSERT INTO zone_photos (zone_id, image_path, caption, uploaded_at) VALUES (?, ?, ?, ?)',
    [zoneId, null, 'disk', new Date().toISOString()]
  );
  const photoId = created.insertId;
  const relativePath = `zones/${zoneId}/${photoId}.jpg`;
  saveBase64ToDisk(relativePath, SAMPLE_IMAGE_DATA);
  await execute('UPDATE zone_photos SET image_path = ? WHERE id = ?', [relativePath, photoId]);

  const res = await request(app)
    .get(`/api/zones/${zoneId}/photos/${photoId}/data`)
    .redirects(1)
    .expect(200);
  assert.ok((res.headers['content-type'] || '').toLowerCase().includes('image'));
});

test('Route image zone renvoie 404 si image_path absent', async () => {
  const zoneId = `zone-no-file-${Date.now()}`;
  await execute(
    'INSERT INTO zones (id, name, x, y, width, height, current_plant, stage, special, points, color) VALUES (?, ?, 0, 0, 0, 0, ?, ?, 0, ?, ?)',
    [zoneId, 'Zone no file', '', 'empty', '[]', '#86efac80']
  );
  const result = await execute(
    'INSERT INTO zone_photos (zone_id, image_path, caption, uploaded_at) VALUES (?, ?, ?, ?)',
    [zoneId, null, 'none', new Date().toISOString()]
  );

  await request(app)
    .get(`/api/zones/${zoneId}/photos/${result.insertId}/data`)
    .redirects(0)
    .expect(404);
});

test('Route image task log renvoie 404 si image_path pointe vers un fichier absent', async () => {
  const taskId = `task-missing-file-${Date.now()}`;
  await execute(
    'INSERT INTO tasks (id, title, description, zone_id, due_date, required_students, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [taskId, 'Task missing file', '', null, null, 1, 'available', new Date().toISOString()]
  );
  const result = await execute(
    'INSERT INTO task_logs (task_id, student_first_name, student_last_name, comment, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [taskId, 'Missing', 'File', 'log', `task-logs/${taskId}_${Date.now()}_missing.jpg`, new Date().toISOString()]
  );

  const res = await request(app)
    .get(`/api/tasks/${taskId}/logs/${result.insertId}/image`)
    .expect(404);
  assert.ok((res.body.error || '').toLowerCase().includes('fichier'));
});

test('Route image task log lit bien depuis disque (mode disk-only)', async () => {
  const taskId = `task-clear-${Date.now()}`;
  await execute(
    'INSERT INTO tasks (id, title, description, zone_id, due_date, required_students, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [taskId, 'Task clear scenario', '', null, null, 1, 'available', new Date().toISOString()]
  );
  const created = await execute(
    'INSERT INTO task_logs (task_id, student_first_name, student_last_name, comment, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [taskId, 'Disk', 'Only', 'log', null, new Date().toISOString()]
  );
  const logId = created.insertId;
  const relativePath = `task-logs/${taskId}_${logId}.jpg`;
  saveBase64ToDisk(relativePath, SAMPLE_IMAGE_DATA);
  await execute('UPDATE task_logs SET image_path = ? WHERE id = ?', [relativePath, logId]);

  const res = await request(app)
    .get(`/api/tasks/${taskId}/logs/${logId}/image`)
    .expect(200);
  assert.ok((res.headers['content-type'] || '').toLowerCase().includes('image'));
});
