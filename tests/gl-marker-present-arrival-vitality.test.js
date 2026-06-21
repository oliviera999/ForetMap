'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { invalidateGameplayCache } = require('../lib/glSettings');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();
let adminToken = '';
let gameId = null;
let teamId = null;
let markerId = null;
let playerAId = null;
let playerBId = null;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateGameplayCache();

  const admin = await createGlAdmin({
    email: `marker.vit.${stamp}@ecole.local`,
    displayName: 'MJ Marker Vit',
  });
  const cls = await createGlClass({
    name: `Classe Marker Vit ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });

  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, order_index, created_at, updated_at)
     VALUES (?, ?, 'foret', 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title), updated_at = NOW()`,
    [`ch-marker-vit-${stamp}`, `Chapitre marker vit ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `ch-marker-vit-${stamp}`,
  ]);

  await execute(
    `INSERT INTO gl_chapter_markers
      (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index)
     VALUES (?, 40, 40, 'event', 'Bonus coeur', 'Repere test', ?, 0)`,
    [
      chapter.id,
      JSON.stringify({
        version: 2,
        effects: { neutral: { deltaPv: 1, deltaGems: -1 } },
      }),
    ],
  );
  const marker = await queryOne(
    'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
    [chapter.id],
  );
  markerId = Number(marker.id);

  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe MV', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);

  const playerA = await createGlPlayer({
    classId: cls.id,
    pseudo: `mv-a-${stamp}`,
    healthPoints: 3,
    powerPoints: 3,
  });
  const playerB = await createGlPlayer({
    classId: cls.id,
    pseudo: `mv-b-${stamp}`,
    healthPoints: 3,
    powerPoints: 3,
  });
  playerAId = Number(playerA.id);
  playerBId = Number(playerB.id);
  await assignPlayerToGameTeam({ gameId, teamId, playerId: playerAId });
  await assignPlayerToGameTeam({ gameId, teamId, playerId: playerBId });

  await execute('UPDATE gl_games SET status = ?, current_team_id = ? WHERE id = ?', [
    'live',
    teamId,
    gameId,
  ]);

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.mascot.position', 'gl.event.emit'],
  });
  adminToken = tokens.adminToken;
});

test('present-arrival applique gemmes et coeurs a toute l equipe', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);

  assert.strictEqual(res.body?.vitality?.applied, true);
  assert.strictEqual(res.body?.vitality?.healthDelta, 1);
  assert.strictEqual(res.body?.vitality?.powerDelta, -1);
  assert.strictEqual(res.body?.vitality?.target, 'team');
  assert.strictEqual(res.body?.vitality?.results?.length, 2);

  const playerA = await queryOne(
    'SELECT health_points, power_points FROM gl_players WHERE id = ?',
    [playerAId],
  );
  assert.strictEqual(Number(playerA.health_points), 4);
  assert.strictEqual(Number(playerA.power_points), 2);

  const effectEvt = await queryOne(
    `SELECT id FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type = 'marker_effect'
      ORDER BY id DESC LIMIT 1`,
    [gameId, teamId],
  );
  assert.ok(effectEvt?.id);
});

test('present-arrival ne reapplique pas les effets vitalite', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);

  assert.strictEqual(res.body?.vitality?.applied, false);
  assert.strictEqual(res.body?.vitality?.alreadyApplied, true);

  const playerA = await queryOne(
    'SELECT health_points, power_points FROM gl_players WHERE id = ?',
    [playerAId],
  );
  assert.strictEqual(Number(playerA.health_points), 4);
  assert.strictEqual(Number(playerA.power_points), 2);
});

test('apply-effects refuse si deja applique', async () => {
  await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/apply-effects`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(409);
});
