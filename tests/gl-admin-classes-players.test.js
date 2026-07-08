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
let secondClassId = null;
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

test('PUT /api/gl/admin/classes/:id met à jour une classe', async () => {
  const updated = await request(app)
    .put(`/api/gl/admin/classes/${createdClassId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ school: 'Lyautey GL', isActive: true })
    .expect(200);
  assert.equal(updated.body?.school, 'Lyautey GL');
  assert.equal(Number(updated.body?.is_active), 1);
});

test('POST /api/gl/admin/classes crée une seconde classe supprimable', async () => {
  const res = await request(app)
    .post('/api/gl/admin/classes')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: `Classe Delete ${stamp}`, school: 'Lyautey' })
    .expect(201);
  secondClassId = Number(res.body?.id);
  assert.ok(secondClassId > 0);
});

test('POST /api/gl/admin/players crée un joueur puis reset-password', async () => {
  const created = await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      classId: createdClassId,
      firstName: 'Aurore',
      lastName: 'Dupont',
      pseudo: `gl-admin-player-${stamp}`,
      pin: '1234',
    })
    .expect(201);
  createdPlayerId = Number(created.body?.id);
  assert.ok(createdPlayerId > 0);

  await request(app)
    .post(`/api/gl/admin/players/${createdPlayerId}/reset-password`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ password: '5555' })
    .expect(200);
});

test('PUT /api/gl/admin/players/:id met à jour classe et statut', async () => {
  const updated = await request(app)
    .put(`/api/gl/admin/players/${createdPlayerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ classId: secondClassId, isActive: false })
    .expect(200);
  assert.equal(Number(updated.body?.class_id), Number(secondClassId));
  assert.equal(Number(updated.body?.is_active), 0);
});

test('GET /api/gl/admin/players/export retourne un CSV', async () => {
  const res = await request(app)
    .get('/api/gl/admin/players/export')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.match(String(res.text || ''), /ID,Prenom,Nom,Pseudo,Classe,Actif/);
  assert.match(String(res.text || ''), new RegExp(`gl-admin-player-${stamp}`));
});

test('DELETE /api/gl/admin/players/:id supprime un joueur inactif', async () => {
  await request(app)
    .delete(`/api/gl/admin/players/${createdPlayerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('DELETE /api/gl/admin/classes/:id refuse si joueurs actifs', async () => {
  const active = await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      classId: createdClassId,
      firstName: 'Milo',
      lastName: 'Roux',
      pseudo: `gl-active-${stamp}`,
      password: '1234',
    })
    .expect(201);
  const activePlayerId = Number(active.body?.id);
  assert.ok(activePlayerId > 0);
  await request(app)
    .delete(`/api/gl/admin/classes/${createdClassId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(409);
  await request(app)
    .delete(`/api/gl/admin/players/${activePlayerId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('DELETE /api/gl/admin/classes/:id supprime une classe vide', async () => {
  await request(app)
    .delete(`/api/gl/admin/classes/${secondClassId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('GET /api/gl/admin/content retourne la liste des pages', async () => {
  const res = await request(app)
    .get('/api/gl/admin/content')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
});
