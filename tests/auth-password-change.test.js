'use strict';

/**
 * Changement de mot de passe authentifié (`POST /api/auth/me/password`, audit CDG-42) :
 * élève et enseignant, compte Google sans mot de passe, révocation des autres sessions,
 * jeton neuf dans la réponse, et « mot de passe oublié » ouvert aux comptes sans mot de passe.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { recomputeUserRole } = require('../lib/effectiveRole');

test.before(async () => {
  await initSchema();
});

async function createAccount({ userType, password, provider = 'local' }) {
  const id = crypto.randomUUID();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const email = `pwd_${stamp}@example.com`;
  const hash = password ? await bcrypt.hash(password, 10) : null;
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Pwd', ?, ?, ?, ?, 1, NOW(), NOW())`,
    [id, userType, email, `pwd_${stamp}`, stamp, `Pwd ${stamp}`, hash, provider],
  );
  await recomputeUserRole(id);
  return { id, email, pseudo: `pwd_${stamp}` };
}

async function tokenFor(userType, userId) {
  const role = await queryOne(
    `SELECT r.id, r.slug, r.\`rank\` FROM user_roles ur INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_type = ? AND ur.user_id = ? AND ur.is_primary = 1 LIMIT 1`,
    [userType, userId],
  );
  const epoch = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [userId]);
  return signAuthToken({
    userType,
    userId,
    roleId: role.id,
    roleSlug: role.slug,
    roleRank: role.rank,
    tokenEpoch: Number(epoch?.token_epoch || 0),
  });
}

test('élève : mot de passe actuel exigé, puis nouveau mot de passe actif et autres sessions révoquées', async () => {
  const student = await createAccount({ userType: 'student', password: 'ancien1234' });
  const token = await tokenFor('student', student.id);
  const other = await tokenFor('student', student.id);

  await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ newPassword: 'nouveau1234' })
    .expect(400);
  await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: 'faux', newPassword: 'nouveau1234' })
    .expect(401);
  const res = await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: 'ancien1234', newPassword: 'nouveau1234' })
    .expect(200);
  assert.ok(res.body.authToken, 'jeton neuf attendu');
  assert.strictEqual(res.body.auth?.userId, student.id);

  // L'ancienne session (autre appareil) est révoquée ; la nouvelle vit.
  const revoked = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${other}`)
    .expect(401);
  assert.strictEqual(revoked.body.code, 'SESSION_REVOKED');
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${res.body.authToken}`)
    .expect(200);

  await request(app)
    .post('/api/auth/login')
    .send({ identifier: student.pseudo, password: 'ancien1234' })
    .expect(401);
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: student.pseudo, password: 'nouveau1234' })
    .expect(200);
  assert.strictEqual(login.body.passwordMustReset, false);
});

test('enseignant : plancher de 12 caractères', async () => {
  const teacher = await createAccount({ userType: 'teacher', password: 'MotDePasseSolide!42' });
  const token = await tokenFor('teacher', teacher.id);
  const short = await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: 'MotDePasseSolide!42', newPassword: 'court1' })
    .expect(400);
  assert.match(String(short.body.error), /12/);
  await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: 'MotDePasseSolide!42', newPassword: 'NouveauSolide!42' })
    .expect(200);
});

test('compte Google sans mot de passe : édite son profil et se dote d’un mot de passe sans en redonner', async () => {
  const student = await createAccount({ userType: 'student', password: null, provider: 'google' });
  const token = await tokenFor('student', student.id);
  const edit = await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${token}`)
    .send({ description: 'Compte Google' })
    .expect(200);
  assert.strictEqual(edit.body.description, 'Compte Google');
  const own = await request(app)
    .patch(`/api/students/${student.id}/profile`)
    .set('Authorization', `Bearer ${token}`)
    .send({ description: 'Compte Google, bis' })
    .expect(200);
  assert.strictEqual(own.body.description, 'Compte Google, bis');

  const res = await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ newPassword: 'premier1234' })
    .expect(200);
  assert.ok(res.body.authToken);
  await request(app)
    .post('/api/auth/login')
    .send({ identifier: student.pseudo, password: 'premier1234' })
    .expect(200);
  // Désormais avec mot de passe : le redonner devient obligatoire.
  await request(app)
    .patch('/api/auth/me/profile')
    .set('Authorization', `Bearer ${res.body.authToken}`)
    .send({ description: 'Sans mot de passe actuel' })
    .expect(400);
});

test('mot de passe provisoire : signalé à la connexion, levé par le changement', async () => {
  const student = await createAccount({ userType: 'student', password: 'provisoire1' });
  await execute('UPDATE users SET password_must_reset = 1 WHERE id = ?', [student.id]);
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: student.pseudo, password: 'provisoire1' })
    .expect(200);
  assert.strictEqual(login.body.passwordMustReset, true);
  await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .send({ currentPassword: 'provisoire1', newPassword: 'definitif1' })
    .expect(200);
  const row = await queryOne('SELECT password_must_reset FROM users WHERE id = ?', [student.id]);
  assert.strictEqual(Number(row.password_must_reset), 0);
});

test('mot de passe oublié : un compte élève sans mot de passe reçoit un jeton de réinitialisation', async () => {
  const student = await createAccount({ userType: 'student', password: null, provider: 'google' });
  await request(app).post('/api/auth/forgot-password').send({ email: student.email }).expect(200);
  const tokenRow = await queryOne(
    "SELECT id FROM password_reset_tokens WHERE user_type = 'student' AND user_id = ? AND used_at IS NULL LIMIT 1",
    [student.id],
  );
  assert.ok(tokenRow, 'jeton de réinitialisation créé');
  // Un compte désactivé n'en reçoit pas.
  const inactive = await createAccount({ userType: 'student', password: 'x1234' });
  await execute('UPDATE users SET is_active = 0 WHERE id = ?', [inactive.id]);
  await request(app).post('/api/auth/forgot-password').send({ email: inactive.email }).expect(200);
  const none = await queryOne(
    "SELECT id FROM password_reset_tokens WHERE user_type = 'student' AND user_id = ? LIMIT 1",
    [inactive.id],
  );
  assert.ok(!none, 'aucun jeton pour un compte désactivé');
});

test('CDG-52 : un jeton de réinitialisation ouvert est consommé par un changement de mot de passe', async () => {
  const student = await createAccount({ userType: 'student', password: 'ancien1234' });
  await request(app).post('/api/auth/forgot-password').send({ email: student.email }).expect(200);
  const open = await queryOne(
    "SELECT id FROM password_reset_tokens WHERE user_type = 'student' AND user_id = ? AND used_at IS NULL",
    [student.id],
  );
  assert.ok(open, 'jeton ouvert');
  const token = await tokenFor('student', student.id);
  await request(app)
    .post('/api/auth/me/password')
    .set('Authorization', `Bearer ${token}`)
    .send({ currentPassword: 'ancien1234', newPassword: 'nouveau1234' })
    .expect(200);
  const still = await queryOne(
    "SELECT id FROM password_reset_tokens WHERE user_type = 'student' AND user_id = ? AND used_at IS NULL",
    [student.id],
  );
  assert.ok(!still, 'le jeton ouvert est consommé');
});

test('CDG-52 : « mot de passe oublié » plafonné par adresse visée, réponse neutre', async () => {
  const {
    FORGOT_PASSWORD_MAX_PER_WINDOW,
    resetForgotPasswordLimiterForTests,
  } = require('../lib/passwordReset');
  resetForgotPasswordLimiterForTests();
  const student = await createAccount({ userType: 'student', password: 'x1234' });
  for (let i = 0; i < FORGOT_PASSWORD_MAX_PER_WINDOW + 2; i += 1) {
    await request(app).post('/api/auth/forgot-password').send({ email: student.email }).expect(200);
  }
  const count = await queryOne(
    "SELECT COUNT(*) AS c FROM password_reset_tokens WHERE user_type = 'student' AND user_id = ?",
    [student.id],
  );
  assert.strictEqual(Number(count.c), FORGOT_PASSWORD_MAX_PER_WINDOW);
  resetForgotPasswordLimiterForTests();
});
