require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
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
  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Collectif', lastName: `Eleve${Date.now()}`, password: 'pwd1234' })
    .expect(201);
  const studentId = studentRes.body.id;

  const activated = await request(app)
    .put('/api/collective/session')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', isActive: true })
    .expect(200);
  assert.strictEqual(Number(activated.body?.session?.is_active), 1);
  assert.ok(Array.isArray(activated.body.selected_student_ids));

  const absent = await request(app)
    .put('/api/collective/session/attendance')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', studentId, absent: true })
    .expect(200);
  assert.ok(absent.body.absent_student_ids.includes(studentId));

  const unselected = await request(app)
    .put('/api/collective/session/students')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret', studentId, selected: false })
    .expect(200);
  assert.ok(!unselected.body.selected_student_ids.includes(studentId));
  assert.ok(!unselected.body.absent_student_ids.includes(studentId));

  const reset = await request(app)
    .post('/api/collective/session/reset')
    .set('Authorization', `Bearer ${token}`)
    .send({ contextType: 'map', contextId: 'foret' })
    .expect(200);
  assert.strictEqual(Number(reset.body?.session?.is_active), 0);
  assert.strictEqual(reset.body.selected_task_ids.length, 0);
  assert.strictEqual(reset.body.selected_student_ids.length, 0);
  assert.strictEqual(reset.body.absent_student_ids.length, 0);
});

test('Collectif: refuse l’ajout d’une tâche hors contexte', async () => {
  const token = await getTeacherToken();
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
    })
    .expect(400);

  assert.strictEqual(rejected.body.error, 'Tâche hors contexte');
});
