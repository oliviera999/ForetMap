'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

let playerToken = '';
const stamp = Date.now();
const playerPseudo = `gl-auth-me-${stamp}`;

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl-auth-admin-${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe AuthMe ${stamp}`, adminId: admin.id });
  await createGlPlayer({ classId: cls.id, pseudo: playerPseudo, password: '1234' });

  const login = await request(app)
    .post('/api/gl/auth/login')
    .send({ pseudo: playerPseudo, pin: '1234' })
    .expect(200);
  playerToken = login.body.authToken;
});

test('GET /api/gl/auth/config expose un payload stable', async () => {
  const res = await request(app).get('/api/gl/auth/config').expect(200);
  assert.strictEqual(typeof res.body?.title, 'string');
  assert.strictEqual(typeof res.body?.subtitle, 'string');
  assert.strictEqual(typeof res.body?.brand, 'object');
  assert.strictEqual(typeof res.body?.brand?.colors, 'object');
  assert.strictEqual(typeof res.body?.brand?.fonts, 'object');
  assert.strictEqual(typeof res.body?.allowGoogleStaff, 'boolean');
  assert.strictEqual(typeof res.body?.allowPlayerLinkForetmap, 'boolean');
});

test('GET /api/gl/auth/me requiert un token', async () => {
  await request(app).get('/api/gl/auth/me').expect(401);
});

test('GET /api/gl/auth/me retourne la session GL joueur', async () => {
  const res = await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(res.body?.auth?.product, 'gl');
  assert.strictEqual(res.body?.auth?.userType, 'gl_player');
  assert.strictEqual(res.body?.profile?.pseudo, playerPseudo);
});
