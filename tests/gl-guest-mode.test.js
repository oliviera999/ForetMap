'use strict';

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { applyFeuilletsImport, parseFeuilletsWorkbook } = require('../lib/glLoreFeuilletsImport');
const { GL_DEMO_FEUILLET_CODES } = require('../lib/gl/demoFeuillets');

let guestToken = '';
const savedGuestDisabled = process.env.GL_GUEST_MODE_DISABLED;

before(async () => {
  delete process.env.GL_GUEST_MODE_DISABLED;
  await initSchema();
  await execute(
    "DELETE FROM gl_settings WHERE `key` = 'platform.guest_mode_enabled'",
  );

  const feuilletFile = path.join(process.cwd(), 'data', 'gl', 'corpus-feuillets-selene.xlsx');
  const feuilletParsed = await parseFeuilletsWorkbook(fs.readFileSync(feuilletFile));
  await applyFeuilletsImport(
    { queryAll: require('../database').queryAll, execute },
    feuilletParsed,
    { dryRun: false },
  );

  const guestRes = await request(app).post('/api/gl/auth/guest').expect(200);
  assert.strictEqual(guestRes.body?.ok, true);
  guestToken = guestRes.body.authToken;
});

after(() => {
  if (savedGuestDisabled === undefined) {
    delete process.env.GL_GUEST_MODE_DISABLED;
  } else {
    process.env.GL_GUEST_MODE_DISABLED = savedGuestDisabled;
  }
});

test('POST /api/gl/auth/guest émet un token invité conforme', async () => {
  const res = await request(app).post('/api/gl/auth/guest').expect(200);
  assert.strictEqual(res.body?.ok, true);
  assert.ok(res.body.authToken);
  assert.strictEqual(res.body.auth?.userType, 'gl_guest');
  assert.strictEqual(res.body.auth?.roleSlug, 'gl_observateur');
  assert.deepStrictEqual(res.body.auth?.permissions, ['gl.read']);
  assert.ok(res.body.auth?.gameId == null);
});

test('GET /api/gl/auth/config expose guestModeEnabled', async () => {
  const res = await request(app).get('/api/gl/auth/config').expect(200);
  assert.strictEqual(res.body?.guestModeEnabled, true);
});

test('GET /api/gl/biomes autorisé pour invité', async () => {
  const res = await request(app)
    .get('/api/gl/biomes')
    .set('Authorization', `Bearer ${guestToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
});

test('GET /api/gl/lore/feuillets refusé pour invité', async () => {
  const res = await request(app)
    .get('/api/gl/lore/feuillets')
    .set('Authorization', `Bearer ${guestToken}`)
    .expect(403);
  assert.strictEqual(res.body?.guestBlocked, true);
});

test('GET /api/gl/auth/me refusé pour invité', async () => {
  const res = await request(app)
    .get('/api/gl/auth/me')
    .set('Authorization', `Bearer ${guestToken}`)
    .expect(403);
  assert.strictEqual(res.body?.guestBlocked, true);
});

test('GET /api/gl/lore/demo-feuillets borné à l’allowlist sans texte MJ', async () => {
  const res = await request(app)
    .get('/api/gl/lore/demo-feuillets')
    .set('Authorization', `Bearer ${guestToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body?.items));
  assert.strictEqual(res.body.items.length, GL_DEMO_FEUILLET_CODES.length);
  const codes = res.body.items.map((item) => item.feuilletCode);
  assert.deepStrictEqual(codes, [...GL_DEMO_FEUILLET_CODES]);
  for (const item of res.body.items) {
    assert.strictEqual(item.texte, undefined);
    assert.ok(item.displayText);
    assert.strictEqual(item.progressStatus, 'revealed');
  }
});

test('GET /api/gl/lore/demo-feuillets sans token → 401', async () => {
  await request(app).get('/api/gl/lore/demo-feuillets').expect(401);
});

test('POST /api/gl/auth/guest refusé si mode désactivé (env)', async () => {
  process.env.GL_GUEST_MODE_DISABLED = '1';
  const res = await request(app).post('/api/gl/auth/guest').expect(403);
  assert.match(String(res.body?.error || ''), /désactivé/i);
  delete process.env.GL_GUEST_MODE_DISABLED;
});

test('POST /api/gl/auth/guest refusé si réglage platform.guest_mode_enabled=false', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('platform.guest_mode_enabled', 'false', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  const res = await request(app).post('/api/gl/auth/guest').expect(403);
  assert.match(String(res.body?.error || ''), /désactivé/i);
  await execute("DELETE FROM gl_settings WHERE `key` = 'platform.guest_mode_enabled'");
});
