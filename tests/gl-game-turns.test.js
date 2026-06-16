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
    permissions: ['gl.read', 'gl.game.manage', 'gl.settings.manage'],
    displayName: 'MJ Turns',
  });
});

test('POST /turn/next refusé quand turns_enabled = false', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.turns_enabled', 'false', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateGameplayCache();
  await request(app)
    .post(`/api/gl/games/${gameId}/turn/next`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(409);
});

test('POST /turn/next cycle bien les équipes quand activé', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.turns_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = 'true', updated_at = NOW()`,
  );
  invalidateGameplayCache();

  await execute('UPDATE gl_games SET current_team_id = NULL WHERE id = ?', [gameId]);

  const res1 = await request(app)
    .post(`/api/gl/games/${gameId}/turn/next`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res1.body.currentTeamId, team1Id);

  const res2 = await request(app)
    .post(`/api/gl/games/${gameId}/turn/next`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res2.body.currentTeamId, team2Id);

  const res3 = await request(app)
    .post(`/api/gl/games/${gameId}/turn/next`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.strictEqual(res3.body.currentTeamId, team1Id);

  // Désactive le toggle pour ne pas polluer les autres tests.
  await execute(
    `UPDATE gl_settings SET value_json = 'false', updated_at = NOW()
      WHERE \`key\` = 'gameplay.turns_enabled'`,
  );
  invalidateGameplayCache();
});
