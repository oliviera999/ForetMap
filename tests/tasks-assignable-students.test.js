'use strict';

/**
 * Gestion des tâches : les listes d'utilisateurs ne proposent que des **n3beurs**.
 *
 * Un compte `user_type = 'student'` peut porter un profil non n3beur (visiteur, personnel,
 * prof de classe, profil GL) : il n'a aucune permission de tâche et ne doit ni apparaître
 * dans les listes d'affectation, ni pouvoir y être inscrit par un n3boss.
 *
 * Le statut s'obtient aussi par **rattachement à un groupe n3beur** : un membre dont le
 * profil `visiteur` n'a pas encore été resynchronisé reste donc inscriptible.
 */
require('./helpers/setup');
require('dotenv').config();
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('node:crypto');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

async function setStudentPrimaryRole(userId, roleSlug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `Rôle introuvable: ${roleSlug}`);
  await execute(
    "UPDATE user_roles SET is_primary = 0 WHERE user_type = 'student' AND user_id = ?",
    [userId],
  );
  await execute(
    "INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES ('student', ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1",
    [userId, role.id],
  );
}

async function createN3beurGroup(slug) {
  const role = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_novice' LIMIT 1");
  const id = crypto.randomUUID();
  await execute(
    `INSERT INTO \`groups\` (id, slug, name, kind, default_role_id, grants_n3beur_access, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'class', ?, 1, 1, NOW(), NOW())`,
    [id, slug, slug, role?.id ?? null],
  );
  return id;
}

async function addToGroup(groupId, userId) {
  await execute(
    "INSERT IGNORE INTO group_members (group_id, user_type, user_id, joined_at) VALUES (?, 'student', ?, NOW())",
    [groupId, userId],
  );
}

async function registerStudent(firstName, lastName) {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ firstName, lastName, password: 'pass1234' })
    .expect(201);
  return {
    id: String(res.body.id),
    token: res.body.authToken,
    firstName: res.body.first_name,
    lastName: res.body.last_name,
  };
}

describe('Listes d’utilisateurs de la gestion des tâches : n3beurs seulement', () => {
  let teacherToken;
  let groupId;
  let n3beur;
  let visiteurDeGroupe;
  let visiteurHorsGroupe;
  let profClasse;

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
    groupId = await createN3beurGroup(`assignables-${suffix}`);

    n3beur = await registerStudent('Nour', `N3${suffix}`);
    visiteurDeGroupe = await registerStudent('Vera', `Vg${suffix}`);
    visiteurHorsGroupe = await registerStudent('Victor', `Vh${suffix}`);
    profClasse = await registerStudent('Paul', `Pc${suffix}`);

    for (const user of [n3beur, visiteurDeGroupe, profClasse]) await addToGroup(groupId, user.id);

    // Profils posés APRÈS le rattachement : ils simulent l'attribution manuelle d'un admin,
    // que `syncStudentRoleFromGroups` n'a pas (encore) rejouée.
    await setStudentPrimaryRole(n3beur.id, 'eleve_novice');
    await setStudentPrimaryRole(visiteurDeGroupe.id, 'visiteur');
    await setStudentPrimaryRole(visiteurHorsGroupe.id, 'visiteur');
    await setStudentPrimaryRole(profClasse.id, 'prof_classe');
  });

  it('GET /api/tasks/assignable-students : n3beurs du groupe, prof de classe exclu', async () => {
    const res = await request(app)
      .get(`/api/tasks/assignable-students?group_id=${encodeURIComponent(groupId)}`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    const ids = (res.body.students || []).map((s) => String(s.id));
    assert.ok(ids.includes(n3beur.id), 'le n3beur doit être proposé');
    assert.ok(
      ids.includes(visiteurDeGroupe.id),
      'un membre de groupe n3beur au profil encore « visiteur » reste inscriptible',
    );
    assert.ok(!ids.includes(profClasse.id), 'le prof de classe ne doit pas être proposé');
  });

  it('GET /api/tasks/assignable-students : un visiteur sans groupe n3beur est exclu', async () => {
    const res = await request(app)
      .get('/api/tasks/assignable-students')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    const ids = (res.body.students || []).map((s) => String(s.id));
    assert.ok(ids.includes(n3beur.id));
    assert.ok(!ids.includes(visiteurHorsGroupe.id), 'le visiteur hors groupe n’est pas proposé');
    assert.ok(!ids.includes(profClasse.id));
  });

  it('GET /api/tasks/referent-candidates exclut les élèves sans statut n3beur', async () => {
    const res = await request(app)
      .get('/api/tasks/referent-candidates')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    const studentIds = (res.body || [])
      .filter((row) => row.user_type === 'student')
      .map((row) => String(row.id));
    assert.ok(studentIds.includes(n3beur.id));
    assert.ok(!studentIds.includes(visiteurHorsGroupe.id));
    assert.ok(!studentIds.includes(profClasse.id));
  });

  it('POST /api/tasks/:id/assign refuse l’inscription d’un compte sans statut n3beur', async () => {
    const taskRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Affectation hors n3beur ${Date.now()}`, required_students: 3 })
      .expect(201);
    const taskId = taskRes.body.id;

    await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ studentId: visiteurHorsGroupe.id })
      .expect(403);

    await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ studentId: profClasse.id })
      .expect(403);

    await request(app)
      .post(`/api/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ studentId: n3beur.id })
      .expect(200);

    const rows = await queryAll('SELECT student_id FROM task_assignments WHERE task_id = ?', [
      taskId,
    ]);
    assert.deepEqual(
      rows.map((r) => String(r.student_id)),
      [n3beur.id],
    );
  });

  it('POST /api/tasks/:id/assign-group n’inscrit que les membres n3beurs du groupe', async () => {
    const taskRes = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Affectation groupe ${Date.now()}`, required_students: 5 })
      .expect(201);
    const taskId = taskRes.body.id;

    const res = await request(app)
      .post(`/api/tasks/${taskId}/assign-group`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ group_id: groupId })
      .expect(200);
    assert.equal(res.body.considered, 2, 'le prof de classe n’est pas considéré');

    const ids = (
      await queryAll('SELECT student_id FROM task_assignments WHERE task_id = ?', [taskId])
    ).map((r) => String(r.student_id));
    assert.ok(ids.includes(n3beur.id));
    assert.ok(ids.includes(visiteurDeGroupe.id));
    assert.ok(!ids.includes(profClasse.id), 'le prof de classe ne doit pas être inscrit');
  });
});
