require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');

test.before(async () => {
  await initSchema();
});

test('RBAC admin: lecture profils et utilisateurs', async () => {
  const elevate = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  assert.ok(elevate.body.token);

  const profiles = await request(app)
    .get('/api/rbac/profiles')
    .set('Authorization', `Bearer ${elevate.body.token}`)
    .expect(200);
  assert.ok(Array.isArray(profiles.body));
  assert.ok(profiles.body.some((r) => r.slug === 'admin'));

  const users = await request(app)
    .get('/api/rbac/users')
    .set('Authorization', `Bearer ${elevate.body.token}`)
    .expect(200);
  assert.ok(Array.isArray(users.body));
  assert.ok(users.body.some((u) => u.user_type === 'user' || u.user_type === 'teacher' || u.user_type === 'student'));
});

test('RBAC admin: mise à jour PIN profil', async () => {
  const elevate = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);

  const profRole = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', ['prof']);
  assert.ok(profRole?.id);

  const res = await request(app)
    .put(`/api/rbac/profiles/${profRole.id}/pin`)
    .set('Authorization', `Bearer ${elevate.body.token}`)
    .send({ pin: '5678' })
    .expect(200);
  assert.strictEqual(res.body.ok, true);
});

test('RBAC admin: attribution de rôle via identifiant canonique user', async () => {
  const elevate = await request(app)
    .post('/api/auth/teacher')
    .send({ pin: process.env.TEACHER_PIN || '1234' })
    .expect(200);
  const role = await queryOne('SELECT id FROM roles WHERE slug = ? LIMIT 1', ['eleve_avance']);
  assert.ok(role?.id);

  const users = await request(app)
    .get('/api/rbac/users')
    .set('Authorization', `Bearer ${elevate.body.token}`)
    .expect(200);
  const target = users.body.find((u) => u.user_type === 'user' && u.legacy_user_type === 'student');
  if (!target) return;

  const assign = await request(app)
    .put(`/api/rbac/users/user/${target.id}/role`)
    .set('Authorization', `Bearer ${elevate.body.token}`)
    .send({ role_id: role.id })
    .expect(200);
  assert.strictEqual(assign.body.ok, true);
});
