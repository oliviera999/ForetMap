'use strict';

// Forum GL : noms d'auteurs exposés (pseudo / nom du MJ, jamais l'e-mail), mode invité sans
// accès au forum (docs/reference/gl/presentation.md), verrouillage d'un sujet inexistant → 404.
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
let player2;
let adminToken;
let playerToken;
let player2Token;
let guestToken;

const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qXg8AAAAASUVORK5CYII=';

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

async function createThread(token, title = `Sujet ${Date.now()}`, body = 'Premier message') {
  const res = await request(app)
    .post('/api/gl/forum/threads')
    .set(bearer(token))
    .send({ title, body })
    .expect(201);
  return res.body;
}

before(async () => {
  await initSchema();
  admin = await createGlAdmin({
    email: `forum-mj-${stamp}@ecole.local`,
    displayName: `MJ Forum ${stamp}`,
  });
  const cls = await createGlClass({ name: `Classe forum ${stamp}`, adminId: admin.id });
  player = await createGlPlayer({ classId: cls.id, pseudo: `forum-${stamp}` });
  player2 = await createGlPlayer({ classId: cls.id, pseudo: `forum2-${stamp}` });
  ({ adminToken, playerToken } = await signTokens({
    adminId: admin.id,
    playerId: player.id,
    playerPseudo: player.pseudo,
  }));
  ({ playerToken: player2Token } = await signTokens({
    playerId: player2.id,
    playerPseudo: player2.pseudo,
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

test('le mode invité n’a pas accès au forum, ni en lecture ni en écriture', async () => {
  // Choix produit (doc de référence GL, « Le mode invité ne donne pas accès au forum ») :
  // l'onglet n'est pas proposé à l'invité et `requireGlAuth` le refuse sur tout le routeur.
  const read = await request(app)
    .get('/api/gl/forum/threads')
    .set('Authorization', `Bearer ${guestToken}`)
    .expect(403);
  assert.strictEqual(read.body.guestBlocked, true);
  const write = await request(app)
    .post('/api/gl/forum/threads')
    .set('Authorization', `Bearer ${guestToken}`)
    .send({ title: 'Invité', body: 'Bonjour' })
    .expect(403);
  assert.strictEqual(write.body.guestBlocked, true);
});

test('verrouiller un sujet inexistant répond 404', async () => {
  await request(app)
    .patch('/api/gl/forum/threads/999999999/lock')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ locked: true })
    .expect(404);
});

test('GET /config : emojis, signalements et droits selon le compte', async () => {
  const forPlayer = await request(app).get('/api/gl/forum/config').set(bearer(playerToken));
  assert.strictEqual(forPlayer.status, 200);
  assert.ok(Array.isArray(forPlayer.body.reaction_emojis));
  assert.ok(forPlayer.body.reaction_emojis.length > 0);
  assert.strictEqual(typeof forPlayer.body.reports_enabled, 'boolean');
  assert.strictEqual(forPlayer.body.can_moderate, false);
  assert.strictEqual(forPlayer.body.can_participate, true);

  const forAdmin = await request(app).get('/api/gl/forum/config').set(bearer(adminToken));
  assert.strictEqual(forAdmin.body.can_moderate, true);
  assert.strictEqual(forAdmin.body.moderator_can_reply_locked, true);

  // L'invité n'a pas accès au forum : la configuration lui est refusée comme le reste.
  const forGuest = await request(app).get('/api/gl/forum/config').set(bearer(guestToken));
  assert.strictEqual(forGuest.status, 403);
  assert.strictEqual(forGuest.body.guestBlocked, true);
});

test('création : réponse compatible (champs à plat + thread + first_post_id)', async () => {
  const created = await createThread(playerToken);
  assert.ok(created.id);
  assert.strictEqual(created.thread.id, created.id);
  assert.ok(created.first_post_id);
});

test('photos jointes : image_urls sous /uploads/gl-forum-posts/', async () => {
  const created = await createThread(playerToken);
  await request(app)
    .post(`/api/gl/forum/threads/${created.id}/posts`)
    .set(bearer(playerToken))
    .send({ images: [TINY_PNG_DATA_URL] })
    .expect(201);
  const detail = await request(app)
    .get(`/api/gl/forum/threads/${created.id}`)
    .set(bearer(playerToken))
    .expect(200);
  const withPhoto = detail.body.posts.find((p) => p.image_urls?.length > 0);
  assert.ok(withPhoto, 'un message avec photo');
  assert.match(withPhoto.image_urls[0], /^\/uploads\/gl-forum-posts\//);
  assert.strictEqual(withPhoto.body, '(Photo)');
  assert.strictEqual(Number(detail.body.total_posts), 2);
});

test('réactions : bascule, agrégat reacted_by_me, emoji refusé', async () => {
  const created = await createThread(playerToken);
  const config = await request(app).get('/api/gl/forum/config').set(bearer(player2Token));
  const emoji = config.body.reaction_emojis[0];

  const on = await request(app)
    .post(`/api/gl/forum/posts/${created.first_post_id}/reactions`)
    .set(bearer(player2Token))
    .send({ emoji })
    .expect(200);
  assert.strictEqual(on.body.reacted, true);

  const detail = await request(app)
    .get(`/api/gl/forum/threads/${created.id}`)
    .set(bearer(player2Token))
    .expect(200);
  const reaction = detail.body.posts[0].reactions.find((r) => r.emoji === emoji);
  assert.strictEqual(Number(reaction.count), 1);
  assert.strictEqual(!!reaction.reacted_by_me, true);

  const off = await request(app)
    .post(`/api/gl/forum/posts/${created.first_post_id}/reactions`)
    .set(bearer(player2Token))
    .send({ emoji })
    .expect(200);
  assert.strictEqual(off.body.reacted, false);

  await request(app)
    .post(`/api/gl/forum/posts/${created.first_post_id}/reactions`)
    .set(bearer(player2Token))
    .send({ emoji: 'pas-un-emoji' })
    .expect(400);
  await request(app)
    .post(`/api/gl/forum/posts/${created.first_post_id}/reactions`)
    .set(bearer(guestToken))
    .send({ emoji })
    .expect(403);
});

test('modifier : auteur seulement ; le MJ modifie encore dans un sujet verrouillé', async () => {
  const created = await createThread(playerToken);
  const postId = created.first_post_id;
  await request(app)
    .patch(`/api/gl/forum/posts/${postId}`)
    .set(bearer(player2Token))
    .send({ body: 'Pas à moi' })
    .expect(403);
  await request(app)
    .patch(`/api/gl/forum/posts/${postId}`)
    .set(bearer(guestToken))
    .send({ body: 'Invité' })
    .expect(403);
  const edited = await request(app)
    .patch(`/api/gl/forum/posts/${postId}`)
    .set(bearer(playerToken))
    .send({ body: 'Message corrigé' })
    .expect(200);
  assert.strictEqual(edited.body.body, 'Message corrigé');
  assert.ok(edited.body.edited_at);

  const mjReply = await request(app)
    .post(`/api/gl/forum/threads/${created.id}/posts`)
    .set(bearer(adminToken))
    .send({ body: 'Mot du MJ' })
    .expect(201);
  await request(app)
    .patch(`/api/gl/forum/threads/${created.id}/lock`)
    .set(bearer(adminToken))
    .send({ locked: true })
    .expect(200);

  await request(app)
    .patch(`/api/gl/forum/posts/${postId}`)
    .set(bearer(playerToken))
    .send({ body: 'Après verrouillage' })
    .expect(409);
  await request(app)
    .post(`/api/gl/forum/threads/${created.id}/posts`)
    .set(bearer(playerToken))
    .send({ body: 'Réponse bloquée' })
    .expect(409);
  await request(app)
    .post(`/api/gl/forum/threads/${created.id}/posts`)
    .set(bearer(adminToken))
    .send({ body: 'Le MJ conclut' })
    .expect(201);
  await request(app)
    .patch(`/api/gl/forum/posts/${mjReply.body.id}`)
    .set(bearer(adminToken))
    .send({ body: 'Mot du MJ (corrigé)' })
    .expect(200);
});

test('épingler : MJ seulement, sujet épinglé en tête de liste', async () => {
  const pinnedThread = await createThread(playerToken, `Épinglé ${Date.now()}`);
  await createThread(playerToken, `Récent ${Date.now()}`);

  await request(app)
    .patch(`/api/gl/forum/threads/${pinnedThread.id}/pin`)
    .set(bearer(playerToken))
    .send({ pinned: true })
    .expect(403);
  const res = await request(app)
    .patch(`/api/gl/forum/threads/${pinnedThread.id}/pin`)
    .set(bearer(adminToken))
    .send({ pinned: true })
    .expect(200);
  assert.strictEqual(Number(res.body.is_pinned), 1);

  const list = await request(app)
    .get('/api/gl/forum/threads?page_size=50')
    .set(bearer(playerToken))
    .expect(200);
  assert.strictEqual(Number(list.body.items[0].is_pinned), 1);
  assert.ok(list.body.items.some((t) => t.id === pinnedThread.id && Number(t.is_pinned) === 1));

  await request(app)
    .patch(`/api/gl/forum/threads/${pinnedThread.id}/pin`)
    .set(bearer(adminToken))
    .send({ pinned: false })
    .expect(200);
});

test('signalements : doublon refusé, liste et traitement réservés au MJ', async () => {
  const created = await createThread(playerToken, `Signalé ${Date.now()}`, 'Message douteux');
  const postId = created.first_post_id;

  await request(app)
    .post(`/api/gl/forum/posts/${postId}/report`)
    .set(bearer(guestToken))
    .send({ reason: 'Invité qui signale' })
    .expect(403);
  const report = await request(app)
    .post(`/api/gl/forum/posts/${postId}/report`)
    .set(bearer(player2Token))
    .send({ reason: 'Hors sujet' })
    .expect(201);
  await request(app)
    .post(`/api/gl/forum/posts/${postId}/report`)
    .set(bearer(player2Token))
    .send({ reason: 'Encore hors sujet' })
    .expect(409);

  await request(app).get('/api/gl/forum/reports').set(bearer(playerToken)).expect(403);
  const open = await request(app)
    .get('/api/gl/forum/reports?status=open&page_size=100')
    .set(bearer(adminToken))
    .expect(200);
  const row = open.body.items.find((r) => Number(r.id) === Number(report.body.report_id));
  assert.ok(row);
  assert.strictEqual(row.reporter_display_name, player2.pseudo);
  assert.strictEqual(row.post_author_display_name, player.pseudo);

  await request(app)
    .patch(`/api/gl/forum/reports/${report.body.report_id}`)
    .set(bearer(playerToken))
    .send({ status: 'resolved' })
    .expect(403);
  const resolved = await request(app)
    .patch(`/api/gl/forum/reports/${report.body.report_id}`)
    .set(bearer(adminToken))
    .send({ status: 'resolved' })
    .expect(200);
  assert.strictEqual(resolved.body.status, 'resolved');
});

test('liste : last_other_post_at ignore ses propres messages, posts_count ignore les supprimés', async () => {
  const created = await createThread(playerToken);
  const extra = await request(app)
    .post(`/api/gl/forum/threads/${created.id}/posts`)
    .set(bearer(playerToken))
    .send({ body: 'À supprimer' })
    .expect(201);
  await request(app)
    .delete(`/api/gl/forum/posts/${extra.body.id}`)
    .set(bearer(playerToken))
    .expect(200);

  const rowFor = async (token) => {
    const list = await request(app)
      .get('/api/gl/forum/threads?page_size=50')
      .set(bearer(token))
      .expect(200);
    return list.body.items.find((t) => t.id === created.id);
  };
  const own = await rowFor(playerToken);
  assert.strictEqual(Number(own.posts_count), 1);
  assert.strictEqual(own.last_other_post_at, null);
  const other = await rowFor(player2Token);
  assert.ok(other.last_other_post_at);
});
