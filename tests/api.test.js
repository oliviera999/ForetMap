require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const { initDatabase, queryAll, queryOne, execute } = require('../database');
const { app } = require('../server');
const request = require('supertest');

test.before(async () => {
  await initDatabase();
});

// ─── Auth ─────────────────────────────────────────────────────────────────
test('POST /api/auth/register crée un élève et renvoie 201', async () => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Test', lastName: 'Auth' + Date.now(), password: 'pass1234' })
    .expect(201);
  assert.ok(res.body.id);
  assert.strictEqual(res.body.first_name, 'Test');
  assert.strictEqual(res.body.password, undefined);
});

test('POST /api/auth/login avec mauvais mot de passe renvoie 401', async () => {
  const last = 'User' + Date.now();
  await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'BadPass', lastName: last, password: 'good' });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ firstName: 'BadPass', lastName: last, password: 'wrong' })
    .expect(401);
  assert.ok(res.body.error);
});

test('POST /api/auth/teacher avec mauvais PIN renvoie 401', async () => {
  const res = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: '0000' })
    .expect(401);
  assert.ok(res.body.error);
});

test('POST /api/auth/teacher avec bon PIN renvoie 200 et un token', async () => {
  const res = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  assert.ok(res.body.token);
});

test('GET /api/maps renvoie les cartes configurées', async () => {
  const res = await request(app)
    .get('/api/maps')
    .expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some(m => m.id === 'foret'));
  assert.ok(res.body.some(m => m.id === 'n3'));
});

// ─── Statuts tâches (assign / unassign) ───────────────────────────────────
test('Assign puis unassign met à jour le statut de la tâche', async () => {
  const auth = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' });
  const token = auth.body.token;

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';
  const createRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: 'Tâche test statut', zone_id: zoneId, required_students: 1 })
    .expect(201);
  const taskId = createRes.body.id;

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Statut', lastName: 'Elève' + Date.now(), password: 'pwd1' })
    .expect(201);
  const { first_name, last_name, id: studentId } = studentRes.body;

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .send({ firstName: first_name, lastName: last_name, studentId })
    .expect(200);
  const afterAssign = await request(app).get(`/api/tasks/${taskId}`).expect(200);
  assert.strictEqual(afterAssign.body.status, 'in_progress');

  await request(app)
    .post(`/api/tasks/${taskId}/unassign`)
    .set('Authorization', 'Bearer ' + token)
    .send({ firstName: first_name, lastName: last_name, studentId })
    .expect(200);
  const afterUnassign = await request(app).get(`/api/tasks/${taskId}`).expect(200);
  assert.strictEqual(afterUnassign.body.status, 'available');
});

test('Zones et tâches supportent le filtrage multi-cartes', async () => {
  const auth = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' });
  const token = auth.body.token;

  const zoneN3 = await request(app)
    .post('/api/zones')
    .set('Authorization', 'Bearer ' + token)
    .send({
      name: 'Zone test N3',
      map_id: 'n3',
      points: [{ xp: 10, yp: 10 }, { xp: 20, yp: 10 }, { xp: 15, yp: 20 }],
      stage: 'empty',
    })
    .expect(201);
  assert.strictEqual(zoneN3.body.map_id, 'n3');

  const n3Zones = await request(app).get('/api/zones?map_id=n3').expect(200);
  const foretZones = await request(app).get('/api/zones?map_id=foret').expect(200);
  assert.ok(n3Zones.body.some(z => z.id === zoneN3.body.id));
  assert.ok(!foretZones.body.some(z => z.id === zoneN3.body.id));

  const n3Task = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Tâche N3 ${Date.now()}`, zone_id: zoneN3.body.id, required_students: 1 })
    .expect(201);
  assert.strictEqual(n3Task.body.map_id_resolved, 'n3');

  await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: `Tâche globale ${Date.now()}`, map_id: null, required_students: 1 })
    .expect(201);

  const tasksN3 = await request(app).get('/api/tasks?map_id=n3').expect(200);
  assert.ok(tasksN3.body.some(t => t.id === n3Task.body.id));
  assert.ok(tasksN3.body.some(t => (t.map_id_resolved || t.map_id || t.zone_map_id || null) == null));

  const tasksForet = await request(app).get('/api/tasks?map_id=foret').expect(200);
  assert.ok(!tasksForet.body.some(t => t.id === n3Task.body.id));
});

// ─── Suppression élève (cascade + statuts) ──────────────────────────────────
test('DELETE /api/students/:id supprime l’élève et recalcule les statuts des tâches', async () => {
  const auth = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' });
  const token = auth.body.token;

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';
  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', 'Bearer ' + token)
    .send({ title: 'Tâche pour suppression', zone_id: zoneId, required_students: 1 })
    .expect(201);
  const taskId = taskRes.body.id;

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'ToDelete', lastName: 'User' + Date.now(), password: 'pwd1' })
    .expect(201);
  const { id: studentId, first_name, last_name } = studentRes.body;

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .send({ firstName: first_name, lastName: last_name, studentId })
    .expect(200);

  await request(app)
    .delete(`/api/students/${studentId}`)
    .set('Authorization', 'Bearer ' + token)
    .expect(200);

  const assignments = await queryAll(
    'SELECT * FROM task_assignments WHERE student_first_name = ? AND student_last_name = ?',
    [first_name, last_name]
  );
  assert.strictEqual(assignments.length, 0);

  const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
  assert.strictEqual(task.status, 'available');
});

// ─── Admin logs (tampon Pino) ─────────────────────────────────────────────
test('GET /api/admin/logs sans DEPLOY_SECRET → 403', async () => {
  const prev = process.env.DEPLOY_SECRET;
  delete process.env.DEPLOY_SECRET;
  const res = await request(app).get('/api/admin/logs').expect(403);
  assert.ok(res.body.error);
  process.env.DEPLOY_SECRET = prev;
});

test('GET /api/admin/logs avec mauvais secret → 403', async () => {
  const prev = process.env.DEPLOY_SECRET;
  process.env.DEPLOY_SECRET = 'secret-admin-logs-test';
  const res = await request(app)
    .get('/api/admin/logs')
    .set('X-Deploy-Secret', 'wrong')
    .expect(403);
  assert.ok(res.body.error);
  process.env.DEPLOY_SECRET = prev;
});

test('GET /api/admin/logs avec bon secret → 200', async () => {
  const prev = process.env.DEPLOY_SECRET;
  process.env.DEPLOY_SECRET = 'secret-admin-logs-test';
  const res = await request(app)
    .get('/api/admin/logs?lines=50')
    .set('X-Deploy-Secret', 'secret-admin-logs-test')
    .expect(200);
  assert.strictEqual(res.body.ok, true);
  assert.ok(Array.isArray(res.body.entries));
  assert.ok(typeof res.body.bufferLines === 'number');
  assert.ok(typeof res.body.bufferMax === 'number');
  process.env.DEPLOY_SECRET = prev;
});
