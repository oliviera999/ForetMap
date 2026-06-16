'use strict';

/**
 * Recalcul du statut après suppression d’élève doit suivre la même logique que
 * `recalculateTaskStatus` (completion_mode / done_at), pas un simple comptage vs required_students.
 */
require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let teacherToken;
const firstNameA = `ColA${Date.now()}`;
const lastNameA = 'DelCol';
const firstNameB = `ColB${Date.now()}`;
const lastNameB = 'DelCol';
let studentIdA;
let studentIdB;

before(async () => {
  await initSchema();
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  if (teacher?.id && adminRole?.id) {
    await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
      'teacher',
      teacher.id,
    ]);
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
      ['teacher', teacher.id, adminRole.id],
    );
  }
  teacherToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher?.id || null,
      canonicalUserId: teacher?.id || null,
      roleId: adminRole?.id || null,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );

  const regA = await request(app)
    .post('/api/auth/register')
    .send({ firstName: firstNameA, lastName: lastNameA, password: 'pass123' })
    .expect(201);
  studentIdA = regA.body.id;
  const regB = await request(app)
    .post('/api/auth/register')
    .send({ firstName: firstNameB, lastName: lastNameB, password: 'pass123' })
    .expect(201);
  studentIdB = regB.body.id;
});

describe('Suppression élève — tâche collective', () => {
  it('recalcule le statut avec completion_mode (reste « done » si le seul assigné restant a terminé)', async () => {
    const taskRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `Tâche collective suppression ${Date.now()}`,
        required_students: 2,
        completion_mode: 'all_assignees_done',
      })
      .expect(201);
    const collectiveTaskId = taskRes.body.id;

    await request(app)
      .post(`/api/tasks/${collectiveTaskId}/assign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ firstName: firstNameA, lastName: lastNameA, studentId: studentIdA })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${collectiveTaskId}/assign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ firstName: firstNameB, lastName: lastNameB, studentId: studentIdB })
      .expect(200);

    await request(app)
      .post(`/api/tasks/${collectiveTaskId}/done`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ firstName: firstNameA, lastName: lastNameA, studentId: studentIdA })
      .expect(200);

    const mid = await queryOne('SELECT status FROM tasks WHERE id = ?', [collectiveTaskId]);
    assert.strictEqual(mid.status, 'in_progress');

    await request(app)
      .delete(`/api/students/${studentIdB}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const task = await queryOne('SELECT status FROM tasks WHERE id = ?', [collectiveTaskId]);
    assert.strictEqual(task.status, 'done');
  });
});
