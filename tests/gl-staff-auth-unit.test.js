'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const { initSchema, execute, queryOne } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');
const {
  isForetmapAdminForGl,
  ensureGlAdminRecord,
  resolveGlStaffLogin,
  buildGlAdminClaims,
} = require('../lib/glStaffAuth');

const stamp = Date.now();
const teacherId = `teacher-staff-unit-${stamp}`;
const teacherEmail = `staff.unit.${stamp}@ecole.local`;

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, 'x', 'local', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1`,
    [teacherId, teacherEmail, `staff-unit-${stamp}`, `Staff Unit ${stamp}`]
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  await execute(
    `INSERT INTO user_roles (user_id, user_type, role_id, is_primary, assigned_at)
     VALUES (?, 'teacher', ?, 1, NOW())
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [teacherId, adminRole.id]
  );
});

test('isForetmapAdminForGl détecte le rôle admin', () => {
  assert.strictEqual(isForetmapAdminForGl({ roleSlug: 'admin', permissions: [] }), true);
  assert.strictEqual(isForetmapAdminForGl({ roleSlug: 'teacher', permissions: [] }), false);
});

test('ensureGlAdminRecord crée puis met à jour un admin GL', async () => {
  const email = `ensure.gl.${stamp}@ecole.local`;
  const created = await ensureGlAdminRecord({ email, displayName: 'First', role: 'mj' });
  assert.ok(created?.id);
  assert.strictEqual(String(created.role).toLowerCase(), 'mj');
  const updated = await ensureGlAdminRecord({ email, displayName: 'Second', role: 'admin' });
  assert.strictEqual(String(updated.role).toLowerCase(), 'admin');
});

test('resolveGlStaffLogin rejette un email vide', async () => {
  const result = await resolveGlStaffLogin({ email: '' });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, 403);
});

test('resolveGlStaffLogin accepte un enseignant admin ForetMap', async () => {
  const result = await resolveGlStaffLogin({
    email: teacherEmail,
    displayName: 'Teacher Admin',
    teacherId,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.glRole, 'admin');
  const claims = buildGlAdminClaims(result.admin, result.glRole);
  assert.strictEqual(claims.userType, 'gl_admin');
  assert.strictEqual(claims.roleSlug, 'gl_admin');
});
