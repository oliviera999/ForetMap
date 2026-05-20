'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');

const stamp = Date.now();
const teacherId = `teacher-gl-${stamp}`;
const teacherEmail = `teacher.gl.${stamp}@ecole.local`;
const teacherPassword = 'GlStaffPwd!123';

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  const hash = await bcrypt.hash(teacherPassword, 10);
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, ?, 'local', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [teacherId, teacherEmail, `teacher${stamp}`, `Teacher GL ${stamp}`, hash]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  await execute(
    `INSERT INTO user_roles (user_id, user_type, role_id, is_primary, assigned_at)
     VALUES (?, 'teacher', ?, 1, NOW())
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [teacherId, adminRole.id]
  );
});

test('POST /api/gl/auth/staff/login accepte un enseignant admin ForetMap', async () => {
  const res = await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier: teacherEmail, password: teacherPassword })
    .expect(200);
  assert.strictEqual(res.body?.auth?.product, 'gl');
  assert.strictEqual(res.body?.auth?.userType, 'gl_admin');
  assert.ok(Array.isArray(res.body?.auth?.permissions));
});

test('POST /api/gl/auth/staff/login rejette un mot de passe invalide', async () => {
  await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier: teacherEmail, password: 'bad-password' })
    .expect(401);
});

test('POST /api/gl/auth/staff/login valide les champs requis', async () => {
  await request(app).post('/api/gl/auth/staff/login').send({ identifier: teacherEmail }).expect(400);
});
