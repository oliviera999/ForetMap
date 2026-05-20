'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { invalidateGameplayCache } = require('../lib/glSettings');

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

  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Actions', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [adminEmail]
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole Actions', ?, 1, NOW(), NOW())`,
    [className, admin.id]
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? ORDER BY id DESC LIMIT 1', [className]);
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
    [cls.id, chapter.id, gameName, admin.id]
  );
  const game = await queryOne('SELECT id FROM gl_games WHERE name = ? ORDER BY id DESC LIMIT 1', [gameName]);
  gameId = Number(game.id);

  await execute(
    `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
     VALUES (?, 'Eq Actions', 'gnome', '#65a30d', NOW(), NOW())`,
    [gameId]
  );
  teamId = Number((await queryOne('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id DESC LIMIT 1', [gameId])).id);

  await execute(
    `INSERT INTO gl_players (class_id, team_id, pseudo, pin_hash, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', 1, NOW(), NOW())`,
    [cls.id, teamId, playerPseudo]
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [playerPseudo]);
  playerId = Number(player.id);
  await execute(
    `INSERT IGNORE INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())`,
    [gameId, teamId, playerId]
  );

  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.game.manage', 'gl.event.emit'],
    displayName: 'MJ Actions',
  });
  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(playerId),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: playerPseudo,
    teamId,
  });
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

test('POST /actions crédite l’équipe de la partie et non la dernière équipe globale du joueur', async () => {
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const currentGame = await queryOne('SELECT class_id, created_by FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
    [currentGame.class_id, chapter.id, `Partie Actions bis ${stamp}`, currentGame.created_by]
  );
  const otherGame = await queryOne('SELECT id FROM gl_games WHERE name = ? ORDER BY id DESC LIMIT 1', [`Partie Actions bis ${stamp}`]);
  await execute(
    `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
     VALUES (?, 'Eq Actions Bis', 'unicorn', '#a855f7', NOW(), NOW())`,
    [otherGame.id]
  );
  const otherTeam = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id DESC LIMIT 1', [otherGame.id]);
  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE team_id = VALUES(team_id), joined_at = NOW()`,
    [otherGame.id, otherTeam.id, playerId]
  );
  await execute('UPDATE gl_players SET team_id = ?, updated_at = NOW() WHERE id = ?', [otherTeam.id, playerId]);
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

  const submission = await request(app)
    .post(`/api/gl/games/${gameId}/actions`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ actionType: 'explore', payload: { markerId: 2 } })
    .expect(201);

  const action = await queryOne('SELECT team_id FROM gl_action_requests WHERE id = ? LIMIT 1', [submission.body.actionRequestId]);
  assert.strictEqual(Number(action.team_id), Number(teamId));
  assert.notStrictEqual(Number(action.team_id), Number(otherTeam.id));

  await execute(
    `UPDATE gl_settings SET value_json = 'false', updated_at = NOW()
      WHERE \`key\` IN ('gameplay.player_actions_enabled', 'gameplay.turns_enabled')`
  );
  invalidateGameplayCache();
});
