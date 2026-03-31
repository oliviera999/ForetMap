require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');

let teacherToken;

test.before(async () => {
  await initSchema();
  const loginEmail = String(process.env.TEACHER_ADMIN_EMAIL || '').trim();
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email) = LOWER(?) LIMIT 1",
    [loginEmail]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(teacher?.id, 'Compte admin enseignant introuvable');
  assert.ok(adminRole?.id, 'Rôle admin introuvable');
  if (teacher?.id && adminRole?.id) {
    await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['teacher', teacher.id]);
    await execute(
      'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
      ['teacher', teacher.id, adminRole.id]
    );
  }
  teacherToken = signAuthToken({
    userType: 'teacher',
    userId: teacher?.id || null,
    canonicalUserId: teacher?.id || null,
    roleId: adminRole?.id || null,
    roleSlug: 'admin',
    roleDisplayName: 'Administrateur',
    elevated: false,
  }, false);
});

test('POST /api/students/:id/duplicate crée un compte avec le même rôle primaire et affiliation', async () => {
  const unique = Date.now();
  const reg = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'Source',
      lastName: `Dup${unique}`,
      password: 'pass1234',
      description: 'Desc source',
    })
    .expect(201);
  const sourceId = reg.body.id;
  assert.ok(sourceId);

  const adv = await queryOne("SELECT id FROM roles WHERE slug = 'eleve_avance' LIMIT 1");
  assert.ok(adv?.id);
  await execute('UPDATE user_roles SET is_primary = 0 WHERE user_type = ? AND user_id = ?', ['student', sourceId]);
  await execute(
    'INSERT INTO user_roles (user_type, user_id, role_id, is_primary) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE is_primary = 1',
    ['student', sourceId, adv.id]
  );
  await execute(
    "UPDATE users SET affiliation = 'n3' WHERE id = ? AND user_type = 'student'",
    [sourceId]
  );

  const res = await request(app)
    .post(`/api/students/${sourceId}/duplicate`)
    .set('Authorization', 'Bearer ' + teacherToken)
    .send({
      first_name: 'Cible',
      last_name: `DupFille${unique}`,
      password: 'pass1234',
    })
    .expect(201);

  assert.ok(res.body.id);
  assert.strictEqual(res.body.source_student_id, sourceId);
  assert.strictEqual(String(res.body.first_name), 'Cible');
  assert.strictEqual(String(res.body.last_name), `DupFille${unique}`);
  assert.strictEqual(String(res.body.affiliation || '').toLowerCase(), 'n3');
  assert.strictEqual(String(res.body.description || ''), 'Desc source');
  assert.strictEqual(res.body.password_hash, undefined);
  assert.strictEqual(String(res.body.role_slug || '').toLowerCase(), 'eleve_avance');

  const ur = await queryOne(
    `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_type = 'student' AND ur.user_id = ? AND ur.is_primary = 1`,
    [res.body.id]
  );
  assert.strictEqual(String(ur?.slug || '').toLowerCase(), 'eleve_avance');
});

test('POST /api/students/:id/duplicate sans token renvoie 401', async () => {
  const res = await request(app)
    .post('/api/students/00000000-0000-4000-8000-000000000000/duplicate')
    .send({ first_name: 'A', last_name: 'B', password: 'pass1234' })
    .expect(401);
  assert.ok(res.body.error);
});
