'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const {
  createGlAdmin,
  createGlClass,
  createGlGameWithTeams,
  createGlPlayer,
  signTokens,
} = require('./helpers/glFixtures');

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;
let playerId = null;

before(async () => {
  await initSchema();
  const stamp = Date.now();
  const admin = await createGlAdmin({ email: `lifecycle.mj.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe Lifecycle ${stamp}`, adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const seed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    name: `Partie Lifecycle ${stamp}`,
    status: 'draft',
    teams: [{ name: 'Equipe L1', type: 'gnome', color: '#22c55e' }],
  });
  gameId = Number(seed.game.id);
  teamId = Number(seed.teams[0].id);

  const player = await createGlPlayer({
    classId: cls.id,
    pseudo: `lifecycle-player-${stamp}`,
    password: '1234',
  });
  playerId = Number(player.id);

  const tokens = await signTokens({
    adminId: admin.id,
    playerId,
    teamId,
    playerPseudo: player.pseudo,
    adminPermissions: ['gl.read', 'gl.game.manage'],
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('GET /api/gl/gameplay-settings répond pour un joueur authentifié', async () => {
  const res = await request(app)
    .get('/api/gl/gameplay-settings')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(typeof res.body?.settings?.turnsEnabled, 'boolean');
});

test('POST /api/gl/games/:id/join-team accepte un joueur', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/join-team`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ teamId })
    .expect(200);
  const member = await queryOne(
    'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
    [gameId, playerId],
  );
  assert.ok(member);
});

test('POST /api/gl/games/:id/join-team refuse un admin', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/join-team`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(403);
});

test('POST /api/gl/games/:id/join-team retourne 404 si équipe absente', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/join-team`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ teamId: 9999999 })
    .expect(404);
});

test('POST start/pause/end met à jour le statut de partie', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/start`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  await request(app)
    .post(`/api/gl/games/${gameId}/pause`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  await request(app)
    .post(`/api/gl/games/${gameId}/end`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const game = await queryOne('SELECT status FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  assert.strictEqual(game?.status, 'ended');
});
