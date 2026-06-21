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
let gameId = null;
let team1Id = null;
let team2Id = null;
const stamp = Date.now();
const adminEmail = `turns.mj.${stamp}@ecole.local`;
const className = `Classe Turns ${stamp}`;
const gameName = `Partie Turns ${stamp}`;

before(async () => {
  await initSchema();
  invalidateGameplayCache();

  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, 'MJ Turns', 'admin', 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_active = 1, updated_at = NOW()`,
    [adminEmail],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, 'Ecole Turns', ?, 1, NOW(), NOW())`,
    [className, admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes WHERE name = ? ORDER BY id DESC LIMIT 1', [
    className,
  ]);
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
    [cls.id, chapter.id, gameName, admin.id],
  );
  const game = await queryOne('SELECT id FROM gl_games WHERE name = ? ORDER BY id DESC LIMIT 1', [
    gameName,
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

  adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: ['gl.read', 'gl.game.manage', 'gl.event.emit', 'gl.settings.manage'],
    displayName: 'MJ Turns',
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

test('POST /turn/next refusé quand turns_enabled = false', async () => {
  await setTurnsEnabled(false);
  await request(app)
    .post(`/api/gl/games/${gameId}/turn/next`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(409);
});

test('POST /turn/next incrémente le numéro de tour (mode classique)', async () => {
  await setTurnsEnabled(true);
  await execute(
    'UPDATE gl_games SET current_round_number = 0, current_round_started_at = NULL WHERE id = ?',
    [gameId],
  );

  const res1 = await request(app)
    .post(`/api/gl/games/${gameId}/turn/next`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res1.body.roundNumber, 1);
  assert.strictEqual(res1.body.event.eventType, 'round_start');

  const res2 = await request(app)
    .post(`/api/gl/games/${gameId}/turn/start`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res2.body.roundNumber, 2);
});

test('un déplacement consomme le tour, un nouveau tour le réarme', async () => {
  await setTurnsEnabled(true);
  await execute(
    'UPDATE gl_games SET current_round_number = 0, current_round_started_at = NULL WHERE id = ?',
    [gameId],
  );
  await execute('UPDATE gl_teams SET last_move_round_number = 0 WHERE game_id = ?', [gameId]);

  // Tour 1
  await request(app)
    .post(`/api/gl/games/${gameId}/turn/next`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  // Déplacement MJ de l'équipe 1 (libre)
  await request(app)
    .post(`/api/gl/games/${gameId}/events`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId: team1Id, eventType: 'move', payload: { xp: 40, yp: 60 } })
    .expect(201);

  const turn1 = await request(app)
    .get(`/api/gl/games/${gameId}/turn`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const t1 = turn1.body.teams.find((t) => t.teamId === team1Id);
  const t2 = turn1.body.teams.find((t) => t.teamId === team2Id);
  assert.strictEqual(turn1.body.roundNumber, 1);
  assert.strictEqual(t1.hasMovedThisRound, true);
  assert.strictEqual(t2.hasMovedThisRound, false);

  // Tour 2 : l'équipe 1 peut de nouveau bouger
  await request(app)
    .post(`/api/gl/games/${gameId}/turn/next`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  const turn2 = await request(app)
    .get(`/api/gl/games/${gameId}/turn`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(turn2.body.roundNumber, 2);
  assert.strictEqual(turn2.body.teams.find((t) => t.teamId === team1Id).hasMovedThisRound, false);

  await setTurnsEnabled(false);
});
