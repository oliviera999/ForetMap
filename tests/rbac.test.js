require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, queryAll, execute } = require('../database');

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
  const sample = users.body.find((u) => u.user_type === 'student');
  if (sample) {
    assert.ok(Object.prototype.hasOwnProperty.call(sample, 'first_name'));
    assert.ok(Object.prototype.hasOwnProperty.call(sample, 'last_name'));
  }
});

test('RBAC admin: PATCH compte utilisateur (n3beur)', async () => {
  const token = await getAdminToken();
  const student = await queryOne(
    "SELECT id, first_name, last_name FROM users WHERE user_type = 'student' LIMIT 1"
  );
  assert.ok(student?.id, 'Au moins un n3beur en base pour ce test');
  const prevFirst = student.first_name;
  const prevLast = student.last_name;
  const newFirst = `Tmp${Date.now()}`.slice(0, 24);
  const res = await request(app)
    .patch(`/api/rbac/users/student/${student.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      first_name: newFirst,
      last_name: prevLast,
      pseudo: null,
      email: null,
      description: null,
      affiliation: 'both',
    })
    .expect(200);
  assert.strictEqual(res.body.first_name, newFirst);
  await execute(
    'UPDATE users SET first_name = ?, last_name = ? WHERE id = ? AND user_type = ?',
    [prevFirst, prevLast, student.id, 'student']
  );
  await execute(
    'UPDATE task_assignments SET student_first_name = ?, student_last_name = ? WHERE student_id = ?',
    [prevFirst, prevLast, student.id]
  );
  await execute(
    'UPDATE task_logs SET student_first_name = ?, student_last_name = ? WHERE student_id = ?',
    [prevFirst, prevLast, student.id]
  );
});

test('RBAC admin: GET un utilisateur pour édition', async () => {
  const token = await getAdminToken();
  const student = await queryOne(
    "SELECT id, user_type FROM users WHERE user_type = 'student' LIMIT 1"
  );
  assert.ok(student?.id);
  const res = await request(app)
    .get(`/api/rbac/users/student/${student.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assert.strictEqual(res.body.id, student.id);
  assert.strictEqual(res.body.user_type, 'student');
  assert.ok(Object.prototype.hasOwnProperty.call(res.body, 'first_name'));
  assert.ok(Object.prototype.hasOwnProperty.call(res.body, 'pseudo'));
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

test('RBAC: PATCH forum/commentaires pour palier perso. (rank < 400) ; refus sur profil n3boss', async () => {
  const token = await getAdminToken();
  const slug = `palier_rbac_api_${Date.now()}`;
  const created = await request(app)
    .post('/api/rbac/profiles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug,
      display_name: 'Palier test API',
      rank: 150,
      emoji: '🧪',
      min_done_tasks: 3,
      display_order: 9900,
    })
    .expect(201);

  const patchOk = await request(app)
    .patch(`/api/rbac/profiles/${created.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ forum_participate: false, context_comment_participate: true })
    .expect(200);
  assert.strictEqual(Number(patchOk.body.forum_participate), 0);
  assert.strictEqual(Number(patchOk.body.context_comment_participate), 1);

  const patchCamel = await request(app)
    .patch(`/api/rbac/profiles/${created.body.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ forumParticipate: 1, contextCommentParticipate: 0 })
    .expect(200);
  assert.strictEqual(Number(patchCamel.body.forum_participate), 1);
  assert.strictEqual(Number(patchCamel.body.context_comment_participate), 0);

  const profRole = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', ['prof']);
  assert.ok(profRole?.id);
  await request(app)
    .patch(`/api/rbac/profiles/${profRole.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send({ forum_participate: false })
    .expect(400);

  await execute('DELETE FROM roles WHERE id = ?', [created.body.id]);
});

test('RBAC admin: duplication de profil (permissions copiées, PIN non copié)', async () => {
  const token = await getAdminToken();
  const profRole = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', ['prof']);
  assert.ok(profRole?.id);
  const beforePerms = await queryAll('SELECT permission_key, requires_elevation FROM role_permissions WHERE role_id = ?', [
    profRole.id,
  ]);
  const dupSlug = `rbac_dup_test_${Date.now()}`;
  const res = await request(app)
    .post(`/api/rbac/profiles/${profRole.id}/duplicate`)
    .set('Authorization', `Bearer ${token}`)
    .send({ slug: dupSlug, display_name: 'Prof copie test' })
    .expect(201);
  assert.strictEqual(res.body.slug, dupSlug);
  assert.strictEqual(res.body.display_name, 'Prof copie test');
  const afterPerms = await queryAll('SELECT permission_key, requires_elevation FROM role_permissions WHERE role_id = ?', [
    res.body.id,
  ]);
  assert.strictEqual(afterPerms.length, beforePerms.length);
  const pinRow = await queryOne('SELECT role_id FROM role_pin_secrets WHERE role_id = ? LIMIT 1', [res.body.id]);
  assert.ok(!pinRow, 'le PIN du profil source ne doit pas être copié');
  await execute('DELETE FROM roles WHERE id = ?', [res.body.id]);
});

test('RBAC: duplication refuse un slug réservé (ex. admin)', async () => {
  const token = await getAdminToken();
  const profRole = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', ['prof']);
  assert.ok(profRole?.id);
  const res = await request(app)
    .post(`/api/rbac/profiles/${profRole.id}/duplicate`)
    .set('Authorization', `Bearer ${token}`)
    .send({ slug: 'admin', display_name: 'Tentative' })
    .expect(400);
  assert.ok(String(res.body?.error || '').includes('réservé'), res.body?.error);
});

test('RBAC: profil n3boss dupliqué — enseignant traité comme palier staff (permissions sans élévation)', async () => {
  const { buildAuthzPayload } = require('../lib/rbac');
  const token = await getAdminToken();
  const profRole = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', ['prof']);
  assert.ok(profRole?.id);
  const dupSlug = `rbac_dup_staff_native_${Date.now()}`;
  const dup = await request(app)
    .post(`/api/rbac/profiles/${profRole.id}/duplicate`)
    .set('Authorization', `Bearer ${token}`)
    .send({ slug: dupSlug, display_name: 'Copie n3boss test native' })
    .expect(201);
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [String(process.env.TEACHER_ADMIN_EMAIL || '').trim()]
  );
  assert.ok(teacher?.id);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['teacher', teacher.id]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['teacher', teacher.id, dup.body.id]
  );
  try {
    const payload = await buildAuthzPayload('teacher', teacher.id, false);
    assert.strictEqual(String(payload.roleSlug), dupSlug);
    assert.strictEqual(payload.nativePrivileged, true);
    assert.ok(payload.permissions.includes('students.import'), 'import élèves exige élévation sur prof sans bypass staff');
  } finally {
    await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['teacher', teacher.id]);
    const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
    if (adminRole?.id) {
      await execute(
        'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
        ['teacher', teacher.id, adminRole.id]
      );
    }
    await execute('DELETE FROM roles WHERE id = ?', [dup.body.id]);
  }
});
