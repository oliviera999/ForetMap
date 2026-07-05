'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { saveBase64ToDisk } = require('../lib/uploads');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');

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
    [studentId, null, 'Observation image', null, new Date().toISOString()],
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

test('GET /api/observations/student/:id refuse un autre élève (IDOR)', async () => {
  const owner = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Owner', lastName: `Obs${Date.now()}`, password: 'pass1234' })
    .expect(201);
  const intruder = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Intruder', lastName: `Obs${Date.now()}`, password: 'pass1234' })
    .expect(201);

  await request(app)
    .post('/api/observations')
    .set('Authorization', `Bearer ${owner.body.authToken}`)
    .send({ studentId: owner.body.id, content: 'Observation privée' })
    .expect(201);

  await request(app)
    .get(`/api/observations/student/${owner.body.id}`)
    .set('Authorization', `Bearer ${intruder.body.authToken}`)
    .expect(403);
});

test('DELETE /api/observations/:id refuse la suppression par un autre élève', async () => {
  const owner = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Delete', lastName: `Owner${Date.now()}`, password: 'pass1234' })
    .expect(201);
  const intruder = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Delete', lastName: `Intruder${Date.now()}`, password: 'pass1234' })
    .expect(201);

  const obs = await request(app)
    .post('/api/observations')
    .set('Authorization', `Bearer ${owner.body.authToken}`)
    .send({ studentId: owner.body.id, content: 'À ne pas supprimer' })
    .expect(201);

  await request(app)
    .delete(`/api/observations/${obs.body.id}`)
    .set('Authorization', `Bearer ${intruder.body.authToken}`)
    .expect(403);
});

test('DELETE /api/observations/:id : un admin peut supprimer le carnet d’un élève (permission manage)', async () => {
  const owner = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Manage', lastName: `Owner${Date.now()}`, password: 'pass1234' })
    .expect(201);

  const obs = await request(app)
    .post('/api/observations')
    .set('Authorization', `Bearer ${owner.body.authToken}`)
    .send({ studentId: owner.body.id, content: 'Supprimable par le staff' })
    .expect(201);

  const adminToken = await ensureAdminTeacherAuthToken();
  await request(app)
    .delete(`/api/observations/${obs.body.id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('GET /api/observations/:id/image retourne 404 si fichier absent', async () => {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Obs', lastName: `Missing${Date.now()}`, password: 'pass1234' })
    .expect(201);
  const studentId = reg.body.id;
  const created = await execute(
    'INSERT INTO observation_logs (student_id, zone_id, content, image_path, created_at) VALUES (?, ?, ?, ?, ?)',
    [
      studentId,
      null,
      'Observation missing',
      `observations/${studentId}_${Date.now()}_missing.jpg`,
      new Date().toISOString(),
    ],
  );

  const res = await request(app)
    .get(`/api/observations/${created.insertId}/image`)
    .set('Authorization', `Bearer ${reg.body.authToken}`)
    .expect(404);
  assert.ok((res.body.error || '').toLowerCase().includes('fichier'));
});
