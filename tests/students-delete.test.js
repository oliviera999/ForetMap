'use strict';

require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');

let teacherToken;
let studentId;
let taskId;
const firstName = `Del${Date.now()}`;
const lastName = 'Student';

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
    .send({ title: 'Tâche pour suppression élève', required_students: 1 })
    .expect(201);
  taskId = taskRes.body.id;
  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .send({ firstName, lastName, studentId })
    .expect(200);
});

describe('Suppression élève', () => {
  it('DELETE /api/students/:id supprime l’élève et recalcul les statuts des tâches', async () => {
    const res = await request(app)
      .delete(`/api/students/${studentId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    assert.strictEqual(res.body.success, true);
    const task = await queryOne('SELECT status FROM tasks WHERE id = ?', [taskId]);
    assert.strictEqual(task.status, 'available');
    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [studentId]);
    assert.strictEqual(student, undefined);
  });
});
