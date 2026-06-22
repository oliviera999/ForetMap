'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { signAuthToken } = require('../middleware/requireTeacher');
const { invalidateGameplayCache } = require('../lib/glSettings');
const { parseDiceRollPayload } = require('../lib/glDiceRoll');

let adminToken = '';
let playerToken = '';
let gameId = null;
let team1Id = null;
let team2Id = null;
let playerId = null;
const stamp = Date.now();

before(async () => {
  await initSchema();
  invalidateGameplayCache();

  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Dice', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [`dice.mj.${stamp}@ecole.local`],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
    `dice.mj.${stamp}@ecole.local`,
  ]);

  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole Dice', ?, 1, NOW(), NOW())`,
    [`Classe Dice ${stamp}`, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? ORDER BY id DESC LIMIT 1', [
    `Classe Dice ${stamp}`,
  ]);

  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");

  await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
    [cls.id, chapter.id, `Partie Dice ${stamp}`, admin.id],
  );
  const game = await queryOne('SELECT id FROM gl_games WHERE name = ? ORDER BY id DESC LIMIT 1', [
    `Partie Dice ${stamp}`,
  ]);
  gameId = Number(game.id);

  await execute(
    `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
     VALUES (?, 'Eq1', 'gnome', '#65a30d', NOW(), NOW())`,
    [gameId],
  );
  team1Id = Number(
    (await queryOne('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id ASC LIMIT 1', [gameId]))
      .id,
  );
  await execute(
    `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
     VALUES (?, 'Eq2', 'unicorn', '#a855f7', NOW(), NOW())`,
    [gameId],
  );
  team2Id = Number(
    (await queryOne('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id DESC LIMIT 1', [gameId]))
      .id,
  );

  await execute(
    `INSERT INTO gl_players (class_id, pseudo, password_hash, health_points, power_points, is_active, created_at, updated_at)
     VALUES (?, ?, 'hash', 5, 5, 1, NOW(), NOW())`,
    [cls.id, `dice-player-${stamp}`],
  );
  const player = await queryOne('SELECT id FROM gl_players WHERE pseudo = ? LIMIT 1', [
    `dice-player-${stamp}`,
  ]);
  playerId = Number(player.id);

  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())`,
    [gameId, team1Id, playerId],
  );

  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.game.manage', 'gl.event.emit', 'gl.mascot.position'],
    displayName: 'MJ Dice',
  });

  playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(playerId),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.mascot.position'],
    displayName: `dice-player-${stamp}`,
    teamId: team1Id,
    gameId,
  });
});

async function setTurnsEnabled(value) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.turns_enabled', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [value ? 'true' : 'false'],
  );
  invalidateGameplayCache();
}

test('parseDiceRollPayload valide un jet D6', () => {
  assert.deepStrictEqual(parseDiceRollPayload({ values: [3, 4], total: 7 }), {
    values: [3, 4],
    total: 7,
  });
  assert.strictEqual(parseDiceRollPayload({ values: [7], total: 7 }), null);
});

test('POST dice-roll refusé sans tour lancé', async () => {
  await setTurnsEnabled(true);
  await execute('UPDATE gl_games SET current_round_number = 0 WHERE id = ?', [gameId]);
  await execute('UPDATE gl_teams SET last_dice_round_number = 0 WHERE game_id = ?', [gameId]);

  await request(app)
    .post(`/api/gl/games/${gameId}/teams/${team1Id}/dice-roll`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ values: [2], total: 2 })
    .expect(409);
});

test('un lancer de dés consomme le tour, un nouveau tour le réarme', async () => {
  await setTurnsEnabled(true);
  await execute(
    'UPDATE gl_games SET current_round_number = 0, current_round_started_at = NULL WHERE id = ?',
    [gameId],
  );
  await execute('UPDATE gl_teams SET last_dice_round_number = 0 WHERE game_id = ?', [gameId]);

  await request(app)
    .post(`/api/gl/games/${gameId}/turn/next`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  const roll1 = await request(app)
    .post(`/api/gl/games/${gameId}/teams/${team1Id}/dice-roll`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ values: [4, 2], total: 6 })
    .expect(201);
  assert.strictEqual(roll1.body.eventType, 'dice_roll');

  await request(app)
    .post(`/api/gl/games/${gameId}/teams/${team1Id}/dice-roll`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ values: [1], total: 1 })
    .expect(409);

  const turn1 = await request(app)
    .get(`/api/gl/games/${gameId}/turn`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const t1 = turn1.body.teams.find((t) => t.teamId === team1Id);
  const t2 = turn1.body.teams.find((t) => t.teamId === team2Id);
  assert.strictEqual(t1.hasRolledDiceThisRound, true);
  assert.strictEqual(t2.hasRolledDiceThisRound, false);

  await request(app)
    .post(`/api/gl/games/${gameId}/turn/next`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  await request(app)
    .post(`/api/gl/games/${gameId}/teams/${team1Id}/dice-roll`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ values: [3], total: 3 })
    .expect(201);
});
