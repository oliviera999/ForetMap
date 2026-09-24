'use strict';

// Forum GL : noms d'auteurs exposés (pseudo / nom du MJ, jamais l'e-mail), écriture
// refusée au mode invité, verrouillage d'un sujet inexistant → 404.
require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();
let admin;
let player;
let adminToken;
let playerToken;
let guestToken;

before(async () => {
  await initSchema();
  admin = await createGlAdmin({
    email: `forum-mj-${stamp}@ecole.local`,
    displayName: `MJ Forum ${stamp}`,
  });
  const cls = await createGlClass({ name: `Classe forum ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({ classId: cls.id, pseudo: `forum-${stamp}` });
  ({ adminToken, playerToken } = await signTokens({
    adminId: admin.id,
    playerId: player.id,
    playerPseudo: player.pseudo,
  }));
  guestToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_guest',
    userId: `guest-${stamp}`,
    roleSlug: 'gl_observateur',
    permissions: ['gl.read'],
    displayName: 'Visiteur',
  });
});

test('sujet et messages portent le nom affiché de leur auteur', async () => {
  const created = await request(app)
    .post('/api/gl/forum/threads')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ title: `Sujet ${stamp}`, body: 'Premier message' })
    .expect(201);

  await request(app)
    .post(`/api/gl/forum/threads/${created.body.id}/posts`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ body: 'Réponse du MJ' })
    .expect(201);

  const detail = await request(app)
    .get(`/api/gl/forum/threads/${created.body.id}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(detail.body.thread.author_display_name, player.pseudo);
  const names = detail.body.posts.map((p) => p.author_display_name);
  assert.deepStrictEqual(names, [player.pseudo, `MJ Forum ${stamp}`]);
  assert.ok(!JSON.stringify(detail.body).includes(admin.email), 'jamais l’e-mail du MJ');

  const list = await request(app)
    .get('/api/gl/forum/threads?page_size=50')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const row = list.body.items.find((t) => t.id === created.body.id);
  assert.ok(row, 'le sujet créé figure dans la liste');
  assert.strictEqual(row.author_display_name, player.pseudo);
});

test('le mode invité lit le forum mais ne peut pas y écrire', async () => {
  await request(app)
    .get('/api/gl/forum/threads')
    .set('Authorization', `Bearer ${guestToken}`)
    .expect(200);
  const res = await request(app)
    .post('/api/gl/forum/threads')
    .set('Authorization', `Bearer ${guestToken}`)
    .send({ title: 'Invité', body: 'Bonjour' })
    .expect(403);
  assert.match(res.body.error, /invité/i);
});

test('verrouiller un sujet inexistant répond 404', async () => {
  await request(app)
    .patch('/api/gl/forum/threads/999999999/lock')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ locked: true })
    .expect(404);
});
