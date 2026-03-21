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

test('GET /api/observations/:id/image retourne le fichier image', async () => {
  const studentId = `obs-student-${Date.now()}`;
  await execute(
    'INSERT INTO students (id, first_name, last_name, password, last_seen) VALUES (?, ?, ?, ?, ?)',
    [studentId, 'Obs', 'Image', 'x', new Date().toISOString()]
  );
  const created = await execute(
    'INSERT INTO observation_logs (student_id, zone_id, content, image_path, created_at) VALUES (?, ?, ?, ?, ?)',
    [studentId, null, 'Observation image', null, new Date().toISOString()]
  );
  const obsId = created.insertId;
  const relativePath = `observations/${studentId}_${obsId}.jpg`;
  saveBase64ToDisk(relativePath, SAMPLE_IMAGE_DATA);
  await execute('UPDATE observation_logs SET image_path = ? WHERE id = ?', [relativePath, obsId]);

  const res = await request(app).get(`/api/observations/${obsId}/image`).expect(200);
  assert.ok((res.headers['content-type'] || '').toLowerCase().includes('image'));
});

test('GET /api/observations/:id/image retourne 404 si fichier absent', async () => {
  const studentId = `obs-missing-${Date.now()}`;
  await execute(
    'INSERT INTO students (id, first_name, last_name, password, last_seen) VALUES (?, ?, ?, ?, ?)',
    [studentId, 'Obs', 'Missing', 'x', new Date().toISOString()]
  );
  const created = await execute(
    'INSERT INTO observation_logs (student_id, zone_id, content, image_path, created_at) VALUES (?, ?, ?, ?, ?)',
    [studentId, null, 'Observation missing', `observations/${studentId}_${Date.now()}_missing.jpg`, new Date().toISOString()]
  );

  const res = await request(app).get(`/api/observations/${created.insertId}/image`).expect(404);
  assert.ok((res.body.error || '').toLowerCase().includes('fichier'));
});
