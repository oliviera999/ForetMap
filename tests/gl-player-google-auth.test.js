'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');
const { resolveGlPlayerLogin } = require('../lib/glPlayerAuth');
const { setGoogleOAuthHooks, makeGoogleOAuthState } = require('../lib/googleOAuthShared');

const stamp = Date.now();
const playerEmail = `gl.player.oauth.${stamp}@pedagolyautey.org`;
const playerPseudo = `gl_oauth_player_${stamp}`;

let playerId = null;

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl.admin.oauth.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe OAuth ${stamp}`, adminId: admin.id });
  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: playerPseudo,
    password: 'secret1234',
    email: playerEmail,
  });
  playerId = player.id;
});

test('resolveGlPlayerLogin trouve un joueur par email GL', async () => {
  const resolved = await resolveGlPlayerLogin({ email: playerEmail, googleSub: 'sub-test-1' });
  assert.ok(resolved.ok);
  assert.strictEqual(String(resolved.player.id), String(playerId));
});

test('resolveGlPlayerLogin refuse un email sans compte joueur', async () => {
  const resolved = await resolveGlPlayerLogin({ email: `inconnu.${stamp}@pedagolyautey.org` });
  assert.ok(!resolved.ok);
  assert.strictEqual(resolved.status, 403);
});

test('GET /api/gl/auth/config expose allowGooglePlayer', async () => {
  const res = await request(app).get('/api/gl/auth/config').expect(200);
  assert.ok(typeof res.body?.allowGooglePlayer === 'boolean');
});

test('POST /api/gl/auth/google mode=player connecte un joueur avec idToken mock', async () => {
  const prevClientId = process.env.GL_GOOGLE_OAUTH_CLIENT_ID;
  const prevGoogleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  process.env.GL_GOOGLE_OAUTH_CLIENT_ID = 'gl-test-client-id';
  process.env.GOOGLE_OAUTH_CLIENT_ID = '';

  setGoogleOAuthHooks({
    verifyIdToken: async () => ({
      email: playerEmail,
      email_verified: true,
      iss: 'https://accounts.google.com',
      aud: 'gl-test-client-id',
      sub: 'gl-player-sub',
      name: 'Joueur OAuth',
    }),
  });

  try {
    const res = await request(app)
      .post('/api/gl/auth/google')
      .send({ idToken: 'mock-token', mode: 'player' })
      .expect(200);
    assert.strictEqual(res.body?.auth?.userType, 'gl_player');
    assert.strictEqual(res.body?.auth?.displayName, playerPseudo);
    assert.ok(res.body?.authToken);
  } finally {
    setGoogleOAuthHooks({});
    if (prevClientId == null) delete process.env.GL_GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GL_GOOGLE_OAUTH_CLIENT_ID = prevClientId;
    if (prevGoogleClientId == null) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GOOGLE_OAUTH_CLIENT_ID = prevGoogleClientId;
  }
});

test('GET /api/gl/auth/google/start?mode=player pose le cookie de mode', async () => {
  const prevClientId = process.env.GL_GOOGLE_OAUTH_CLIENT_ID;
  const prevSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  process.env.GL_GOOGLE_OAUTH_CLIENT_ID = 'gl-test-client-id';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'gl-test-secret';

  try {
    const res = await request(app).get('/api/gl/auth/google/start?mode=player');
    assert.ok([302, 303].includes(res.status), `status ${res.status}`);
    const setCookie = res.headers['set-cookie'] || [];
    const joined = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    assert.ok(joined.includes('gl_oauth_mode=player'));
    assert.ok(joined.includes('gl_oauth_state='));
  } finally {
    if (prevClientId == null) delete process.env.GL_GOOGLE_OAUTH_CLIENT_ID;
    else process.env.GL_GOOGLE_OAUTH_CLIENT_ID = prevClientId;
    if (prevSecret == null) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    else process.env.GOOGLE_OAUTH_CLIENT_SECRET = prevSecret;
  }
});

test('makeGoogleOAuthState reste utilisable pour le flux callback', () => {
  assert.ok(makeGoogleOAuthState().length >= 16);
});
