'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

let playerToken = '';
let adminToken = '';

const stamp = Date.now();

// Les droits GL sont relus en base à chaque requête (audit B6) : les identités doivent
// exister réellement, un identifiant synthétique donnerait 401.
before(async () => {
  await initSchema();
  const admin = await createGlAdmin({
    email: `content.mj.${stamp}@ecole.local`,
    displayName: 'MJ',
  });
  const cls = await createGlClass({ name: `Classe Content ${stamp}`, adminId: admin.id });
  const player = await createGlPlayer({ classId: cls.id, pseudo: `content-player-${stamp}` });

  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: 'Equipe test',
  });
  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.content.manage'],
    displayName: 'MJ',
  });
});

test('GET /api/gl/content/world renvoie le contenu seedé', async () => {
  const res = await request(app)
    .get('/api/gl/content/world')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(res.body.slug, 'world');
  assert.ok(String(res.body.title || '').length > 0);
});

test('PUT /api/gl/content/:slug nécessite gl.content.manage', async () => {
  await request(app)
    .put('/api/gl/content/world')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ title: 'Test', bodyMarkdown: 'A' })
    .expect(403);
});

test('PUT /api/gl/content/:slug met à jour le markdown', async () => {
  const updatedTitle = `Monde ${Date.now()}`;
  await request(app)
    .put('/api/gl/content/world')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ title: updatedTitle, bodyMarkdown: 'Contenu modifie' })
    .expect(200);

  const res = await request(app)
    .get('/api/gl/content/world')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res.body.title, updatedTitle);
  assert.ok(String(res.body.bodyMarkdown).includes('Contenu modifie'));
});

test('GET /api/gl/admin/content exige gl.content.manage', async () => {
  await request(app)
    .get('/api/gl/admin/content')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);
});

test('GET /api/gl/admin/content renvoie la liste des contenus GL', async () => {
  const res = await request(app)
    .get('/api/gl/admin/content')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.some((item) => item.slug === 'world'));
});
