'use strict';

require('./helpers/setup');

const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { invalidateGameplayCache } = require('../lib/glSettings');
const { createGlAdmin, createGlClass, createGlGameWithTeams, createGlPlayer, signTokens } = require('./helpers/glFixtures');

let playerToken = '';
let gameAId = null;
let gameBId = null;
let gameCId = null;
let teamAId = null;
let teamBId = null;
let playerId = null;

before(async () => {
  await initSchema();
  invalidateGameplayCache();

  const stamp = Date.now();
  const admin = await createGlAdmin({ email: `access.mj.${stamp}@ecole.local`, displayName: 'MJ Accès' });
  const cls = await createGlClass({ name: `Classe Accès ${stamp}`, school: 'Ecole Accès', adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");

  const gameA = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    name: `Partie Accès A ${stamp}`,
    createdBy: admin.id,
    status: 'live',
    teams: [{ name: 'Equipe A', type: 'gnome', color: '#65a30d' }],
  });
  const gameB = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    name: `Partie Accès B ${stamp}`,
    createdBy: admin.id,
    status: 'live',
    teams: [{ name: 'Equipe B', type: 'unicorn', color: '#2563eb' }],
  });
  const gameC = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    name: `Partie Accès C ${stamp}`,
    createdBy: admin.id,
    status: 'live',
    teams: [{ name: 'Equipe C', type: 'gnome', color: '#f59e0b' }],
  });

  gameAId = Number(gameA.game.id);
  gameBId = Number(gameB.game.id);
  gameCId = Number(gameC.game.id);
  teamAId = Number(gameA.teams[0].id);
  teamBId = Number(gameB.teams[0].id);

  const player = await createGlPlayer({
    classId: cls.id,
    teamId: teamBId,
    pseudo: `access-player-${stamp}`,
    password: '1234',
  });
  playerId = Number(player.id);
  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW()), (?, ?, ?, NOW())`,
    [gameAId, teamAId, playerId, gameBId, teamBId, playerId]
  );

  const tokens = await signTokens({
    playerId,
    playerPseudo: player.pseudo,
    playerPermissions: ['gl.read', 'gl.action.request'],
    teamId: teamBId,
  });
  playerToken = tokens.playerToken;
});

test('GET /api/gl/games/:id refuse un joueur non membre même avec une équipe globale dans le JWT', async () => {
  await request(app)
    .get(`/api/gl/games/${gameCId}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);
});

test('GET /api/gl/journal/games/:id refuse un joueur non membre', async () => {
  await request(app)
    .get(`/api/gl/journal/games/${gameCId}`)
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(403);
});

test('POST /api/gl/games/:id/actions rattache la demande à l’équipe du joueur dans cette partie', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.player_actions_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = 'true', updated_at = NOW()`
  );
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.turns_enabled', 'false', NOW())
     ON DUPLICATE KEY UPDATE value_json = 'false', updated_at = NOW()`
  );
  invalidateGameplayCache();

  const res = await request(app)
    .post(`/api/gl/games/${gameAId}/actions`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ actionType: 'explore', payload: { markerId: 1 } })
    .expect(201);
  assert.ok(res.body.actionRequestId);

  const action = await queryOne(
    'SELECT team_id FROM gl_action_requests WHERE id = ? AND game_id = ? AND player_id = ? LIMIT 1',
    [res.body.actionRequestId, gameAId, playerId]
  );
  assert.strictEqual(Number(action.team_id), teamAId);
  assert.notStrictEqual(Number(action.team_id), teamBId);

  await execute(
    `UPDATE gl_settings SET value_json = 'false', updated_at = NOW()
      WHERE \`key\` IN ('gameplay.player_actions_enabled', 'gameplay.turns_enabled')`
  );
  invalidateGameplayCache();
});
