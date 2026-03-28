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
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Obs', lastName: `Image${Date.now()}`, password: 'pass1234' })
    .expect(201);
  const studentId = reg.body.id;
  const created = await execute(
    'INSERT INTO observation_logs (student_id, zone_id, content, image_path, created_at) VALUES (?, ?, ?, ?, ?)',
    [studentId, null, 'Observation image', null, new Date().toISOString()]
  );
  const obsId = created.insertId;
  const relativePath = `observations/${studentId}_${obsId}.jpg`;
  saveBase64ToDisk(relativePath, SAMPLE_IMAGE_DATA);
  await execute('UPDATE observation_logs SET image_path = ? WHERE id = ?', [relativePath, obsId]);

  const res = await request(app)
    .get(`/api/observations/${obsId}/image`)
    .set('Authorization', `Bearer ${reg.body.authToken}`)
    .expect(200);
  assert.ok((res.headers['content-type'] || '').toLowerCase().includes('image'));
});

test('GET /api/observations/:id/image retourne 404 si fichier absent', async () => {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Obs', lastName: `Missing${Date.now()}`, password: 'pass1234' })
    .expect(201);
  const studentId = reg.body.id;
  const created = await execute(
    'INSERT INTO observation_logs (student_id, zone_id, content, image_path, created_at) VALUES (?, ?, ?, ?, ?)',
    [studentId, null, 'Observation missing', `observations/${studentId}_${Date.now()}_missing.jpg`, new Date().toISOString()]
  );

  const res = await request(app)
    .get(`/api/observations/${created.insertId}/image`)
    .set('Authorization', `Bearer ${reg.body.authToken}`)
    .expect(404);
  assert.ok((res.body.error || '').toLowerCase().includes('fichier'));
});
