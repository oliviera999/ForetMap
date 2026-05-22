'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

const PSEUDO_NORMAL = 'equipe_aurore';
const PSEUDO_MUST_RESET = 'equipe_reinit';

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: 'mj.test@ecole.local', displayName: 'MJ Test' });
  const cls = await createGlClass({ name: '6e A', school: 'College Test', adminId: admin.id });
  await createGlPlayer({
    classId: cls.id,
    pseudo: PSEUDO_NORMAL,
    password: 'motdepasse123',
    firstName: 'Aurore',
    lastName: 'Dupont',
    passwordMustReset: false,
  });
  await createGlPlayer({
    classId: cls.id,
    pseudo: PSEUDO_MUST_RESET,
    password: 'ancienpin',
    firstName: 'Lea',
    lastName: 'Martin',
    passwordMustReset: true,
  });
});

test('POST /api/gl/auth/login accepte pseudo + password', async () => {
  const res = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: PSEUDO_NORMAL, pin: 'motdepasse123' })
    .expect(200);
  assert.ok(res.body?.authToken);
  assert.strictEqual(res.body?.auth?.product, 'gl');
  assert.strictEqual(res.body?.auth?.userType, 'gl_player');
  assert.strictEqual(res.body?.auth?.displayName, PSEUDO_NORMAL);
});

test('POST /api/gl/auth/login rejette un mauvais mot de passe', async () => {
  const res = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: PSEUDO_NORMAL, pin: 'mauvais' })
    .expect(401);
  assert.ok(String(res.body?.error || '').includes('incorrect'));
});

test('POST /api/gl/auth/login accepte identifier + password (joueur)', async () => {
  const res = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: PSEUDO_NORMAL, password: 'motdepasse123' })
    .expect(200);
  assert.strictEqual(res.body?.auth?.userType, 'gl_player');
});

test('un joueur en réinitialisation forcée ne peut appeler que le changement de mot de passe', async () => {
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: PSEUDO_MUST_RESET, password: 'ancienpin' })
    .expect(200);
  assert.strictEqual(login.body?.auth?.passwordMustReset, true);

  await request(app)
    .get('/api/gl/gameplay-settings')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .expect(403)
    .expect((res) => {
      assert.strictEqual(res.body?.mustResetPassword, true);
    });

  await request(app)
    .post('/api/gl/auth/change-password')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .send({ currentPassword: 'ancienpin', newPassword: 'nouveaupin' })
    .expect(200);

  const relogin = await request(app)
    .post('/api/gl/auth/login')
    .send({ identifier: PSEUDO_MUST_RESET, password: 'nouveaupin' })
    .expect(200);
  assert.strictEqual(relogin.body?.auth?.passwordMustReset, false);
});

test('GET /api/gl/auth/me expose first_name / last_name', async () => {
  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: PSEUDO_NORMAL, pin: 'motdepasse123' })
    .expect(200);
  const res = await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${login.body.authToken}`)
    .expect(200);
  assert.strictEqual(res.body?.auth?.product, 'gl');
  assert.strictEqual(res.body?.profile?.pseudo, PSEUDO_NORMAL);
  assert.ok(res.body?.profile);
});
