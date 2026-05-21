'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { createGlAdmin, createGlClass, createGlGameWithTeams, createGlPlayer, signTokens } = require('./helpers/glFixtures');

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamAId = null;
let teamBId = null;

const stamp = Date.now();
const adminEmail = `mascots.mj.${stamp}@ecole.local`;
const className = `Classe Mascots ${stamp}`;
const gameName = `Partie Mascots ${stamp}`;
const playerPseudo = `mascots-player-${stamp}`;

before(async () => {
  await initSchema();
  const admin = await createGlAdmin({ email: adminEmail, displayName: 'MJ Mascots' });
  const cls = await createGlClass({ name: className, school: 'Ecole Mascots', adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    name: gameName,
    createdBy: admin.id,
    status: 'live',
    teams: [
      { name: 'Team A', type: 'gnome', color: '#22c55e' },
      { name: 'Team B', type: 'unicorn', color: '#ef4444' },
    ],
  });
  gameId = Number(gameSeed.game.id);
  teamAId = Number(gameSeed.teams[0].id);
  teamBId = Number(gameSeed.teams[1].id);

  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: playerPseudo,
    password: '1234',
  });
  const tokens = await signTokens({
    adminId: admin.id,
    adminDisplayName: 'MJ Mascots',
    adminPermissions: ['gl.read', 'gl.team.manage', 'gl.game.manage', 'gl.content.manage'],
    playerId: player.id,
    playerPseudo,
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('GET /api/gl/mascots retourne le catalogue (auth GL requise)', async () => {
  await request(app).get('/api/gl/mascots').expect(401);
  const res = await request(app)
    .get('/api/gl/mascots')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.ok(Array.isArray(res.body?.mascots));
  assert.ok(res.body.mascots.length >= 12);
  assert.ok(res.body.mascots.some((row) => row.source === 'foretmap'));
});

test('POST /api/gl/mascots/assign exige gl.team.manage', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ gameId, teamId: teamAId, mascotId: 'gl-gnome-mousse' })
    .expect(403);
});

test('POST /api/gl/mascots/assign assigne une mascotte à une équipe', async () => {
  const res = await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamAId, mascotId: 'gl-gnome-mousse' })
    .expect(200);
  assert.strictEqual(res.body?.mascot?.id, 'gl-gnome-mousse');
  const team = await queryOne('SELECT mascot_id FROM gl_teams WHERE id = ? LIMIT 1', [teamAId]);
  assert.strictEqual(team?.mascot_id, 'gl-gnome-mousse');
});

test('POST /api/gl/mascots/assign refuse une mascotte déjà prise (409)', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamBId, mascotId: 'gl-gnome-mousse' })
    .expect(409);
});

test('POST /api/gl/mascots/assign accepte une autre mascotte pour la 2e équipe', async () => {
  const res = await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamBId, mascotId: 'gl-licorne-aube' })
    .expect(200);
  assert.strictEqual(res.body?.mascot?.id, 'gl-licorne-aube');
});

test('POST /api/gl/mascots/assign refuse une mascotte inconnue (404)', async () => {
  await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamAId, mascotId: 'gl-inexistante' })
    .expect(404);
});

test('POST /api/gl/mascots/assign accepte une mascotte ForetMap', async () => {
  const res = await request(app)
    .post('/api/gl/mascots/assign')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ gameId, teamId: teamAId, mascotId: 'renard2-cut-spritesheet' })
    .expect(200);
  assert.strictEqual(res.body?.mascot?.id, 'renard2-cut-spritesheet');
  assert.strictEqual(res.body?.mascot?.source, 'foretmap');
});

test('GET /api/gl/mascots?gameId=... renvoie les assignations actuelles', async () => {
  const res = await request(app)
    .get(`/api/gl/mascots?gameId=${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const map = Object.fromEntries((res.body?.assignments || []).map((a) => [Number(a.team_id), a.mascot_id]));
  assert.strictEqual(map[Number(teamAId)], 'renard2-cut-spritesheet');
  assert.strictEqual(map[Number(teamBId)], 'gl-licorne-aube');
});

test('POST /api/gl/mascots/packs valide le payload Zod', async () => {
  await request(app)
    .post('/api/gl/mascots/packs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Pack invalide', payload: { renderer: 'sprite_cut' } })
    .expect(400);
});

test('CRUD pack mascotte GL + assets', async () => {
  const payload = {
    id: `pack-${stamp}`,
    name: 'Pack test GL',
    renderer: 'sprite_cut',
    assets: [{ key: 'atlas', src: '/uploads/x.png' }],
    states: [{ key: 'idle', frames: [0, 1, 2], loop: true, fps: 12 }],
  };
  const created = await request(app)
    .post('/api/gl/mascots/packs')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ chapterId: 1, name: 'Pack test GL', payload })
    .expect(201);
  const packId = Number(created.body?.pack?.id);
  assert.ok(Number.isFinite(packId) && packId > 0);

  const list = await request(app)
    .get('/api/gl/mascots/packs')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok((list.body?.packs || []).some((pack) => Number(pack.id) === packId));

  const updatedPayload = { ...payload, name: 'Pack update GL' };
  await request(app)
    .put(`/api/gl/mascots/packs/${packId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Pack update GL', payload: updatedPayload })
    .expect(200);

  const dataBase64 = Buffer.from('asset-test', 'utf8').toString('base64');
  await request(app)
    .post(`/api/gl/mascots/packs/${packId}/assets`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      filename: 'atlas.txt',
      mimeType: 'text/plain',
      dataBase64,
    })
    .expect(201);

  const assets = await request(app)
    .get(`/api/gl/mascots/packs/${packId}/assets`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok((assets.body?.assets || []).some((asset) => asset.filename === 'atlas.txt'));

  await request(app)
    .delete(`/api/gl/mascots/packs/${packId}/assets/atlas.txt`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  await request(app)
    .delete(`/api/gl/mascots/packs/${packId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});

test('sprite library GL: ajout, liste, suppression', async () => {
  const dataBase64 = Buffer.from('sprite-test', 'utf8').toString('base64');
  const created = await request(app)
    .post('/api/gl/mascots/sprite-library')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ chapterId: 1, filename: 'sprite.txt', mimeType: 'text/plain', dataBase64 })
    .expect(201);
  const id = Number(created.body?.asset?.id);
  assert.ok(Number.isFinite(id) && id > 0);

  const list = await request(app)
    .get('/api/gl/mascots/sprite-library')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.ok((list.body?.assets || []).some((asset) => Number(asset.id) === id));

  await request(app)
    .delete(`/api/gl/mascots/sprite-library/${id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});
