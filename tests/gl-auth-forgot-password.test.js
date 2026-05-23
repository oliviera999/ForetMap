'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');
const { hashResetToken } = require('../lib/passwordReset');

const stamp = Date.now();
const playerEmail = `gl.forgot.player.${stamp}@ecole.local`;
const playerPseudo = `player-forgot-${stamp}`;
const playerPassword = 'PlayerForgot-1';
const teacherEmail = `gl.forgot.teacher.${stamp}@ecole.local`;
const teacherPassword = 'TeacherForgot-1';

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `mj.forgot.${stamp}@ecole.local` });
  const cls = await createGlClass({ adminId: admin.id, name: `Classe forgot ${stamp}` });
  await createGlPlayer({
    classId: cls.id,
    pseudo: playerPseudo,
    password: playerPassword,
    email: playerEmail,
  });

  const hash = await bcrypt.hash(teacherPassword, 10);
  const teacherId = `teacher-forgot-${stamp}`;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'teacher', ?, ?, ?, ?, 'local', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1`,
    [teacherId, teacherEmail, `prof-forgot-${stamp}`, 'Prof forgot GL', hash]
  );
  await execute(
    `INSERT INTO gl_admins (email, display_name, role, foretmap_user_id, is_active, created_at, updated_at)
     VALUES (?, 'MJ forgot', 'mj', ?, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE foretmap_user_id = VALUES(foretmap_user_id), is_active = 1`,
    [teacherEmail, teacherId]
  );
});

test('POST /api/gl/auth/forgot-password renvoie un message neutre', async () => {
  const res = await request(app)
    .post('/api/gl/auth/forgot-password')
    .send({ email: 'inconnu@example.com' })
    .expect(200);
  assert.strictEqual(res.body?.ok, true);
  assert.ok(String(res.body?.message || '').includes('Si un compte existe'));
});

test('POST /api/gl/auth/reset-password réinitialise un joueur GL', async () => {
  const player = await queryOne('SELECT id FROM gl_players WHERE LOWER(email)=LOWER(?) LIMIT 1', [playerEmail]);
  assert.ok(player?.id);
  const rawToken = `gl-player-reset-${stamp}`;
  await execute(
    `INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, used_at)
     VALUES (?, 'gl_player', ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL)`,
    [`tok-gl-player-${stamp}`, String(player.id), hashResetToken(rawToken)]
  );

  const newPassword = 'NewPlayerPwd-9';
  await request(app)
    .post('/api/gl/auth/reset-password')
    .send({ token: rawToken, password: newPassword })
    .expect(200);

  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: playerPseudo, password: newPassword })
    .expect(200);
  assert.strictEqual(login.body?.auth?.userType, 'gl_player');
});

test('POST /api/gl/auth/reset-password réinitialise un enseignant MJ/Admin', async () => {
  const teacher = await queryOne(
    "SELECT id FROM users WHERE user_type = 'teacher' AND LOWER(email)=LOWER(?) LIMIT 1",
    [teacherEmail]
  );
  assert.ok(teacher?.id);
  const rawToken = `gl-teacher-reset-${stamp}`;
  await execute(
    `INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, used_at)
     VALUES (?, 'teacher', ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL)`,
    [`tok-gl-teacher-${stamp}`, teacher.id, hashResetToken(rawToken)]
  );

  const newPassword = 'NewTeacherPwd-9';
  await request(app)
    .post('/api/gl/auth/reset-password')
    .send({ token: rawToken, password: newPassword })
    .expect(200);

  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: teacherEmail, password: newPassword })
    .expect(200);
  assert.strictEqual(login.body?.auth?.userType, 'gl_admin');
});
