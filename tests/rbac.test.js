require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');

test.before(async () => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await initSchema();
      break;
    } catch (err) {
      if (err?.code !== 'ER_LOCK_DEADLOCK' || attempt === 4) throw err;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
  }
});

async function getAdminToken() {
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  const requiredPermissions = ['admin.roles.manage', 'admin.users.assign_roles'];
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
  if (teacher?.id && adminRole?.id) {
    await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['teacher', teacher.id]);
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
      ['teacher', teacher.id, adminRole.id]
    );
  }
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

test('RBAC admin: lecture profils et utilisateurs', async () => {
  const token = await getAdminToken();

  const profiles = await request(app)
    .get('/api/rbac/profiles')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(profiles.body.roles));
  assert.ok(profiles.body.roles.some((r) => r.slug === 'admin'));
  assert.strictEqual(typeof profiles.body.progressionByValidatedTasksEnabled, 'boolean');

  const users = await request(app)
    .get('/api/rbac/users')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.ok(Array.isArray(users.body));
  assert.ok(users.body.some((u) => u.user_type === 'teacher' || u.user_type === 'student'));
});

test('RBAC admin: mise à jour PIN profil', async () => {
  const token = await getAdminToken();
  const defaultPin = process.env.TEACHER_PIN || '1234';

  const profRole = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', ['prof']);
  assert.ok(profRole?.id);

  const res = await request(app)
    .put(`/api/rbac/profiles/${profRole.id}/pin`)
    .set('Authorization', `Bearer ${token}`)
    .send({ pin: '5678' })
    .expect(200);
  assert.strictEqual(res.body.ok, true);

  await request(app)
    .put(`/api/rbac/profiles/${profRole.id}/pin`)
    .set('Authorization', `Bearer ${token}`)
    .send({ pin: defaultPin })
    .expect(200);
});

test('RBAC admin: attribution de rôle via identifiant canonique user', async () => {
  const token = await getAdminToken();
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', ['eleve_avance']);
  assert.ok(role?.id);

  const users = await request(app)
    .get('/api/rbac/users')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  const target = users.body.find((u) => u.user_type === 'student');
  if (!target) return;

  const assign = await request(app)
    .put(`/api/rbac/users/student/${target.id}/role`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role_id: role.id })
    .expect(200);
  assert.strictEqual(assign.body.ok, true);
});
