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

test('POST /api/gl/auth/staff/login connecte un admin ForetMap via pseudo sans email', async () => {
  const pseudoOnlyId = `teacher-gl-pseudo-${stamp}`;
  const pseudoOnly = `pseudo-admin-${stamp}`;
  const hash = await bcrypt.hash(adminPassword, 10);
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', NULL, ?, ?, ?, 'local', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [pseudoOnlyId, pseudoOnly, 'Admin pseudo GL', hash]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  await execute(
    `INSERT INTO user_roles (user_id, user_type, role_id, is_primary, assigned_at)
     VALUES (?, 'teacher', ?, 1, NOW())
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [pseudoOnlyId, adminRole.id]
  );

  const res = await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier: pseudoOnly, password: adminPassword })
    .expect(200);
  assert.strictEqual(res.body?.auth?.userType, 'gl_admin');
  const row = await queryOne('SELECT id, email, foretmap_user_id FROM gl_admins WHERE foretmap_user_id = ? LIMIT 1', [pseudoOnlyId]);
  assert.ok(row);
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

test('POST /api/gl/auth/staff/login accepte un MJ GL dont gl_admins.email = identifiant saisi (≠ users.email)', async () => {
  const glLoginKey = `cdla-${stamp}`;
  const foretmapEmail = `prof-${stamp}@ecole.local`;
  const legacyPassword = 'MjLegacy-1';
  const legacyHash = await bcrypt.hash(legacyPassword, 10);
  const legacyTeacherId = `teacher-gl-legacy-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, ?, 'local', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [legacyTeacherId, foretmapEmail, glLoginKey, 'MJ legacy', legacyHash]
  );
  const profRole = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  assert.ok(profRole?.id);
  await execute(
    `INSERT INTO user_roles (user_id, user_type, role_id, is_primary, assigned_at)
     VALUES (?, 'teacher', ?, 1, NOW())
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [legacyTeacherId, profRole.id]
  );
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ legacy GL', 'mj', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1`,
    [glLoginKey]
  );

  const res = await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier: glLoginKey, password: legacyPassword })
    .expect(200);
  assert.strictEqual(res.body?.auth?.userType, 'gl_admin');
  assert.ok(res.body?.auth?.permissions?.includes('gl.read'));
});

test('POST /api/gl/auth/staff/login refuse un compte MJ GL sans admin ForetMap', async () => {
  const res = await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier: mjOnlyEmail, password: 'wrong' })
    .expect(401);
  assert.ok(res.body?.error);
});

test('GET /api/gl/auth/config expose allowGoogleStaff et allowGooglePlayer', async () => {
  const res = await request(app).get('/api/gl/auth/config').expect(200);
  assert.ok(typeof res.body?.title === 'string');
  assert.ok(typeof res.body?.allowGoogleStaff === 'boolean');
  assert.ok(typeof res.body?.allowGooglePlayer === 'boolean');
});

test('GET /api/gl/auth/google/start redirige ou 503 si OAuth absent', async () => {
  const res = await request(app).get('/api/gl/auth/google/start');
  assert.ok([302, 303, 503].includes(res.status));
});

test('POST /api/gl/auth/login connecte un MJ via email ForetMap quand gl_admins.email = pseudo', async () => {
  const glPseudo = `mj-pseudo-${stamp}`;
  const foretmapEmail = `mj-email-${stamp}@ecole.local`;
  const mjPassword = 'MjEmailLogin-1';
  const mjHash = await bcrypt.hash(mjPassword, 10);
  const mjTeacherId = `teacher-gl-email-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, ?, 'local', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [mjTeacherId, foretmapEmail, glPseudo, 'MJ email login', mjHash]
  );
  const profRole = await queryOne("SELECT id FROM roles WHERE slug = 'prof' LIMIT 1");
  await execute(
    `INSERT INTO user_roles (user_id, user_type, role_id, is_primary, assigned_at)
     VALUES (?, 'teacher', ?, 1, NOW())
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [mjTeacherId, profRole.id]
  );
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ pseudo GL', 'mj', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1`,
    [glPseudo]
  );

  const res = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: foretmapEmail, password: mjPassword })
    .expect(200);
  assert.strictEqual(res.body?.auth?.userType, 'gl_admin');
});

test('POST /api/gl/auth/login tente le staff si un joueur partage le même pseudo', async () => {
  const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');
  const sharedId = `shared-login-${stamp}`;
  const sharedPassword = 'SharedStaffPwd!1';
  const hash = await bcrypt.hash(sharedPassword, 10);
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, ?, 'local', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [sharedId, `${sharedId}@ecole.local`, sharedId, 'Admin partage pseudo', hash]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  await execute(
    `INSERT INTO user_roles (user_id, user_type, role_id, is_primary, assigned_at)
     VALUES (?, 'teacher', ?, 1, NOW())
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [sharedId, adminRole.id]
  );
  const admin = await createGlAdmin({ email: `mj.${sharedId}@ecole.local` });
  const cls = await createGlClass({ adminId: admin.id, name: `Classe ${sharedId}` });
  await createGlPlayer({
    classId: cls.id,
    pseudo: sharedId,
    password: 'player-only-pin',
  });

  const res = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: sharedId, password: sharedPassword })
    .expect(200);
  assert.strictEqual(res.body?.auth?.userType, 'gl_admin');
});

test('POST /api/gl/auth/staff/login signale un compte enseignant Google-only', async () => {
  const googleOnlyId = `teacher-google-only-${stamp}`;
  const googleEmail = `google.only.${stamp}@pedagolyautey.org`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, NULL, 'google', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE password_hash = NULL, auth_provider = 'google', is_active = 1`,
    [googleOnlyId, googleEmail, `google${stamp}`, 'Prof Google only']
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  await execute(
    `INSERT INTO user_roles (user_id, user_type, role_id, is_primary, assigned_at)
     VALUES (?, 'teacher', ?, 1, NOW())
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [googleOnlyId, adminRole.id]
  );

  const res = await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier: googleEmail, password: 'any-password' })
    .expect(401);
  assert.ok(String(res.body?.error || '').includes('Google'));
});
