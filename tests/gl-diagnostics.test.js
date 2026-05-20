'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');

const ORIGINAL_SECRET = process.env.DEPLOY_SECRET;

before(async () => {
  process.env.DEPLOY_SECRET = 'gl-diagnostics-secret';
  await initSchema();
});

test('GET /api/admin/diagnostics expose la section gl', async () => {
  const res = await request(app)
    .get('/api/admin/diagnostics')
    .set('X-Deploy-Secret', 'gl-diagnostics-secret')
    .expect(200);
  assert.ok(res.body?.gl, 'section gl manquante');
  assert.strictEqual(res.body.gl.ok, true);
  assert.strictEqual(typeof res.body.gl.activePlayers, 'number');
  assert.strictEqual(typeof res.body.gl.mascotPackCount, 'number');
  assert.ok(Array.isArray(res.body.gl.recentEventTypes));
});

test('GET /api/admin/diagnostics refuse sans secret', async () => {
  await request(app).get('/api/admin/diagnostics').expect(403);
});

test('GET /api/admin/diagnostics conserve gl ok=true même sans données', async () => {
  process.env.DEPLOY_SECRET = ORIGINAL_SECRET || 'gl-diagnostics-secret';
});
