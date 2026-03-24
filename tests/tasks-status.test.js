'use strict';

require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { v4: uuidv4 } = require('uuid');

let teacherToken;
let taskId;
let taskIdMulti;
let studentId;
const firstName = `St${Date.now()}`;
const lastName = 'Task';

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
});

describe('Recalcul statuts tâches', () => {
  it('assign met la tâche en in_progress quand required_students atteint', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    assert.strictEqual(res.body.status, 'in_progress');
  });

  it('assign met la tâche en in_progress dès la première assignation même si required_students > 1', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskIdMulti}/assign`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    assert.strictEqual(res.body.status, 'in_progress');
  });

  it('unassign remet la tâche en available', async () => {
    const res = await request(app)
      .post(`/api/tasks/${taskId}/unassign`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    assert.strictEqual(res.body.status, 'available');
  });
});
