'use strict';

/**
 * Régression audit B1 (2026-07) : un n3beur connecté ne peut pas désinscrire /
 * « terminer » un autre n3beur en envoyant son prénom+nom dans le corps.
 */
require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

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

describe('Anti-usurpation assign/done/unassign (B1)', () => {
  let teacherToken;
  let victim;
  let attacker;

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

    const suffix = Date.now();
    const victimRes = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Victime', lastName: `B1${suffix}`, password: 'pass1234' })
      .expect(201);
    victim = {
      id: victimRes.body.id,
      token: victimRes.body.authToken,
      firstName: victimRes.body.first_name,
      lastName: victimRes.body.last_name,
    };
    await setStudentPrimaryRole(victim.id, 'eleve_novice');

    const attackerRes = await request(app)
      .post('/api/auth/register')
      .send({ firstName: 'Attaquant', lastName: `B1${suffix}`, password: 'pass1234' })
      .expect(201);
    attacker = {
      id: attackerRes.body.id,
      token: attackerRes.body.authToken,
      firstName: attackerRes.body.first_name,
      lastName: attackerRes.body.last_name,
    };
    await setStudentPrimaryRole(attacker.id, 'eleve_novice');
  });

  it('unassign avec le nom d’un tiers ne supprime pas son inscription', async () => {
    const taskRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `B1 unassign ${Date.now()}`,
        required_students: 2,
        completion_mode: 'all_assignees_done',
      })
      .expect(201);
    const taskId = taskRes.body.id;

    await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${victim.token}`)
      .send({ studentId: victim.id, firstName: victim.firstName, lastName: victim.lastName })
      .expect(200);

    await request(app)
      .post(`/api/tasks/${taskId}/unassign`)
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ firstName: victim.firstName, lastName: victim.lastName })
      .expect(200);

    const rows = await queryAll(
      'SELECT student_id, student_first_name, student_last_name FROM task_assignments WHERE task_id = ?',
      [taskId],
    );
    assert.equal(rows.length, 1, 'l’inscription de la victime doit rester');
    assert.equal(String(rows[0].student_id), String(victim.id));
  });

  it('done avec le nom d’un tiers ne marque pas sa part', async () => {
    const taskRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        title: `B1 done ${Date.now()}`,
        required_students: 2,
        completion_mode: 'all_assignees_done',
      })
      .expect(201);
    const taskId = taskRes.body.id;

    await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${victim.token}`)
      .send({ studentId: victim.id, firstName: victim.firstName, lastName: victim.lastName })
      .expect(200);

    const doneRes = await request(app)
      .post(`/api/tasks/${taskId}/done`)
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ firstName: victim.firstName, lastName: victim.lastName });
    // L’attaquant n’est pas inscrit : 400 attendu (et surtout pas de done_at sur la victime).
    assert.equal(doneRes.status, 400);

    const victimRow = await queryOne(
      'SELECT done_at FROM task_assignments WHERE task_id = ? AND student_id = ? LIMIT 1',
      [taskId, victim.id],
    );
    assert.ok(victimRow, 'inscription victime présente');
    assert.equal(victimRow.done_at, null);
  });

  it('assign avec le nom d’un tiers enregistre les noms de l’attaquant (fiche BDD)', async () => {
    const taskRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `B1 assign ${Date.now()}`, required_students: 2 })
      .expect(201);
    const taskId = taskRes.body.id;

    const assignRes = await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ firstName: victim.firstName, lastName: victim.lastName })
      .expect(200);

    const row = await queryOne(
      'SELECT student_id, student_first_name, student_last_name FROM task_assignments WHERE task_id = ? LIMIT 1',
      [taskId],
    );
    assert.equal(String(row.student_id), String(attacker.id));
    assert.equal(row.student_first_name, attacker.firstName);
    assert.equal(row.student_last_name, attacker.lastName);
    const listed = (assignRes.body.assignments || []).find(
      (a) => String(a.student_id) === String(attacker.id),
    );
    assert.ok(listed);
    assert.equal(listed.student_first_name, attacker.firstName);
  });
});
