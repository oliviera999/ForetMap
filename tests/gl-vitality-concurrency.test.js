'use strict';

/**
 * Courses vitalité / dés : deux clients simultanés ne doivent pas double-appliquer
 * un effet one-shot (repère, zone feuillet) ni enregistrer deux jets dans le même tour.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
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
let markerId = null;
let playerAId = null;
let playerBId = null;

async function setGameplayFlags({ vitality = true, turns = true } = {}) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', ?, NOW()),
            ('gameplay.turns_enabled', ?, NOW()),
            ('gameplay.lore_gemme_costs_enabled', 'true', NOW()),
            ('gameplay.lore_heart_rewards_enabled', 'true', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [JSON.stringify(!!vitality), JSON.stringify(!!turns)],
  );
  invalidateGameplayCache();
}

before(async () => {
  await initSchema();
  await setGameplayFlags({ vitality: true, turns: true });

  const admin = await createGlAdmin({
    email: `vit.conc.${stamp}@ecole.local`,
    displayName: 'MJ Vitalité Conc',
  });
  const cls = await createGlClass({
    name: `Classe VitConc ${stamp}`,
    school: 'Ecole',
    adminId: admin.id,
  });

  await execute(
    `INSERT INTO gl_chapters (slug, title, biome, plateau_number, order_index, created_at, updated_at)
     VALUES (?, ?, 'foret', 1, 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE title = VALUES(title), plateau_number = 1, updated_at = NOW()`,
    [`ch-vit-conc-${stamp}`, `Chapitre vit conc ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `ch-vit-conc-${stamp}`,
  ]);

  await execute(
    `INSERT INTO gl_chapter_markers
      (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index)
     VALUES (?, 40, 40, 'event', 'Bonus concurrent', 'Repere race', ?, 0)`,
    [
      chapter.id,
      JSON.stringify({
        version: 2,
        effects: { neutral: { deltaPv: 1, deltaGems: -1 } },
      }),
    ],
  );
  markerId = Number(
    (
      await queryOne(
        'SELECT id FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
        [chapter.id],
      )
    ).id,
  );

  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe Conc', type: 'gnome' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);

  const playerA = await createGlPlayer({
    classId: cls.id,
    pseudo: `vitc-a-${stamp}`,
    healthPoints: 3,
    powerPoints: 3,
  });
  const playerB = await createGlPlayer({
    classId: cls.id,
    pseudo: `vitc-b-${stamp}`,
    healthPoints: 3,
    powerPoints: 3,
  });
  playerAId = Number(playerA.id);
  playerBId = Number(playerB.id);
  await assignPlayerToGameTeam({ gameId, teamId, playerId: playerAId });
  await assignPlayerToGameTeam({ gameId, teamId, playerId: playerBId });

  await execute(
    'UPDATE gl_games SET status = ?, current_team_id = ?, current_round_number = 1 WHERE id = ?',
    ['live', teamId, gameId],
  );

  const tokens = await signTokens({
    adminId: admin.id,
    adminPermissions: ['gl.read', 'gl.game.manage', 'gl.mascot.position', 'gl.event.emit'],
    playerId: playerAId,
    playerPermissions: ['gl.read', 'gl.action.request'],
  });
  adminToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('present-arrival concurrent : vitalité appliquée une seule fois', async () => {
  await execute('UPDATE gl_players SET health_points = 3, power_points = 3 WHERE id IN (?, ?)', [
    playerAId,
    playerBId,
  ]);
  await execute(
    `DELETE FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type IN ('marker_effect', 'marker_arrival')`,
    [gameId, teamId],
  );

  const [res1, res2] = await Promise.all([
    request(app)
      .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teamId }),
    request(app)
      .post(`/api/gl/games/${gameId}/markers/${markerId}/present-arrival`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teamId }),
  ]);

  const statuses = [res1.status, res2.status].sort();
  assert.ok(
    statuses.every((s) => s === 200),
    `attendus 200/200, obtenus ${statuses.join('/')}`,
  );
  const appliedCount = [res1.body, res2.body].filter((b) => b?.vitality?.applied === true).length;
  const skippedCount = [res1.body, res2.body].filter(
    (b) => b?.vitality?.alreadyApplied === true,
  ).length;
  assert.strictEqual(appliedCount, 1, 'un seul client doit appliquer la vitalité');
  assert.strictEqual(skippedCount, 1, 'l’autre client doit voir alreadyApplied');

  const playerA = await queryOne(
    'SELECT health_points, power_points FROM gl_players WHERE id = ?',
    [playerAId],
  );
  assert.strictEqual(Number(playerA.health_points), 4);
  assert.strictEqual(Number(playerA.power_points), 2);

  const effects = await queryAll(
    `SELECT id FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type = 'marker_effect'`,
    [gameId, teamId],
  );
  assert.strictEqual(effects.length, 1);
});

test('apply-effects concurrent : un seul succès, pas de double débit', async () => {
  // Nouveau repère pour isoler du test précédent.
  await execute(
    `INSERT INTO gl_chapter_markers
      (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index)
     VALUES ((SELECT chapter_id FROM gl_games WHERE id = ?), 50, 50, 'event', 'Bonus apply', 'Race apply', ?, 1)`,
    [
      gameId,
      JSON.stringify({
        version: 2,
        effects: { neutral: { deltaPv: 2, deltaGems: -2 } },
      }),
    ],
  );
  const marker = await queryOne(
    `SELECT id FROM gl_chapter_markers
      WHERE label = 'Bonus apply' ORDER BY id DESC LIMIT 1`,
  );
  const applyMarkerId = Number(marker.id);

  await execute('UPDATE gl_players SET health_points = 5, power_points = 5 WHERE id IN (?, ?)', [
    playerAId,
    playerBId,
  ]);

  const [res1, res2] = await Promise.all([
    request(app)
      .post(`/api/gl/games/${gameId}/markers/${applyMarkerId}/apply-effects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teamId }),
    request(app)
      .post(`/api/gl/games/${gameId}/markers/${applyMarkerId}/apply-effects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teamId }),
  ]);

  const statuses = [res1.status, res2.status].sort((a, b) => a - b);
  assert.deepStrictEqual(statuses, [200, 409]);

  const playerA = await queryOne(
    'SELECT health_points, power_points FROM gl_players WHERE id = ?',
    [playerAId],
  );
  assert.strictEqual(Number(playerA.health_points), 7);
  assert.strictEqual(Number(playerA.power_points), 3);
});

test('feuillet-zones present concurrent : une seule présentation + un seul débit', async () => {
  const zoneId = 'zf-p1-01';
  await execute('UPDATE gl_players SET health_points = 3, power_points = 3 WHERE id IN (?, ?)', [
    playerAId,
    playerBId,
  ]);
  await execute(
    `DELETE FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type = 'feuillet_zone_presented'`,
    [gameId, teamId],
  );

  const [res1, res2] = await Promise.all([
    request(app)
      .post(`/api/gl/games/${gameId}/feuillet-zones/${zoneId}/present`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teamId }),
    request(app)
      .post(`/api/gl/games/${gameId}/feuillet-zones/${zoneId}/present`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teamId }),
  ]);

  const statuses = [res1.status, res2.status].sort((a, b) => a - b);
  assert.deepStrictEqual(
    statuses,
    [200, 409],
    `attendus 200/409, obtenus ${statuses.join('/')} body=${JSON.stringify([
      res1.body,
      res2.body,
    ])}`,
  );

  const events = await queryAll(
    `SELECT id FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type = 'feuillet_zone_presented'`,
    [gameId, teamId],
  );
  assert.strictEqual(events.length, 1);

  // Catalogue zf-p1-01 : gain_coeur=1, cout_gemme=1 → une seule application depuis 3/3.
  const playerA = await queryOne(
    'SELECT health_points, power_points FROM gl_players WHERE id = ?',
    [playerAId],
  );
  assert.strictEqual(Number(playerA.health_points), 4);
  assert.strictEqual(Number(playerA.power_points), 2);
});

test('dice-roll concurrent : un seul jet accepté pour le tour', async () => {
  await execute('UPDATE gl_teams SET last_dice_round_number = 0 WHERE id = ? AND game_id = ?', [
    teamId,
    gameId,
  ]);
  await execute(
    `DELETE FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'dice_roll'`,
    [gameId, teamId],
  );

  const body = { values: [3, 4], total: 7 };
  const [res1, res2] = await Promise.all([
    request(app)
      .post(`/api/gl/games/${gameId}/teams/${teamId}/dice-roll`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send(body),
    request(app)
      .post(`/api/gl/games/${gameId}/teams/${teamId}/dice-roll`)
      .set('Authorization', `Bearer ${playerToken}`)
      .send(body),
  ]);

  const statuses = [res1.status, res2.status].sort((a, b) => a - b);
  assert.deepStrictEqual(statuses, [201, 409]);

  const rolls = await queryAll(
    `SELECT id FROM gl_game_events
      WHERE game_id = ? AND team_id = ? AND event_type = 'dice_roll'`,
    [gameId, teamId],
  );
  assert.strictEqual(rolls.length, 1);

  const team = await queryOne(
    'SELECT last_dice_round_number FROM gl_teams WHERE id = ? AND game_id = ?',
    [teamId, gameId],
  );
  assert.strictEqual(Number(team.last_dice_round_number), 1);
});
