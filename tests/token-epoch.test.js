'use strict';

/**
 * Époque de jeton (audit comptes 2026-09, S4) : un changement de mot de passe invalide les
 * sessions déjà émises — ForetMap comme Gnomes & Licornes — sans attendre leur expiration.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { hashResetToken } = require('../lib/passwordReset');
const { getUserTokenEpoch, bumpUserTokenEpoch } = require('../lib/auth/tokenEpoch');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

const stamp = Date.now();
const studentId = `student-epoch-${stamp}`;
const studentPseudo = `epoch_${stamp}`;

before(async () => {
  await initSchema();
  const hash = await bcrypt.hash('avant-reset', 10);
  await execute(
    `INSERT INTO users (id, user_type, email, pseudo, first_name, last_name, display_name, affiliation, password_hash, auth_provider, is_active, created_at, updated_at)
     VALUES (?, 'student', ?, ?, 'Ep', 'Och', 'Ep Och', 'both', ?, 'local', 1, NOW(), NOW())`,
    [studentId, `epoch.${stamp}@ecole.local`, studentPseudo, hash],
  );
});

test('ForetMap : un jeton émis avant un reset de mot de passe est refusé (401 SESSION_REVOKED)', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ identifier: studentPseudo, password: 'avant-reset' })
    .expect(200);
  const oldToken = login.body.authToken;
  await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`).expect(200);

  const rawToken = `epoch-reset-${stamp}`;
  await execute(
    `INSERT INTO password_reset_tokens (id, user_type, user_id, token_hash, expires_at, used_at)
     VALUES (?, 'student', ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL)`,
    [`tok-epoch-${stamp}`, studentId, hashResetToken(rawToken)],
  );
  await request(app)
    .post('/api/auth/reset-password')
    .send({ token: rawToken, password: 'apres-reset' })
    .expect(200);
  assert.strictEqual(await getUserTokenEpoch(studentId), 1);

  const revoked = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${oldToken}`)
    .expect(401);
  assert.strictEqual(revoked.body?.code, 'SESSION_REVOKED');

  const relogin = await request(app)
    .post('/api/auth/login')
    .send({ identifier: studentPseudo, password: 'apres-reset' })
    .expect(200);
  await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${relogin.body.authToken}`)
    .expect(200);
});

test('ForetMap : un compte désactivé perd sa session immédiatement', async () => {
  const relogin = await request(app)
    .post('/api/auth/login')
    .send({ identifier: studentPseudo, password: 'apres-reset' })
    .expect(200);
  await execute('UPDATE users SET is_active = 0 WHERE id = ?', [studentId]);
  const revoked = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${relogin.body.authToken}`)
    .expect(401);
  assert.strictEqual(revoked.body?.reason, 'account_inactive');
  await execute('UPDATE users SET is_active = 1 WHERE id = ?', [studentId]);
});

test('GL : changer son mot de passe révoque l ancien jeton et en renvoie un neuf', async () => {
  const admin = await createGlAdmin({ email: `epoch.mj.${stamp}@ecole.local` });
  const cls = await createGlClass({ adminId: admin.id, name: `Classe epoch ${stamp}` });
  const pseudo = `gl_epoch_${stamp}`;
  await createGlPlayer({ classId: cls.id, pseudo, password: 'ancien1234' });

  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'ancien1234' })
    .expect(200);
  const oldToken = login.body.authToken;

  const changed = await request(app)
    .post('/api/gl/auth/change-password')
    .set('Authorization', `Bearer ${oldToken}`)
    .send({ currentPassword: 'ancien1234', newPassword: 'nouveau1234' })
    .expect(200);
  assert.ok(changed.body?.authToken);

  await request(app).get('/api/gl/auth/me').set('Authorization', `Bearer ${oldToken}`).expect(401);
  await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${changed.body.authToken}`)
    .expect(200);

  // Le nouveau mot de passe vaut aussi côté ForetMap : une seule identité.
  await request(app)
    .post('/api/auth/login')
    .send({ identifier: pseudo, password: 'nouveau1234' })
    .expect(200);
  await request(app)
    .post('/api/auth/login')
    .send({ identifier: pseudo, password: 'ancien1234' })
    .expect(401);
});

test('GL : un reset admin du mot de passe joueur révoque sa session', async () => {
  const admin = await createGlAdmin({ email: `epoch.mj2.${stamp}@ecole.local` });
  const cls = await createGlClass({ adminId: admin.id, name: `Classe epoch2 ${stamp}` });
  const pseudo = `gl_epoch2_${stamp}`;
  const player = await createGlPlayer({ classId: cls.id, pseudo, password: 'ancien1234' });
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: pseudo, password: 'ancien1234' })
    .expect(200);
  await bumpUserTokenEpoch(player.linked_foretmap_user_id);
  await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .expect(401);
  const epoch = await queryOne('SELECT token_epoch FROM users WHERE id = ?', [
    player.linked_foretmap_user_id,
  ]);
  assert.strictEqual(Number(epoch.token_epoch), 1);
});
