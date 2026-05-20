'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { invalidateGameplayCache } = require('../lib/glSettings');
const { createGlAdmin, createGlClass, createGlGameWithTeams, createGlPlayer, signTokens } = require('./helpers/glFixtures');

let adminToken = '';
let playerToken = '';
let gameId = null;
let teamId = null;
let playerId = null;
const stamp = Date.now();
const adminEmail = `actions.mj.${stamp}@ecole.local`;
const className = `Classe Actions ${stamp}`;
const gameName = `Partie Actions ${stamp}`;
const playerPseudo = `action-player-${stamp}`;

before(async () => {
  await initSchema();
  invalidateGameplayCache();

  const admin = await createGlAdmin({ email: adminEmail, displayName: 'MJ Actions' });
  const cls = await createGlClass({ name: className, school: 'Ecole Actions', adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    name: gameName,
    createdBy: admin.id,
    status: 'live',
    teams: [{ name: 'Eq Actions', type: 'gnome', color: '#65a30d' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);

  const player = await createGlPlayer({
    classId: cls.id,
    teamId,
    pseudo: playerPseudo,
    password: '1234',
  });
  playerId = Number(player.id);
  await execute(
    `INSERT IGNORE INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())`,
    [gameId, teamId, playerId]
  );

  const tokens = await signTokens({
    adminId: admin.id,
    adminDisplayName: 'MJ Actions',
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.event.emit'],
    playerId,
    playerPseudo,
    playerPermissions: ['gl.read', 'gl.action.request'],
    teamId,
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('POST /actions refusé quand toggle player_actions_enabled = false', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.player_actions_enabled', 'false', NOW())
     ON DUPLICATE KEY UPDATE value_json = 'false', updated_at = NOW()`
  );
  invalidateGameplayCache();
  await request(app)
    .post(`/api/gl/games/${gameId}/actions`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ actionType: 'explore', payload: { markerId: 1 } })
    .expect(409);
});

test('Flux complet : joueur soumet → MJ accepte avec score → score appliqué', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.player_actions_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = 'true', updated_at = NOW()`
  );
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.scoring_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = 'true', updated_at = NOW()`
  );
  invalidateGameplayCache();

  const submission = await request(app)
    .post(`/api/gl/games/${gameId}/actions`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ actionType: 'explore', payload: { markerId: 1 } })
    .expect(201);
  assert.ok(submission.body.actionRequestId, 'actionRequestId attendu');
  const actionId = Number(submission.body.actionRequestId);

  const stateBefore = await request(app)
    .get(`/api/gl/games/${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const pendingBefore = stateBefore.body.pendingActions || [];
  assert.ok(pendingBefore.some((a) => Number(a.id) === actionId), 'action en attente attendue');

  await request(app)
    .post(`/api/gl/games/${gameId}/actions/${actionId}/resolve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ decision: 'accepted', scoreDelta: 3, reason: 'Bonne exploration' })
    .expect(200);

  const stateAfter = await request(app)
    .get(`/api/gl/games/${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const pendingAfter = stateAfter.body.pendingActions || [];
  assert.ok(!pendingAfter.some((a) => Number(a.id) === actionId), 'action ne doit plus être en attente');
  assert.strictEqual(stateAfter.body.scores?.[teamId]?.score, 3);

  // Reset
  await execute(
    `UPDATE gl_settings SET value_json = 'false', updated_at = NOW()
      WHERE \`key\` IN ('gameplay.player_actions_enabled', 'gameplay.scoring_enabled')`
  );
  invalidateGameplayCache();
});
