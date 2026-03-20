require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initDatabase } = require('../database');
const { app } = require('../server');
const request = require('supertest');

let teacherToken;
let studentData;

test.before(async () => {
  await initDatabase();
  const auth = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' });
  teacherToken = auth.body.token;

  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Feature', lastName: 'Test' + Date.now(), password: 'pwd123' });
  studentData = reg.body;
});

// ─── Export CSV ──────────────────────────────────────────────────────────────
test('GET /api/stats/export renvoie un CSV avec le bon content-type', async () => {
  const res = await request(app)
    .get('/api/stats/export')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);
  assert.ok(res.headers['content-type'].includes('text/csv'));
  assert.ok(res.headers['content-disposition'].includes('.csv'));
  assert.ok(res.text.includes('Prénom'));
});

test('GET /api/stats/export sans token renvoie 401', async () => {
  await request(app).get('/api/stats/export').expect(401);
});

// ─── Suppression de log (modération) ──────────────────────────────────────────
test('DELETE /api/tasks/:id/logs/:logId supprime un log', async () => {
  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({ title: 'Tâche log test', required_students: 1 })
    .expect(201);
  const taskId = taskRes.body.id;

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .send({ firstName: studentData.first_name, lastName: studentData.last_name, studentId: studentData.id });

  await request(app)
    .post(`/api/tasks/${taskId}/done`)
    .send({ comment: 'Test commentaire', firstName: studentData.first_name, lastName: studentData.last_name, studentId: studentData.id });

  const logsRes = await request(app).get(`/api/tasks/${taskId}/logs`).expect(200);
  assert.ok(logsRes.body.length > 0);
  const logId = logsRes.body[0].id;

  await request(app)
    .delete(`/api/tasks/${taskId}/logs/${logId}`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);

  const afterRes = await request(app).get(`/api/tasks/${taskId}/logs`).expect(200);
  assert.ok(!afterRes.body.find(l => l.id === logId));
});

// ─── Audit log ───────────────────────────────────────────────────────────────
test('GET /api/audit renvoie un tableau d\'actions', async () => {
  const res = await request(app)
    .get('/api/audit')
    .set('Authorization', 'Bearer ' + teacherToken)
    .expect(200);
  assert.ok(Array.isArray(res.body));
});

test('GET /api/audit sans token renvoie 401', async () => {
  await request(app).get('/api/audit').expect(401);
});

// ─── Observations ────────────────────────────────────────────────────────────
test('POST /api/observations crée une observation', async () => {
  const res = await request(app)
    .post('/api/observations')
    .send({ studentId: studentData.id, content: 'Les tomates poussent bien', zone_id: null })
    .expect(201);
  assert.ok(res.body.id);
  assert.strictEqual(res.body.content, 'Les tomates poussent bien');
});

test('GET /api/observations/student/:id retourne les observations', async () => {
  const res = await request(app)
    .get(`/api/observations/student/${studentData.id}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length > 0);
});

test('DELETE /api/observations/:id supprime une observation', async () => {
  const obs = await request(app)
    .post('/api/observations')
    .send({ studentId: studentData.id, content: 'À supprimer' })
    .expect(201);

  await request(app)
    .delete(`/api/observations/${obs.body.id}`)
    .expect(200);
});
