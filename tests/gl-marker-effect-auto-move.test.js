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
  createGlGameWithTeams,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();
let adminToken = '';
let gameId = null;
let teamId = null;
let markerAId = null;
let markerBId = null;
let markerCId = null;
let markerDId = null;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.marker_effect_auto_move_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateGameplayCache();

  const admin = await createGlAdmin({
    email: `marker.auto.${stamp}@ecole.local`,
    displayName: 'MJ Auto Move',
  });
  const cls = await createGlClass({
    name: `Classe Auto Move ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });

  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, order_index, created_at, updated_at)
     VALUES (?, ?, 'foret', 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title), updated_at = NOW()`,
    [`ch-auto-move-${stamp}`, `Chapitre auto move ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `ch-auto-move-${stamp}`,
  ]);

  const markers = [
    { label: 'Case A', order: 0, x: 10, y: 10, move: 0 },
    { label: 'Case B', order: 1, x: 20, y: 20, move: 2 },
    { label: 'Case C', order: 2, x: 30, y: 30, move: 0 },
    { label: 'Case D', order: 3, x: 40, y: 40, move: 0 },
  ];
  const markerIds = [];
  for (const spec of markers) {
    await execute(
      `INSERT INTO gl_chapter_markers
        (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index)
       VALUES (?, ?, ?, 'event', ?, 'repere', ?, ?)`,
      [
        chapter.id,
        spec.x,
        spec.y,
        spec.label,
        JSON.stringify({
          version: 2,
          effects: { neutral: { deltaMove: spec.move } },
        }),
        spec.order,
      ],
    );
    const row = await queryOne(
      'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? AND label = ? LIMIT 1',
      [chapter.id, spec.label],
    );
    markerIds.push(Number(row.id));
  }
  [markerAId, markerBId, markerCId, markerDId] = markerIds;

  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Auto', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);

  await execute(
    `UPDATE gl_games
        SET status = 'live',
            board_movement_mode = 'numbered_path',
            board_path_start_index = 0
      WHERE id = ?`,
    [gameId],
  );
  await execute(
    `UPDATE gl_teams
        SET position_marker_id = ?, position_x_pct = 10, position_y_pct = 10
      WHERE id = ?`,
    [markerBId, teamId],
  );

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.mascot.position', 'gl.event.emit'],
  });
  adminToken = tokens.adminToken;
});

test('present-arrival applique le déplacement auto sans effet case finale', async () => {
  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerBId}/present-arrival`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);

  assert.strictEqual(res.body?.autoMove?.applied, true);
  assert.strictEqual(res.body.autoMove.steps, 2);
  assert.strictEqual(res.body.autoMove.targetMarkerId, markerDId);

  const team = await queryOne(
    'SELECT position_marker_id FROM gl_teams WHERE id = ? AND game_id = ?',
    [teamId, gameId],
  );
  assert.strictEqual(Number(team.position_marker_id), markerDId);

  const moveEvt = await queryOne(
    `SELECT payload_json FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type = 'move'
      ORDER BY id DESC LIMIT 1`,
    [gameId, teamId],
  );
  const movePayload = JSON.parse(moveEvt.payload_json);
  assert.strictEqual(movePayload.skipDestinationEffects, true);
  assert.strictEqual(movePayload.source, 'marker_effect');
  assert.strictEqual(Number(movePayload.markerId), markerDId);
});

test('auto move désactivé : pas de déplacement', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.marker_effect_auto_move_enabled', 'false', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateGameplayCache();

  await execute(
    `UPDATE gl_teams
        SET position_marker_id = ?, position_x_pct = 20, position_y_pct = 20
      WHERE id = ?`,
    [markerBId, teamId],
  );

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerBId}/present-arrival`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId })
    .expect(200);

  assert.strictEqual(res.body?.autoMove, null);

  const team = await queryOne(
    'SELECT position_marker_id FROM gl_teams WHERE id = ? AND game_id = ?',
    [teamId, gameId],
  );
  assert.strictEqual(Number(team.position_marker_id), markerBId);
});
