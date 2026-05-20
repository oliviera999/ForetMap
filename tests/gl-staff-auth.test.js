'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { isForetmapAdminForGl } = require('../lib/glStaffAuth');

const stamp = Date.now();
const adminEmail = `gl.staff.admin.${stamp}@ecole.local`;
const mjOnlyEmail = `gl.staff.mjonly.${stamp}@ecole.local`;
const adminPassword = 'StaffTest-Admin-1';

let adminTeacherId = null;

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  const hash = await bcrypt.hash(adminPassword, 10);

  adminTeacherId = `teacher-gl-admin-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, ?, 'local', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [adminTeacherId, adminEmail, `admin${stamp}`, 'Admin GL Staff', hash]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  assert.ok(adminRole?.id);
  await execute(
    `INSERT INTO user_roles (user_id, user_type, role_id, is_primary, assigned_at)
     VALUES (?, 'teacher', ?, 1, NOW())
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [adminTeacherId, adminRole.id]
  );

  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ seul GL', 'mj', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1`,
    [mjOnlyEmail]
  );
});

test('isForetmapAdminForGl détecte le rôle admin ForetMap', async () => {
  const { buildAuthzPayload } = require('../lib/rbac');
  const authz = await buildAuthzPayload('teacher', adminTeacherId, false);
  assert.ok(isForetmapAdminForGl(authz));
});

test('POST /api/gl/auth/staff/login connecte un admin ForetMap et crée gl_admins', async () => {
  const res = await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier: adminEmail, password: adminPassword })
    .expect(200);
  assert.strictEqual(res.body?.auth?.product, 'gl');
  assert.strictEqual(res.body?.auth?.userType, 'gl_admin');
  assert.ok(res.body?.auth?.permissions?.includes('gl.settings.manage'));

  const row = await queryOne('SELECT id, role FROM gl_admins WHERE LOWER(email)=LOWER(?) LIMIT 1', [adminEmail]);
  assert.ok(row);
  assert.strictEqual(String(row.role).toLowerCase(), 'admin');
});

test('POST /api/gl/auth/staff/login refuse un compte MJ GL sans admin ForetMap', async () => {
  const res = await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier: mjOnlyEmail, password: 'wrong' })
    .expect(401);
  assert.ok(res.body?.error);
});

test('GET /api/gl/auth/config expose allowGoogleStaff', async () => {
  const res = await request(app).get('/api/gl/auth/config').expect(200);
  assert.ok(typeof res.body?.title === 'string');
  assert.ok(typeof res.body?.allowGoogleStaff === 'boolean');
});

test('GET /api/gl/auth/google/start redirige ou 503 si OAuth absent', async () => {
  const res = await request(app).get('/api/gl/auth/google/start');
  assert.ok([302, 303, 503].includes(res.status));
});
