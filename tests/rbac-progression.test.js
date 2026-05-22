require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, queryOne, execute } = require('../database');
const { app } = require('../server');
const { signAuthToken } = require('../middleware/requireTeacher');
const { ensureRbacBootstrap } = require('../lib/rbac');

test.before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
});

async function getAdminAuthToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  const requiredPermissions = ['admin.roles.manage', 'admin.users.assign_roles', 'tasks.manage', 'tasks.validate'];
  for (const key of requiredPermissions) {
    await execute(
      'INSERT IGNORE INTO permissions (`key`, label, description) VALUES (?, ?, ?)',
      [key, key, 'Permission auto-seed tests']
    );
    await execute(
      'INSERT IGNORE INTO role_permissions (role_id, permission_key, requires_elevation) VALUES (?, ?, 1)',
      [adminRole.id, key]
    );
  }
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['teacher', teacher.id]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, adminRole.id]
  );
  return signAuthToken(
    {
      userType: 'teacher',
      userId: teacher.id,
      canonicalUserId: teacher.id,
      roleId: adminRole.id,
      roleSlug: 'admin',
      roleDisplayName: 'Administrateur',
      elevated: false,
    },
    false
  );
}

async function setStudentPrimaryRole(studentId, roleSlug) {
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', [roleSlug]);
  assert.ok(role?.id, `Rôle introuvable: ${roleSlug}`);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['student', studentId]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['student', studentId, role.id]
  );
}

test('progression auto : palier perso. après profil manuel hors eleve_* (validation tâche)', async () => {
  const teacherToken = await getAdminAuthToken();
  const ts = Date.now();
  const targetSlug = `palier_prog_${ts}`;
  const manualSlug = `palier_manual_${ts}`;

  const targetRole = await request(app)
    .post('/api/rbac/profiles')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      slug: targetSlug,
      display_name: 'Palier objectif 40',
      rank: 250,
      emoji: '🎯',
      min_done_tasks: 2,
      display_order: 9901,
    })
    .expect(201);

  await request(app)
    .post('/api/rbac/profiles')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({
      slug: manualSlug,
      display_name: 'Palier manuel départ',
      rank: 150,
      emoji: '🧭',
      min_done_tasks: 0,
      display_order: 9902,
    })
    .expect(201);

  const studentRes = await request(app)
    .post('/api/auth/register')
    .send({ firstName: 'Prog', lastName: `Custom${ts}`, password: 'pass1234' })
    .expect(201);
  const { id: studentId, first_name: firstName, last_name: lastName } = studentRes.body;
  await setStudentPrimaryRole(studentId, manualSlug);

  const zones = await request(app).get('/api/zones').expect(200);
  const zoneId = zones.body[0]?.id || 'pg';

  for (let i = 0; i < 2; i += 1) {
    const task = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: `Prog custom ${ts}-${i}`, zone_id: zoneId, required_students: 1 })
      .expect(201);
    await request(app)
      .post(`/api/tasks/${task.body.id}/assign`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${task.body.id}/done`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ firstName, lastName, studentId })
      .expect(200);
    await request(app)
      .post(`/api/tasks/${task.body.id}/validate`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
  }

  const role = await queryOne(
    `SELECT r.slug
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1
      LIMIT 1`,
    [studentId]
  );
  assert.strictEqual(role?.slug, targetSlug);

  const stats = await request(app)
    .get(`/api/stats/me/${studentId}`)
    .set('Authorization', `Bearer ${studentRes.body.authToken}`)
    .expect(200);
  assert.strictEqual(stats.body?.progression?.roleSlug, targetSlug);

  await execute('DELETE FROM roles WHERE id = ?', [targetRole.body.id]);
  await execute('DELETE FROM roles WHERE slug = ?', [manualSlug]);
});
