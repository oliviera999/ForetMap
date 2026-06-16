'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureRbacBootstrap } = require('../lib/rbac');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

const stamp = Date.now();
const playerPseudo = `gl-profile-player-${stamp}`;
const playerPassword = '1234';
const staffEmail = `gl-profile-staff-${stamp}@ecole.local`;
const staffPassword = 'StaffProfile!1';
const staffNewPassword = 'StaffProfile!2';
const foretmapStudentId = `student-gl-link-${stamp}`;
const foretmapStudentPseudo = `fm-link-${stamp}`;
const foretmapStudentPassword = 'Eleve-1234';
const playerPseudoUpdated = `glp-${String(stamp).slice(-6)}`;

let playerToken = '';
let staffToken = '';

before(async () => {
  await initSchema();
  await ensureRbacBootstrap();

  const teacherHash = await bcrypt.hash(staffPassword, 10);
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, ?, 'local', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [`teacher-gl-profile-${stamp}`, staffEmail, `staff-${stamp}`, 'Staff GL Profil', teacherHash],
  );
  const adminRole = await queryOne("SELECT id FROM roles WHERE slug = 'admin' LIMIT 1");
  await execute(
    `INSERT INTO user_roles (user_id, user_type, role_id, is_primary, assigned_at)
     VALUES (?, 'teacher', ?, 1, NOW())
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id), is_primary = 1`,
    [`teacher-gl-profile-${stamp}`, adminRole.id],
  );

  const studentHash = await bcrypt.hash(foretmapStudentPassword, 10);
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, 'Lien', 'ForetMap', 'Lien ForetMap', ?, 'local', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [foretmapStudentId, `link-${stamp}@ecole.local`, foretmapStudentPseudo, studentHash],
  );

  const glAdmin = await createGlAdmin({
    email: `gl-profile-admin-${stamp}@ecole.local`,
    displayName: 'Admin profil',
  });
  const glClass = await createGlClass({ name: `Classe profil ${stamp}`, adminId: glAdmin.id });
  await createGlPlayer({
    classId: glClass.id,
    pseudo: playerPseudo,
    password: playerPassword,
    email: `player-${stamp}@ecole.local`,
  });

  const loginPlayer = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: playerPseudo, password: playerPassword })
    .expect(200);
  playerToken = loginPlayer.body.authToken;

  const loginStaff = await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier: staffEmail, password: staffPassword })
    .expect(200);
  staffToken = loginStaff.body.authToken;
});

test('PATCH /api/gl/auth/me/profile met a jour le profil joueur et reemet la session', async () => {
  const pngData =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0m4AAAAASUVORK5CYII=';
  const res = await request(app)
    .patch('/api/gl/auth/me/profile')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({
      pseudo: playerPseudoUpdated,
      email: `player-new-${stamp}@ecole.local`,
      description: 'Profil GL mis a jour',
      avatarData: pngData,
      currentPassword: playerPassword,
    })
    .expect(200);

  assert.strictEqual(res.body?.ok, true);
  assert.strictEqual(res.body?.auth?.displayName, playerPseudoUpdated);
  assert.ok(typeof res.body?.authToken === 'string' && res.body.authToken.length > 10);
  assert.strictEqual(res.body?.profile?.description, 'Profil GL mis a jour');
  assert.ok(String(res.body?.profile?.avatar_path || '').includes('gl_players/'));
  playerToken = res.body.authToken;
});

test('PATCH /api/gl/auth/me/profile refuse un mot de passe joueur incorrect', async () => {
  await request(app)
    .patch('/api/gl/auth/me/profile')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ pseudo: 'x-invalid', currentPassword: 'wrong-pass' })
    .expect(401);
});

test('POST+DELETE /api/gl/auth/link-foretmap lient puis delient le compte eleve', async () => {
  await execute(
    "INSERT INTO gl_settings (`key`, value_json, updated_by, updated_at) VALUES ('platform.allow_player_link_foretmap', 'true', 'test', NOW()) ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()",
  );

  const linkRes = await request(app)
    .post('/api/gl/auth/link-foretmap')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ identifier: foretmapStudentPseudo, password: foretmapStudentPassword })
    .expect(200);
  assert.strictEqual(linkRes.body?.ok, true);
  assert.strictEqual(String(linkRes.body?.linkedForetmapStudent?.id), foretmapStudentId);

  await request(app)
    .delete('/api/gl/auth/link-foretmap')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ currentPassword: playerPassword })
    .expect(200);
});

test('PATCH /api/gl/auth/me/profile met a jour le profil staff', async () => {
  const res = await request(app)
    .patch('/api/gl/auth/me/profile')
    .set('Authorization', `Bearer ${staffToken}`)
    .send({
      displayName: 'MJ Profil Updated',
      description: 'Profil staff GL',
      currentPassword: staffPassword,
    })
    .expect(200);

  assert.strictEqual(res.body?.ok, true);
  assert.strictEqual(res.body?.profile?.display_name, 'MJ Profil Updated');
  assert.ok(typeof res.body?.authToken === 'string');
  staffToken = res.body.authToken;
});

test('POST /api/gl/auth/staff/change-password met a jour le mot de passe staff', async () => {
  await request(app)
    .post('/api/gl/auth/staff/change-password')
    .set('Authorization', `Bearer ${staffToken}`)
    .send({ currentPassword: staffPassword, newPassword: staffNewPassword })
    .expect(200);

  await request(app)
    .post('/api/gl/auth/staff/login')
    .send({ identifier: staffEmail, password: staffNewPassword })
    .expect(200);
});
