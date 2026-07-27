'use strict';

// Non-régression B4 (audit 2026-07) : l'inscription à une tâche ne doit accepter ni doublon
// pour un même n3beur, ni dépassement de `required_students`, y compris sous requêtes
// concurrentes (index unique migration 170 + contrôle de capacité sérialisé).
//
// L'usurpation d'identité par le nom (B1) est couverte séparément par
// `tests/tasks-identity-usurpation.test.js`.

require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

const stamp = Date.now();
const alice = { firstName: `Alice${stamp}`, lastName: 'Ident' };
const bob = { firstName: `Bob${stamp}`, lastName: 'Ident' };

let teacherToken;
let aliceId;
let aliceToken;
let bobId;
let bobToken;

async function setStudentPrimaryRole(userId, roleSlug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `Rôle introuvable: ${roleSlug}`);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', [
    'student',
    userId,
  ]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['student', userId, role.id],
  );
}

async function createTask(title, extra = {}) {
  const res = await request(app)
    .post('/api/tasks')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ title, required_students: 2, ...extra })
    .expect(201);
  return res.body.id;
}

function assignmentsOf(taskId) {
  return queryAll(
    'SELECT id, student_id, student_first_name, student_last_name, done_at FROM task_assignments WHERE task_id = ?',
    [taskId],
  );
}

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
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
  teacherToken = await signAuthToken({
    userType: 'teacher',
    userId: teacher.id,
    canonicalUserId: teacher.id,
    roleId: adminRole.id,
    roleSlug: 'admin',
    roleDisplayName: 'Administrateur',
  });

  const regA = await request(app)
    .post('/api/auth/register')
    .send({ ...alice, password: 'pass123' });
  assert.strictEqual(regA.status, 201, `inscription Alice: ${JSON.stringify(regA.body)}`);
  aliceId = regA.body.id;
  aliceToken = regA.body.authToken;
  await setStudentPrimaryRole(aliceId, 'eleve_novice');

  const regB = await request(app)
    .post('/api/auth/register')
    .send({ ...bob, password: 'pass123' });
  assert.strictEqual(regB.status, 201, `inscription Bob: ${JSON.stringify(regB.body)}`);
  bobId = regB.body.id;
  bobToken = regB.body.authToken;
  await setStudentPrimaryRole(bobId, 'eleve_novice');
});

describe('B4 — inscription : pas de doublon ni de dépassement de capacité', () => {
  it('refuse une seconde inscription du même n3beur', async () => {
    const taskId = await createTask('B4 doublon');
    await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ studentId: aliceId })
      .expect(200);
    const second = await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ studentId: aliceId });
    assert.strictEqual(second.status, 400);

    const rows = await assignmentsOf(taskId);
    assert.strictEqual(rows.length, 1, 'une seule ligne d’inscription');
  });

  it('ne dépasse pas `required_students` même en requêtes concurrentes', async () => {
    const taskId = await createTask('B4 capacite concurrente', { required_students: 1 });
    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({ studentId: aliceId }),
      request(app)
        .post(`/api/tasks/${taskId}/assign`)
        .set('Authorization', `Bearer ${bobToken}`)
        .send({ studentId: bobId }),
    ]);

    const rows = await assignmentsOf(taskId);
    assert.strictEqual(rows.length, 1, `une seule place: ${JSON.stringify(rows)}`);
    const statuses = [a.status, b.status].sort();
    assert.deepStrictEqual(statuses, [200, 400], 'une réussite, un refus explicite');
  });
});
