'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
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

test('POST /api/gl/auth/admin/impersonate puis stop restaure l’admin GL', async () => {
  const admin = await queryOne('SELECT id FROM gl_admins WHERE LOWER(email) = LOWER(?) LIMIT 1', ['mj.test@ecole.local']);
  assert.ok(admin?.id);
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [PSEUDO_NORMAL]);
  assert.ok(player?.id);

  const adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit', 'gl.settings.manage'],
    displayName: 'MJ Test',
  });

  const imp = await request(app)
    .post('/api/gl/auth/admin/impersonate')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ userType: 'gl_player', userId: String(player.id) })
    .expect(200);
  assert.ok(imp.body?.authToken);
  assert.strictEqual(imp.body?.auth?.userType, 'gl_player');
  assert.strictEqual(imp.body?.auth?.impersonating, true);

  const meAsPlayer = await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${imp.body.authToken}`)
    .expect(200);
  assert.strictEqual(meAsPlayer.body?.auth?.userType, 'gl_player');
  assert.strictEqual(meAsPlayer.body?.auth?.impersonating, true);
  assert.strictEqual(meAsPlayer.body?.auth?.impersonatedBy?.roleSlug, 'gl_admin');

  const stop = await request(app)
    .post('/api/gl/auth/admin/impersonate/stop')
    .set('Authorization', `Bearer ${imp.body.authToken}`)
    .expect(200);
  assert.ok(stop.body?.authToken);
  assert.strictEqual(stop.body?.auth?.userType, 'gl_admin');
  assert.ok(!stop.body?.auth?.impersonating);
});

test('POST /api/gl/auth/admin/impersonate refuse un token MJ', async () => {
  const admin = await queryOne('SELECT id FROM gl_admins WHERE LOWER(email) = LOWER(?) LIMIT 1', ['mj.test@ecole.local']);
  assert.ok(admin?.id);
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [PSEUDO_NORMAL]);
  assert.ok(player?.id);

  const mjToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_mj',
    permissions: ['gl.read', 'gl.players.manage'],
    displayName: 'MJ Test',
  });

  await request(app)
    .post('/api/gl/auth/admin/impersonate')
    .set('Authorization', `Bearer ${mjToken}`)
    .send({ userType: 'gl_player', userId: String(player.id) })
    .expect(403);
});
