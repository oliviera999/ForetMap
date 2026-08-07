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
let playerToken = '';
let gameId = null;
let teamId = null;
let otherTeamId = null;
let markerId = null;
let playerAId = null;
let playerBId = null;
let outsiderId = null;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateGameplayCache();

  const admin = await createGlAdmin({
    email: `marker.authz.${stamp}@ecole.local`,
    displayName: 'MJ Marker Authz',
  });
  const cls = await createGlClass({
    name: `Classe Marker Authz ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });
  const otherCls = await createGlClass({
    name: `Classe Marker Authz Other ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });

  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, order_index, created_at, updated_at)
     VALUES (?, ?, 'foret', 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title), updated_at = NOW()`,
    [`ch-marker-authz-${stamp}`, `Chapitre marker authz ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `ch-marker-authz-${stamp}`,
  ]);

  await execute(
    `INSERT INTO gl_chapter_markers
      (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index)
     VALUES (?, 40, 40, 'event', 'Bonus coeur', 'Repere test', ?, 0)`,
    [
      chapter.id,
      JSON.stringify({
        version: 2,
        effects: { neutral: { deltaPv: 2, deltaGems: 0 } },
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
    teams: [
      { name: 'Equipe A', type: 'gnome' },
      { name: 'Equipe B', type: 'unicorn' },
    ],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);
  otherTeamId = Number(gameSeed.teams[1].id);

  const playerA = await createGlPlayer({
    classId: cls.id,
    pseudo: `ma-a-${stamp}`,
    healthPoints: 3,
    powerPoints: 3,
  });
  const playerB = await createGlPlayer({
    classId: cls.id,
    pseudo: `ma-b-${stamp}`,
    healthPoints: 3,
    powerPoints: 3,
  });
  const outsider = await createGlPlayer({
    classId: otherCls.id,
    pseudo: `ma-out-${stamp}`,
    healthPoints: 5,
    powerPoints: 5,
  });
  playerAId = Number(playerA.id);
  playerBId = Number(playerB.id);
  outsiderId = Number(outsider.id);
  await assignPlayerToGameTeam({ gameId, teamId, playerId: playerAId });
  await assignPlayerToGameTeam({ gameId, teamId: otherTeamId, playerId: playerBId });

  await execute('UPDATE gl_games SET status = ?, current_team_id = ? WHERE id = ?', [
    'live',
    teamId,
    gameId,
  ]);

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.mascot.position', 'gl.event.emit'],
    playerId: playerAId,
    playerPermissions: ['gl.read', 'gl.action.request', 'gl.mascot.position'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('joueur : present-arrival refuse si l’équipe n’est pas sur le repère', async () => {
  await execute(
    'UPDATE gl_teams SET position_marker_id = NULL, position_x_pct = NULL, position_y_pct = NULL WHERE id = ?',
    [teamId],
  );

  const before = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [playerAId]);

  await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({})
    .expect(409);

  const after = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [playerAId]);
  assert.strictEqual(Number(after.health_points), Number(before.health_points));
});

test('joueur : ignore playerIds hors équipe et n’applique que si positionnée', async () => {
  await execute(
    'UPDATE gl_teams SET position_marker_id = ?, position_x_pct = 40, position_y_pct = 40 WHERE id = ?',
    [markerId, teamId],
  );
  await execute('UPDATE gl_players SET health_points = 3, power_points = 3 WHERE id IN (?, ?)', [
    playerAId,
    playerBId,
  ]);
  await execute('UPDATE gl_players SET health_points = 5, power_points = 5 WHERE id = ?', [
    outsiderId,
  ]);
  await execute('DELETE FROM gl_game_events WHERE game_id = ? AND event_type = ?', [
    gameId,
    'marker_effect',
  ]);

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ playerIds: [outsiderId, playerBId, playerAId] })
    .expect(200);

  assert.strictEqual(res.body?.vitality?.applied, true);
  assert.strictEqual(res.body?.vitality?.target, 'team');

  const playerA = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [playerAId]);
  const playerB = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [playerBId]);
  const outsider = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [
    outsiderId,
  ]);
  // Équipe A uniquement (playerA) ; playerB est sur l'autre équipe ; outsider hors partie.
  assert.strictEqual(Number(playerA.health_points), 5);
  assert.strictEqual(Number(playerB.health_points), 3);
  assert.strictEqual(Number(outsider.health_points), 5);
});

test('MJ apply-effects : refuse playerIds hors roster de l’équipe', async () => {
  await execute('DELETE FROM gl_game_events WHERE game_id = ? AND event_type = ?', [
    gameId,
    'marker_effect',
  ]);
  await execute('UPDATE gl_players SET health_points = 5 WHERE id = ?', [outsiderId]);

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/markers/${markerId}/apply-effects`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId, playerIds: [outsiderId] })
    .expect(400);

  assert.match(String(res.body?.error || ''), /n’appartiennent pas|appartiennent pas/i);

  const outsider = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [
    outsiderId,
  ]);
  assert.strictEqual(Number(outsider.health_points), 5);
});
