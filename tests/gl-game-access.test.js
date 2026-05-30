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
  createGlPlayer,
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');

let adminToken = '';
let playerToken = '';
let ownGameId = null;
let foreignGameId = null;

before(async () => {
  await initSchema();
  const stamp = Date.now();
  const admin = await createGlAdmin({
    email: `gl.game.access.${stamp}@ecole.local`,
    displayName: 'MJ Acces Partie',
  });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const ownClass = await createGlClass({
    name: `Classe Acces A ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });
  const foreignClass = await createGlClass({
    name: `Classe Acces B ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });
  const ownGame = await createGlGameWithTeams({
    classId: ownClass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe autorisee', type: 'gnome' }],
  });
  const foreignGame = await createGlGameWithTeams({
    classId: foreignClass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe privee', type: 'gnome' }],
  });
  ownGameId = Number(ownGame.game.id);
  foreignGameId = Number(foreignGame.game.id);

  const player = await createGlPlayer({
    classId: ownClass.id,
    pseudo: `access-player-${stamp}`,
    password: 'motdepasse123',
    teamId: ownGame.teams[0].id,
  });
  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE team_id = VALUES(team_id), joined_at = NOW()`,
    [ownGameId, ownGame.teams[0].id, player.id]
  );

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage'],
    playerId: player.id,
    playerPseudo: `access-player-${stamp}`,
    playerPermissions: ['gl.read', 'gl.action.request'],
    teamId: ownGame.teams[0].id,
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('GL accès partie: un joueur lit sa propre partie', async () => {
  const res = await request(app)
    .get(`/api/gl/games/${ownGameId}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.strictEqual(Number(res.body?.game?.id), ownGameId);
});

test('GL accès partie: refuse un joueur rattaché à une autre partie', async () => {
  const res = await request(app)
    .get(`/api/gl/games/${foreignGameId}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);
  assert.match(String(res.body?.error || ''), /accès refusé/i);
});

test('GL journal: refuse un joueur rattaché à une autre partie', async () => {
  await request(app)
    .get(`/api/gl/journal/games/${ownGameId}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);

  const res = await request(app)
    .get(`/api/gl/journal/games/${foreignGameId}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);
  assert.match(String(res.body?.error || ''), /accès refusé/i);
});

test('GL accès partie: un MJ conserve la lecture des parties', async () => {
  await request(app)
    .get(`/api/gl/games/${foreignGameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  await request(app)
    .get(`/api/gl/journal/games/${foreignGameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
});
