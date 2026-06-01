'use strict';

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');

let teacherToken;

async function refreshAdminTeacherToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  const login = await request(app)
    .post('/api/auth/login')
    .send({
      identifier: loginEmail,
      password: process.env.TEACHER_ADMIN_PASSWORD,
    })
    .expect(200);
  const auth = await request(app)
    .post('/api/auth/teacher')
    .set({ Authorization: `Bearer ${login.body.authToken}` })
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  return auth.body.token;
}

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  teacherToken = await refreshAdminTeacherToken();
});

beforeEach(async () => {
  teacherToken = await refreshAdminTeacherToken();
});

describe('Tâches — réordonnancement projet', () => {
  it('POST /api/tasks/reorder-project persiste sort_order et influence GET /api/tasks', async () => {
    const ts = Date.now();
    const project = await request(app)
      .post('/api/task-projects')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        map_id: 'foret',
        title: `Projet ordre ${ts}`,
      })
      .expect(201);

    const t1 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `ordre-${ts}-1`,
        required_students: 1,
        map_id: 'foret',
        project_id: project.body.id,
      })
      .expect(201);
    const t2 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `ordre-${ts}-2`,
        required_students: 1,
        map_id: 'foret',
        project_id: project.body.id,
      })
      .expect(201);
    const t3 = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `ordre-${ts}-3`,
        required_students: 1,
        map_id: 'foret',
        project_id: project.body.id,
      })
      .expect(201);

    await request(app)
      .post('/api/tasks/reorder-project')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        project_id: project.body.id,
        task_ids: [t3.body.id, t1.body.id, t2.body.id],
      })
      .expect(200);

    const sortedRows = await request(app)
      .get('/api/tasks')
      .query({ map_id: 'foret', project_id: project.body.id })
      .expect(200);
    const ids = sortedRows.body.map((row) => row.id);
    assert.deepStrictEqual(ids, [t3.body.id, t1.body.id, t2.body.id]);
  });

  it('permet de rattacher une tâche à un projet puis de la placer par ordre', async () => {
    const ts = Date.now();
    const project = await request(app)
      .post('/api/task-projects')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        map_id: 'foret',
        title: `Projet rattachement ${ts}`,
      })
      .expect(201);

    const existing = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `rattache-${ts}-existing`,
        required_students: 1,
        map_id: 'foret',
        project_id: project.body.id,
      })
      .expect(201);
    const toAttach = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `rattache-${ts}-outside`,
        required_students: 1,
        map_id: 'foret',
      })
      .expect(201);

    await request(app)
      .put(`/api/tasks/${toAttach.body.id}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ project_id: project.body.id })
      .expect(200);

    await request(app)
      .post('/api/tasks/reorder-project')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        project_id: project.body.id,
        task_ids: [existing.body.id, toAttach.body.id],
      })
      .expect(200);

    const list = await request(app)
      .get('/api/tasks')
      .query({ map_id: 'foret', project_id: project.body.id })
      .expect(200);
    assert.deepStrictEqual(
      list.body.map((row) => row.id),
      [existing.body.id, toAttach.body.id]
    );
  });
});
