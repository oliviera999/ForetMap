'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { createGlAdmin, signTokens } = require('./helpers/glFixtures');

let adminToken = '';

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `chapters.admin.${Date.now()}@ecole.local` });
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.content.manage'],
  });
  adminToken = tokens.adminToken;
});

test('POST /api/gl/chapters/admin/:id/markers retourne 404 pour chapitre absent', async () => {
  await request(app)
    .post('/api/gl/chapters/admin/9999999/markers')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ label: 'Repere', xPct: 10, yPct: 20 })
    .expect(404);
});

test('PUT /api/gl/chapters/admin/markers/:markerId retourne 404 pour marker absent', async () => {
  await request(app)
    .put('/api/gl/chapters/admin/markers/9999999')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ label: 'Repere MAJ' })
    .expect(404);
});
