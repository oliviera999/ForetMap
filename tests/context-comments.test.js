require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');

test.before(async () => {
  await initSchema();
});

async function registerStudent(prefix) {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: prefix,
      lastName: `Ctx${stamp}`,
      email: `${prefix.toLowerCase()}_${stamp}@example.com`,
      password: 'pass1234',
    })
    .expect(201);
  return res.body;
}

async function teacherToken() {
  const res = await request(app)
    .post('/api/auth/login')
    .send({
      identifier: process.env.TEACHER_ADMIN_EMAIL,
      password: process.env.TEACHER_ADMIN_PASSWORD,
    })
    .expect(200);
  assert.ok(res.body?.authToken);
  return res.body.authToken;
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createContextFixture(token) {
  const zone = await request(app)
    .post('/api/zones')
    .set(auth(token))
    .send({
      name: `Zone commentaires ${Date.now()}`,
      map_id: 'foret',
      points: [{ xp: 18, yp: 18 }, { xp: 26, yp: 18 }, { xp: 22, yp: 26 }],
      stage: 'empty',
    })
    .expect(201);
  const project = await request(app)
    .post('/api/task-projects')
    .set(auth(token))
    .send({
      map_id: 'foret',
      title: `Projet commentaires ${Date.now()}`,
      description: 'Projet de test commentaires contextuels',
    })
    .expect(201);
  const task = await request(app)
    .post('/api/tasks')
    .set(auth(token))
    .send({
      title: `Tâche commentaires ${Date.now()}`,
      map_id: 'foret',
      project_id: project.body.id,
      zone_id: zone.body.id,
      required_students: 1,
    })
    .expect(201);
  return { zoneId: zone.body.id, projectId: project.body.id, taskId: task.body.id };
}

test('Commentaires contextuels: refuse l’accès sans authentification', async () => {
  await request(app).get('/api/context-comments?contextType=task&contextId=t1').expect(401);
});

test('Commentaires contextuels: cycle création/lecture/suppression sur une tâche', async () => {
  const teacher = await teacherToken();
  const student = await registerStudent('ComTask');
  const { taskId } = await createContextFixture(teacher);

  const created = await request(app)
    .post('/api/context-comments')
    .set(auth(student.authToken))
    .send({ contextType: 'task', contextId: taskId, body: 'Commentaire test sur tâche.' })
    .expect(201);
  assert.ok(created.body?.id);

  const list = await request(app)
    .get(`/api/context-comments?contextType=task&contextId=${encodeURIComponent(taskId)}`)
    .set(auth(student.authToken))
    .expect(200);
  assert.ok(Array.isArray(list.body?.items));
  assert.ok(list.body.items.some((item) => item.id === created.body.id));

  await request(app)
    .delete(`/api/context-comments/${created.body.id}`)
    .set(auth(student.authToken))
    .expect(200);

  const afterDelete = await request(app)
    .get(`/api/context-comments?contextType=task&contextId=${encodeURIComponent(taskId)}`)
    .set(auth(student.authToken))
    .expect(200);
  const deleted = afterDelete.body.items.find((item) => item.id === created.body.id);
  assert.ok(deleted);
  assert.strictEqual(Number(deleted.is_deleted), 1);
  assert.strictEqual(deleted.body, '');
});

test('Commentaires contextuels: un autre élève ne peut pas supprimer un commentaire', async () => {
  const teacher = await teacherToken();
  const author = await registerStudent('ComAuthor');
  const other = await registerStudent('ComOther');
  const { taskId } = await createContextFixture(teacher);

  const created = await request(app)
    .post('/api/context-comments')
    .set(auth(author.authToken))
    .send({ contextType: 'task', contextId: taskId, body: 'Commentaire auteur' })
    .expect(201);

  await request(app)
    .delete(`/api/context-comments/${created.body.id}`)
    .set(auth(other.authToken))
    .expect(403);
});

test('Commentaires contextuels: signalement et prévention des doublons', async () => {
  const teacher = await teacherToken();
  const author = await registerStudent('ComRepAuthor');
  const reporter = await registerStudent('ComRepUser');
  const { zoneId } = await createContextFixture(teacher);

  const created = await request(app)
    .post('/api/context-comments')
    .set(auth(author.authToken))
    .send({ contextType: 'zone', contextId: zoneId, body: 'Commentaire à signaler.' })
    .expect(201);

  await request(app)
    .post(`/api/context-comments/${created.body.id}/report`)
    .set(auth(reporter.authToken))
    .send({ reason: 'Contenu inadapté.' })
    .expect(201);

  await request(app)
    .post(`/api/context-comments/${created.body.id}/report`)
    .set(auth(reporter.authToken))
    .send({ reason: 'Deuxième signalement identique.' })
    .expect(409);
});

test('Commentaires contextuels: valide les contextes task/project/zone', async () => {
  const teacher = await teacherToken();
  const student = await registerStudent('ComCtx');
  const { projectId } = await createContextFixture(teacher);

  const created = await request(app)
    .post('/api/context-comments')
    .set(auth(student.authToken))
    .send({ contextType: 'project', contextId: projectId, body: 'Commentaire projet.' })
    .expect(201);
  assert.strictEqual(created.body.context_type, 'project');

  await request(app)
    .post('/api/context-comments')
    .set(auth(student.authToken))
    .send({ contextType: 'invalid', contextId: projectId, body: 'Commentaire invalide.' })
    .expect(400);
});
