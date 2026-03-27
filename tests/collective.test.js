require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

test.before(async () => {
  await initSchema();
});

async function getTeacherToken() {
  const auth = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  return auth.body.token;
}

function getRestrictedTeacherToken() {
  return signAuthToken({
    userType: 'teacher',
    userId: 'test-teacher-no-stats',
    roleId: null,
    roleSlug: 'custom_teacher',
    roleDisplayName: 'Prof',
    permissions: ['teacher.access'],
    elevated: false,
  }, false);
}

async function getCollectiveVersion(token, contextType = 'map', contextId = 'foret') {
  const res = await request(app)
    .get(`/api/collective/session?contextType=${contextType}&contextId=${contextId}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  return Number(res.body?.session?.version || 0);
}

test('Collectif: requiert un token JWT', async () => {
  await request(app)
    .get('/api/collective/session?contextType=map&contextId=foret')
    .expect(401);
});

test('Collectif: refuse un token sans permission stats.read.all', async () => {
  const token = getRestrictedTeacherToken();
  await request(app)
    .get('/api/collective/session?contextType=map&contextId=foret')
    .set('Authorization', `Bearer ${token}`)
    .expect(403);
});

test('Collectif: cycle session + élève + absence + reset', async () => {
  const token = await getTeacherToken();
  const startVersion = await getCollectiveVersion(token);
  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Collectif', lastName: `Eleve${Date.now()}`, password: 'pwd1234' })
    .expect(201);
  const studentId = studentRes.body.id;

  const activated = await request(app)
    .put('/api/collective/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', isActive: true, expectedVersion: startVersion })
    .expect(200);
  assert.strictEqual(Number(activated.body?.session?.is_active), 1);
  assert.ok(Number.isInteger(Number(activated.body?.session?.version)));
  assert.ok(Array.isArray(activated.body.selected_student_ids));
  let version = Number(activated.body?.session?.version || 0);

  const absent = await request(app)
    .put('/api/collective/session/attendance')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', studentId, absent: true, expectedVersion: version })
    .expect(200);
  assert.ok(absent.body.absent_student_ids.includes(studentId));
  version = Number(absent.body?.session?.version || version);

  const unselected = await request(app)
    .put('/api/collective/session/students')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', studentId, selected: false, expectedVersion: version })
    .expect(200);
  assert.ok(!unselected.body.selected_student_ids.includes(studentId));
  assert.ok(!unselected.body.absent_student_ids.includes(studentId));
  version = Number(unselected.body?.session?.version || version);

  const reset = await request(app)
    .post('/api/collective/session/reset')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', expectedVersion: version })
    .expect(200);
  assert.strictEqual(Number(reset.body?.session?.is_active), 0);
  assert.strictEqual(reset.body.selected_task_ids.length, 0);
  assert.strictEqual(reset.body.selected_student_ids.length, 0);
  assert.strictEqual(reset.body.absent_student_ids.length, 0);
});

test('Collectif: refuse l’ajout d’une tâche hors contexte', async () => {
  const token = await getTeacherToken();
  const startVersion = await getCollectiveVersion(token);
  const activated = await request(app)
    .put('/api/collective/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', isActive: true, expectedVersion: startVersion })
    .expect(200);
  const zoneRes = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Zone test collectif ${Date.now()}`,
      map_id: 'n3',
      points: [{ xp: 11, yp: 11 }, { xp: 21, yp: 11 }, { xp: 16, yp: 21 }],
      stage: 'empty',
    })
    .expect(201);

  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: `Tâche hors contexte ${Date.now()}`,
      zone_id: zoneRes.body.id,
      required_students: 1,
    })
    .expect(201);

  const rejected = await request(app)
    .put('/api/collective/session/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contextType: 'map',
      contextId: 'foret',
      taskId: taskRes.body.id,
      selected: true,
      expectedVersion: Number(activated.body?.session?.version || 0),
    })
    .expect(400);

  assert.strictEqual(rejected.body.error, 'Tâche hors contexte');
});

test('Collectif: rejette une écriture sans expectedVersion', async () => {
  const token = await getTeacherToken();
  await request(app)
    .put('/api/collective/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', isActive: true })
    .expect(400);
});

test('Collectif: retourne 409 si la version attendue est obsolète', async () => {
  const token = await getTeacherToken();
  const startVersion = await getCollectiveVersion(token);
  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Version', lastName: `Conflict${Date.now()}`, password: 'pwd1234' })
    .expect(201);
  const studentId = studentRes.body.id;

  const activated = await request(app)
    .put('/api/collective/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', isActive: true, expectedVersion: startVersion })
    .expect(200);
  const staleVersion = Number(activated.body?.session?.version || 0);

  const updated = await request(app)
    .put('/api/collective/session/students')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contextType: 'map',
      contextId: 'foret',
      studentId,
      selected: false,
      expectedVersion: staleVersion,
    })
    .expect(200);
  const currentVersion = Number(updated.body?.session?.version || 0);
  assert.ok(currentVersion > staleVersion);

  const conflict = await request(app)
    .put('/api/collective/session/students')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contextType: 'map',
      contextId: 'foret',
      studentId,
      selected: true,
      expectedVersion: staleVersion,
    })
    .expect(409);

  assert.strictEqual(conflict.body.error, 'Session collectif modifiée ailleurs');
  assert.strictEqual(Number(conflict.body.current_version), currentVersion);
  assert.ok(conflict.body.current?.session);
});

test('Collectif: réconcilie les tâches sorties du contexte', async () => {
  const token = await getTeacherToken();
  const startVersion = await getCollectiveVersion(token, 'map', 'n3');

  const zoneRes = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Zone reconcile ${Date.now()}`,
      map_id: 'n3',
      points: [{ xp: 31, yp: 31 }, { xp: 41, yp: 31 }, { xp: 36, yp: 41 }],
      stage: 'empty',
    })
    .expect(201);

  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: `Tâche reconcile ${Date.now()}`,
      zone_id: zoneRes.body.id,
      required_students: 1,
    })
    .expect(201);

  const activated = await request(app)
    .put('/api/collective/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'n3', isActive: true, expectedVersion: startVersion })
    .expect(200);
  const versionAfterActivate = Number(activated.body?.session?.version || 0);

  const selected = await request(app)
    .put('/api/collective/session/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contextType: 'map',
      contextId: 'n3',
      taskId: taskRes.body.id,
      selected: true,
      expectedVersion: versionAfterActivate,
    })
    .expect(200);
  const versionAfterSelect = Number(selected.body?.session?.version || 0);
  assert.ok(selected.body.selected_task_ids.includes(taskRes.body.id));

  // Simule une mutation "classique" qui déplace la tâche hors du contexte n3.
  await execute('UPDATE tasks SET map_id = ? WHERE id = ?', ['foret', taskRes.body.id]);

  const reconciled = await request(app)
    .get('/api/collective/session?contextType=map&contextId=n3')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.ok(!reconciled.body.selected_task_ids.includes(taskRes.body.id));
  assert.ok(Number(reconciled.body?.session?.version || 0) > versionAfterSelect);
});

test('Collectif: opérations bulk élèves et présence', async () => {
  const token = await getTeacherToken();
  const s1 = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Bulk', lastName: `One${Date.now()}`, password: 'pwd1234' })
    .expect(201);
  const s2 = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Bulk', lastName: `Two${Date.now()}`, password: 'pwd1234' })
    .expect(201);

  const startVersion = await getCollectiveVersion(token);
  const activated = await request(app)
    .put('/api/collective/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', isActive: true, expectedVersion: startVersion })
    .expect(200);
  let version = Number(activated.body?.session?.version || 0);

  const absentBulk = await request(app)
    .put('/api/collective/session/attendance/bulk')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contextType: 'map',
      contextId: 'foret',
      studentIds: [s1.body.id, s2.body.id],
      absent: true,
      expectedVersion: version,
    })
    .expect(200);
  assert.ok(absentBulk.body.absent_student_ids.includes(s1.body.id));
  assert.ok(absentBulk.body.absent_student_ids.includes(s2.body.id));
  assert.strictEqual(absentBulk.body.bulk.applied.length, 2);
  version = Number(absentBulk.body?.session?.version || version);

  const removeBulk = await request(app)
    .put('/api/collective/session/students/bulk')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contextType: 'map',
      contextId: 'foret',
      studentIds: [s1.body.id],
      selected: false,
      expectedVersion: version,
    })
    .expect(200);
  assert.ok(!removeBulk.body.selected_student_ids.includes(s1.body.id));
  assert.ok(!removeBulk.body.absent_student_ids.includes(s1.body.id));
  assert.strictEqual(removeBulk.body.bulk.applied.length, 1);
});

test('Collectif: opérations bulk tâches gèrent hors contexte et invalides', async () => {
  const token = await getTeacherToken();
  const startVersion = await getCollectiveVersion(token, 'map', 'foret');
  const activated = await request(app)
    .put('/api/collective/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', isActive: true, expectedVersion: startVersion })
    .expect(200);
  let version = Number(activated.body?.session?.version || 0);
  const validTaskId = activated.body.selected_task_ids[0];
  assert.ok(validTaskId);

  const zoneRes = await request(app)
    .post('/api/zones')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `Zone bulk out ${Date.now()}`,
      map_id: 'n3',
      points: [{ xp: 51, yp: 51 }, { xp: 61, yp: 51 }, { xp: 56, yp: 61 }],
      stage: 'empty',
    })
    .expect(201);
  const outTaskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: `Tâche bulk out ${Date.now()}`,
      zone_id: zoneRes.body.id,
      required_students: 1,
    })
    .expect(201);

  const bulk = await request(app)
    .put('/api/collective/session/tasks/bulk')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contextType: 'map',
      contextId: 'foret',
      taskIds: [validTaskId, outTaskRes.body.id, 'task-invalide'],
      selected: true,
      expectedVersion: version,
    })
    .expect(200);
  assert.ok(bulk.body.bulk.applied.includes(validTaskId));
  assert.ok(bulk.body.bulk.invalid.includes('task-invalide'));
  assert.ok(bulk.body.bulk.out_of_context.includes(outTaskRes.body.id));
  version = Number(bulk.body?.session?.version || version);

  const removeBulk = await request(app)
    .put('/api/collective/session/tasks/bulk')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contextType: 'map',
      contextId: 'foret',
      taskIds: [validTaskId],
      selected: false,
      expectedVersion: version,
    })
    .expect(200);
  assert.ok(!removeBulk.body.selected_task_ids.includes(validTaskId));
});

test('Collectif: endpoints bulk respectent expectedVersion', async () => {
  const token = await getTeacherToken();
  const startVersion = await getCollectiveVersion(token);
  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Bulk', lastName: `Version${Date.now()}`, password: 'pwd1234' })
    .expect(201);

  const activated = await request(app)
    .put('/api/collective/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', isActive: true, expectedVersion: startVersion })
    .expect(200);
  const staleVersion = Number(activated.body?.session?.version || 0);

  await request(app)
    .put('/api/collective/session/students')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contextType: 'map',
      contextId: 'foret',
      studentId: studentRes.body.id,
      selected: false,
      expectedVersion: staleVersion,
    })
    .expect(200);

  const conflict = await request(app)
    .put('/api/collective/session/students/bulk')
    .set('Authorization', `Bearer ${token}`)
    .send({
      contextType: 'map',
      contextId: 'foret',
      studentIds: [studentRes.body.id],
      selected: true,
      expectedVersion: staleVersion,
    })
    .expect(409);

  assert.strictEqual(conflict.body.error, 'Session collectif modifiée ailleurs');
  assert.ok(conflict.body.current?.session);
});
