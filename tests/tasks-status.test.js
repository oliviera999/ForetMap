'use strict';

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');

let teacherToken;
let taskId;
let taskIdMulti;
let taskIdTeacherFlow;
let taskIdOnHold;
let taskIdFutureStart;
let studentId;
let studentToken;
let studentTwoId;
let studentTwoToken;
const firstName = `St${Date.now()}`;
const lastName = 'Task';
const secondFirstName = `St2${Date.now()}`;
const secondLastName = 'Task';

before(async () => {
  await initSchema();
  const pin = process.env.TEACHER_PIN ?? '1234';
  const authRes = await request(app).post('/api/auth/teacher').send({ pin }).expect(200);
  teacherToken = authRes.body.token;
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ firstName, lastName, password: 'pass123' })
    .expect(201);
  studentId = reg.body.id;
  studentToken = reg.body.authToken;
  const regTwo = await request(app)
    .post('/api/auth/register')
    .send({ firstName: secondFirstName, lastName: secondLastName, password: 'pass123' })
    .expect(201);
  studentTwoId = regTwo.body.id;
  studentTwoToken = regTwo.body.authToken;
  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: 'Tâche test statut', required_students: 1 })
    .expect(201);
  taskId = taskRes.body.id;

  const taskResMulti = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: 'Tâche test statut multi', required_students: 2 })
    .expect(201);
  taskIdMulti = taskResMulti.body.id;

  const taskTeacherFlow = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: 'Tâche flux enseignant', required_students: 2 })
    .expect(201);
  taskIdTeacherFlow = taskTeacherFlow.body.id;

  const taskOnHold = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: 'Tâche en attente', required_students: 1 })
    .expect(201);
  taskIdOnHold = taskOnHold.body.id;
  await request(app)
    .put(`/api/tasks/${taskIdOnHold}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ status: 'on_hold' })
    .expect(200);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  const taskFutureStart = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: 'Tâche date de départ future', required_students: 1, start_date: tomorrowStr })
    .expect(201);
  taskIdFutureStart = taskFutureStart.body.id;
});

describe('Recalcul statuts tâches', () => {
  it('assign met la tâche en in_progress quand required_students atteint', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    assert.strictEqual(res.body.status, 'in_progress');
  });

  it('assign met la tâche en in_progress dès la première assignation même si required_students > 1', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskIdMulti}/assign`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    assert.strictEqual(res.body.status, 'in_progress');
  });

  it('unassign remet la tâche en available', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskId}/unassign`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    assert.strictEqual(res.body.status, 'available');
  });

  it('assign refuse un studentId sans session élève associée', async () => {
    await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .send({ firstName, lastName, studentId })
      .expect(403);
  });

  it('assign autorise un prof à assigner par nom (flux atelier)', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskIdTeacherFlow}/assign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ firstName, lastName })
      .expect(200);
    assert.strictEqual(res.body.status, 'in_progress');
  });

  it('assign refuse une tâche en attente', async () => {
    await request(app)
      .post(`/api/tasks/${taskIdOnHold}/assign`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName, lastName, studentId })
      .expect(400);
  });

  it('assign refuse une tâche dont la date de départ n\'est pas atteinte', async () => {
    await request(app)
      .post(`/api/tasks/${taskIdFutureStart}/assign`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName, lastName, studentId })
      .expect(400);
  });

  it('mode all_assignees_done: la tâche passe à done uniquement quand tous les assignés ont terminé', async () => {
    const collectiveTask = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `Tâche collective ${Date.now()}`,
        required_students: 2,
        completion_mode: 'all_assignees_done',
      })
      .expect(201);
    const collectiveTaskId = collectiveTask.body.id;

    await request(app)
      .post(`/api/tasks/${collectiveTaskId}/assign`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${collectiveTaskId}/assign`)
      .set('Authorization', `Bearer ${studentTwoToken}`)
      .send({ firstName: secondFirstName, lastName: secondLastName, studentId: studentTwoId })
      .expect(200);

    const afterFirstDone = await request(app)
      .post(`/api/tasks/${collectiveTaskId}/done`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    assert.strictEqual(afterFirstDone.body.status, 'in_progress');
    assert.strictEqual(Number(afterFirstDone.body.assignees_done_count), 1);
    assert.strictEqual(Number(afterFirstDone.body.assignees_total_count), 2);

    const afterSecondDone = await request(app)
      .post(`/api/tasks/${collectiveTaskId}/done`)
      .set('Authorization', `Bearer ${studentTwoToken}`)
      .send({ firstName: secondFirstName, lastName: secondLastName, studentId: studentTwoId })
      .expect(200);
    assert.strictEqual(afterSecondDone.body.status, 'done');
    assert.strictEqual(Number(afterSecondDone.body.assignees_done_count), 2);
    assert.strictEqual(Number(afterSecondDone.body.assignees_total_count), 2);
  });

  it('mode all_assignees_done: retirer un assigné non terminé peut clôturer la tâche', async () => {
    const collectiveTask = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `Tâche collective unassign ${Date.now()}`,
        required_students: 2,
        completion_mode: 'all_assignees_done',
      })
      .expect(201);
    const collectiveTaskId = collectiveTask.body.id;

    await request(app)
      .post(`/api/tasks/${collectiveTaskId}/assign`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${collectiveTaskId}/assign`)
      .set('Authorization', `Bearer ${studentTwoToken}`)
      .send({ firstName: secondFirstName, lastName: secondLastName, studentId: studentTwoId })
      .expect(200);

    await request(app)
      .post(`/api/tasks/${collectiveTaskId}/done`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);

    const afterUnassign = await request(app)
      .post(`/api/tasks/${collectiveTaskId}/unassign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ firstName: secondFirstName, lastName: secondLastName, studentId: studentTwoId })
      .expect(200);
    assert.strictEqual(afterUnassign.body.status, 'done');
    assert.strictEqual(Number(afterUnassign.body.assignees_done_count), 1);
    assert.strictEqual(Number(afterUnassign.body.assignees_total_count), 1);
  });
});
