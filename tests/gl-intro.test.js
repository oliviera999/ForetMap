'use strict';

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  normalizeIntroConfig,
  buildPublicIntroPayload,
  loadDefaultIntroConfig,
} = require('../lib/glIntro');
const { setModulesCacheForTests } = require('../lib/glSettings');

let adminToken = '';

before(async () => {
  await initSchema();
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: '301',
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage', 'gl.settings.manage'],
    displayName: 'MJ Intro',
  });
});

test('normalizeIntroConfig conserve 9 scènes et les voix autorisées', () => {
  const defaults = loadDefaultIntroConfig();
  const normalized = normalizeIntroConfig(defaults);
  assert.strictEqual(normalized.scenes.length, 9);
  assert.strictEqual(normalized.scenes[0].id, 'boite');
  assert.ok(
    normalized.scenes.every((scene) => ['copiste', 'selene', 'passeur'].includes(scene.voice)),
  );
});

test('buildPublicIntroPayload résout les URLs de repli', () => {
  const payload = buildPublicIntroPayload(loadDefaultIntroConfig());
  assert.strictEqual(payload.enabled, true);
  assert.ok(payload.images.boite.includes('/gl/intro/assets/img/boite.png'));
  assert.ok(payload.audio.loopUrl.includes('/gl/intro/assets/audio/loop.mp3'));
  assert.ok(Array.isArray(payload.scenes) && payload.scenes.length === 9);
});

test('GET /api/gl/content/intro est public et respecte le module', async () => {
  setModulesCacheForTests({ introEnabled: true });
  const res = await request(app).get('/api/gl/content/intro').expect(200);
  assert.strictEqual(res.body.enabled, true);
  assert.ok(res.body.scenes?.length === 9);

  setModulesCacheForTests({ introEnabled: false });
  const off = await request(app).get('/api/gl/content/intro').expect(200);
  assert.strictEqual(off.body.enabled, false);
  setModulesCacheForTests(null);
});

test('GET /api/gl/admin/content/intro exige gl.content.manage', async () => {
  const playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: '302',
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: 'Joueur',
  });
  await request(app)
    .get('/api/gl/admin/content/intro')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);

  const res = await request(app)
    .get('/api/gl/admin/content/intro')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res.body.scenes.length, 9);
});

test("PUT /api/gl/admin/content/intro met à jour le kicker d'une scène", async () => {
  const label = `kicker test ${Date.now()}`;
  const draft = normalizeIntroConfig(loadDefaultIntroConfig());
  draft.scenes[0].kicker = label;

  await request(app)
    .put('/api/gl/admin/content/intro')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(draft)
    .expect(200);

  const res = await request(app)
    .get('/api/gl/admin/content/intro')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res.body.scenes[0].kicker, label);
});

test('GET /api/gl/auth/config expose introEnabled', async () => {
  const res = await request(app).get('/api/gl/auth/config').expect(200);
  assert.strictEqual(typeof res.body.modules?.introEnabled, 'boolean');
});

after(async () => {
  setModulesCacheForTests(null);
  await execute("DELETE FROM gl_settings WHERE `key` = 'content.intro'").catch(() => {});
});
