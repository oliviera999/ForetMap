'use strict';

/**
 * Suppression d’un élève ne doit pas effacer les inscriptions / journaux
 * d’un homonyme (même prénom+nom, autre id).
 */

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let teacherToken;
const stamp = Date.now();
const sharedFirst = `Hom${stamp}`;
const sharedLast = 'Dupond';
let studentAId;
let studentBId;
let taskId;

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
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'teacher',
    teacher.id,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, adminRole.id],
  );
  teacherToken = await signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false,
  );

  const regA = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: sharedFirst,
      lastName: sharedLast,
      password: 'pass123',
      pseudo: `homA${stamp}`,
    })
    .expect(201);
  studentAId = regA.body.id;

  // Contourne le check nominal applicatif (race / import) pour créer un homonyme.
  studentBId = `homB${stamp}`;
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO users
      (id, user_type, legacy_user_id, email, pseudo, first_name, last_name, display_name,
       description, avatar_path, affiliation, password_hash, auth_provider, is_active, last_seen, created_at, updated_at)
     VALUES (?, 'student', NULL, NULL, ?, ?, ?, ?, NULL, NULL, 'both',
             '$2a$10$abcdefghijklmnopqrstuv', 'local', 1, ?, NOW(), NOW())`,
    [studentBId, `homB${stamp}`, sharedFirst, sharedLast, `${sharedFirst} ${sharedLast}`, now],
  );
  const novice = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  if (novice?.id) {
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1)',
      ['student', studentBId, novice.id],
    );
  }

  const taskRes = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title: `Tâche homonyme ${stamp}`, required_students: 2 })
    .expect(201);
  taskId = taskRes.body.id;

  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ firstName: sharedFirst, lastName: sharedLast, studentId: studentAId })
    .expect(200);
  await request(app)
    .post(`/api/tasks/${taskId}/assign`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ firstName: sharedFirst, lastName: sharedLast, studentId: studentBId })
    .expect(200);

  await execute(
    `INSERT INTO task_logs (task_id, student_id, student_first_name, student_last_name, comment, created_at)
     VALUES (?, ?, ?, ?, 'journal B', NOW())`,
    [taskId, studentBId, sharedFirst, sharedLast],
  );
});

describe('Suppression élève — isolation des homonymes', () => {
  it('DELETE /api/students/:id ne touche pas les inscriptions ni journaux de l’homonyme', async () => {
    await request(app)
      .delete(`/api/students/${studentAId}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const survivor = await queryOne("SELECT id FROM users WHERE id = ? AND user_type = 'student'", [
      studentBId,
    ]);
    assert.ok(survivor, 'l’homonyme doit survivre');

    const assignmentsB = await queryAll(
      'SELECT id FROM task_assignments WHERE task_id = ? AND student_id = ?',
      [taskId, studentBId],
    );
    assert.strictEqual(assignmentsB.length, 1, 'inscription de B préservée');

    const logsB = await queryAll('SELECT id FROM task_logs WHERE task_id = ? AND student_id = ?', [
      taskId,
      studentBId,
    ]);
    assert.strictEqual(logsB.length, 1, 'journal de B préservé');

    const assignmentsA = await queryAll(
      'SELECT id FROM task_assignments WHERE task_id = ? AND student_id = ?',
      [taskId, studentAId],
    );
    assert.strictEqual(assignmentsA.length, 0, 'inscription de A supprimée');
  });
});
