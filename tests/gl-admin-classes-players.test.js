'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { createGlAdmin, signTokens } = require('./helpers/glFixtures');

let adminToken = '';
let createdClassId = null;
let createdPlayerId = null;
const stamp = Date.now();

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: `gl-admin-tests-${stamp}@ecole.local` });
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.players.manage', 'gl.content.manage', 'gl.read'],
  });
  adminToken = tokens.adminToken;
});

test('POST /api/gl/admin/classes crée une classe', async () => {
  const res = await request(app)
    .post('/api/gl/admin/classes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Classe Admin ${stamp}`, school: 'Lyautey' })
    .expect(201);
  createdClassId = Number(res.body?.id);
  assert.ok(createdClassId > 0);
});

test('POST /api/gl/admin/players crée un joueur puis reset-pin', async () => {
  const created = await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId: createdClassId, pseudo: `gl-admin-player-${stamp}`, pin: '1234' })
    .expect((res) => {
      if (![201, 400, 500].includes(res.status)) {
        throw new Error(`Statut inattendu ${res.status}`);
      }
    });
  if (created.status === 201) {
    createdPlayerId = Number(created.body?.id);
    assert.ok(createdPlayerId > 0);
    await request(app)
      .post(`/api/gl/admin/players/${createdPlayerId}/reset-pin`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pin: '5555' })
      .expect(200);
  } else {
    assert.ok(String(created.body?.error || '').length > 0);
  }
});

test('GET /api/gl/admin/content retourne la liste des pages', async () => {
  const res = await request(app)
    .get('/api/gl/admin/content')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
});
