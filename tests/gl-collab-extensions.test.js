'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');

let adminToken = '';
let playerToken = '';
let gameId = null;
let chapterId = null;

const stamp = Date.now();

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({
    email: `gl.collab.${stamp}@ecole.local`,
    displayName: 'MJ Collab',
  });
  const cls = await createGlClass({
    name: `Classe Collab ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  chapterId = Number(chapter.id);
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Collab', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);

  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: `collab-player-${stamp}`,
    password: 'motdepasse123',
  });
  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.content.manage', 'gl.team.manage', 'gl.game.manage'],
    playerId: player.id,
    playerPseudo: `collab-player-${stamp}`,
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('GL context-comments: crée et liste sur gl_game', async () => {
  const created = await request(app)
    .post('/api/gl/context-comments')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ contextType: 'gl_game', contextId: String(gameId), body: 'Coucou la partie' })
    .expect(201);
  assert.strictEqual(created.body?.context_type, 'gl_game');

  const list = await request(app)
    .get(`/api/gl/context-comments?contextType=gl_game&contextId=${gameId}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(Array.isArray(list.body?.items));
  assert.ok(list.body.items.some((item) => item.id === created.body.id));
});

test('GL context-comments: refuse contextType non GL', async () => {
  await request(app)
    .post('/api/gl/context-comments')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ contextType: 'task', contextId: '1', body: 'tentative ForetMap' })
    .expect(400);
});

test('GL forum: crée un sujet, ajoute un post, verrouille en MJ', async () => {
  const thread = await request(app)
    .post('/api/gl/forum/threads')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ title: `Sujet test ${stamp}`, body: 'Premier message' })
    .expect(201);
  const threadId = thread.body?.id;
  assert.ok(threadId);

  await request(app)
    .post(`/api/gl/forum/threads/${threadId}/posts`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ body: 'Réponse MJ' })
    .expect(201);

  const detail = await request(app)
    .get(`/api/gl/forum/threads/${threadId}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual((detail.body?.posts || []).length, 2);

  await request(app)
    .patch(`/api/gl/forum/threads/${threadId}/lock`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ locked: true })
    .expect(200);

  await request(app)
    .post(`/api/gl/forum/threads/${threadId}/posts`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ body: 'Post bloqué ?' })
    .expect(409);
});

test('GL tutorials: CRUD admin + accusé de lecture joueur', async () => {
  const created = await request(app)
    .post('/api/gl/tutorials')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      slug: `tuto-collab-${stamp}`,
      title: 'Tutoriel collab',
      bodyMarkdown: '# Bienvenue',
      chapterId,
    })
    .expect(201);
  const tutorialId = created.body?.id;
  assert.ok(tutorialId);

  await request(app)
    .post(`/api/gl/tutorials/${tutorialId}/read`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);

  const reads = await request(app)
    .get('/api/gl/tutorials/me/read-ids')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok((reads.body?.ids || []).includes(tutorialId));

  await request(app)
    .delete(`/api/gl/tutorials/${tutorialId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('GL journal: GET /api/gl/journal/games/:id liste les évènements', async () => {
  const res = await request(app)
    .get(`/api/gl/journal/games/${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body?.events));
  assert.strictEqual(typeof res.body?.total, 'number');
});

test('GL kingdom-map: CRUD zones avec points %', async () => {
  const points = [
    { x: 10, y: 10 },
    { x: 90, y: 10 },
    { x: 50, y: 90 },
  ];
  const created = await request(app)
    .post('/api/gl/kingdom-map/zones')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ chapterId, label: 'Royaume du Nord', points, color: '#0ea5e9' })
    .expect(201);
  const zoneId = created.body?.id;
  assert.ok(zoneId);
  assert.deepStrictEqual(created.body?.points, points);

  const listed = await request(app)
    .get(`/api/gl/kingdom-map/zones?chapterId=${chapterId}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok((listed.body?.zones || []).some((zone) => zone.id === zoneId));

  const updated = await request(app)
    .put(`/api/gl/kingdom-map/zones/${zoneId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ label: 'Royaume renommé' })
    .expect(200);
  assert.strictEqual(updated.body?.label, 'Royaume renommé');

  const reshapedPoints = [
    { x: 12, y: 12 },
    { x: 88, y: 15 },
    { x: 48, y: 84 },
    { x: 18, y: 62 },
  ];
  const updatedPoints = await request(app)
    .put(`/api/gl/kingdom-map/zones/${zoneId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ points: reshapedPoints })
    .expect(200);
  assert.deepStrictEqual(updatedPoints.body?.points, reshapedPoints);

  await request(app)
    .delete(`/api/gl/kingdom-map/zones/${zoneId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('GL kingdom-map: refuse points hors plage', async () => {
  await request(app)
    .post('/api/gl/kingdom-map/zones')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ chapterId, label: 'Hors plage', points: [{ x: -1, y: 50 }, { x: 50, y: 50 }, { x: 50, y: 150 }] })
    .expect(400);
});
