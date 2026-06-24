'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { resolveProductFromRequest } = require('../lib/productResolver');
const { signAuthToken } = require('../middleware/requireTeacher');

before(async () => {
  await initSchema();
});

test('resolveProductFromRequest détecte le sous-domaine gl', () => {
  const product = resolveProductFromRequest({
    hostname: 'gl.olution.info',
    get: (key) => (key === 'host' ? 'gl.olution.info' : ''),
  });
  assert.strictEqual(product, 'gl');
});

test('resolveProductFromRequest garde foret par défaut', () => {
  const product = resolveProductFromRequest({
    hostname: 'foretmap.olution.info',
    get: () => '',
  });
  assert.strictEqual(product, 'foret');
});

test('resolveProductFromRequest reconnaît www.gl.*', () => {
  const product = resolveProductFromRequest({
    hostname: 'www.gl.olution.info',
    get: (key) => (key === 'host' ? 'www.gl.olution.info' : ''),
  });
  assert.strictEqual(product, 'gl');
});

test('fallback SPA accepte override x-foretmap-product=gl', async () => {
  const res = await request(app).get('/quelque-chose').set('X-Foretmap-Product', 'gl');
  assert.strictEqual(res.status, 200);
  assert.match(String(res.headers['content-type'] || ''), /html/i);
});

test('token GL refusé sur API ForetMap (/api/tasks)', async () => {
  const token = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: '999',
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });
  const res = await request(app).get('/api/tasks').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 403);
  assert.ok(
    String(res.body?.error || '')
      .toLowerCase()
      .includes('gnomes'),
  );
});

test('GET /favicon.ico sert l’icône GL sur host gl.*', async () => {
  const res = await request(app)
    .get('/favicon.ico')
    .set('Host', 'gl.olution.info')
    .set('X-Foretmap-Product', 'gl');
  assert.strictEqual(res.status, 200);
  assert.match(String(res.headers['content-type'] || ''), /image\/png/i);
  assert.ok(res.body && res.body.length > 0);
});

test('GET /favicon.ico sert l’icône ForetMap par défaut', async () => {
  const res = await request(app).get('/favicon.ico').set('Host', 'foretmap.olution.info');
  assert.strictEqual(res.status, 200);
  assert.match(String(res.headers['content-type'] || ''), /image\/(png|vnd\.microsoft\.icon)/i);
  assert.ok(res.body && res.body.length > 0);
});
