'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const {
  invalidateGameplayCache,
} = require('../lib/glSettings');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');
const {
  applyVitalityChangeEvent,
  applySpellCastEvent,
  applyMarketTrade,
  emptyVitalityFlows,
} = require('../lib/glPlayerStats');

const stamp = Date.now();
let classId = null;
let gameId = null;
let playerAId = null;
let playerBId = null;
let playerToken = '';
let mjToken = '';

async function setVitalityEnabled(enabled) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [JSON.stringify(!!enabled)]
  );
  invalidateGameplayCache();
}

before(async () => {
  await initSchema();
  await setVitalityEnabled(true);

  const admin = await createGlAdmin({
    email: `stats.mj.${stamp}@ecole.local`,
    displayName: 'MJ Stats',
  });
  const cls = await createGlClass({
    name: `Classe Stats ${stamp}`,
    adminId: admin.id,
  });
  classId = Number(cls.id);

  const playerA = await createGlPlayer({
    classId,
    pseudo: `stats-a-${stamp}`,
    healthPoints: 5,
    powerPoints: 4,
  });
  const playerB = await createGlPlayer({
    classId,
    pseudo: `stats-b-${stamp}`,
    healthPoints: 3,
    powerPoints: 3,
  });
  playerAId = Number(playerA.id);
  playerBId = Number(playerB.id);

  const { chapter } = await createGlChapterWithMarker({ slug: `stats-ch-${stamp}` });
  const { game, teams } = await createGlGameWithTeams({
    classId,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [{ name: 'Equipe A' }],
  });
  gameId = Number(game.id);
  await assignPlayerToGameTeam({ gameId, teamId: teams[0].id, playerId: playerAId });
  await assignPlayerToGameTeam({ gameId, teamId: teams[0].id, playerId: playerBId });

  await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, ?, 'mj', ?, 'vitality_change', ?, NOW())`,
    [
      gameId,
      teams[0].id,
      String(admin.id),
      JSON.stringify({
        healthDelta: 2,
        powerDelta: -1,
        results: [{ playerId: playerAId, health: 7, power: 3 }],
      }),
    ]
  );

  await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, ?, 'team', ?, 'spell_cast', ?, NOW())`,
    [
      gameId,
      teams[0].id,
      String(playerAId),
      JSON.stringify({
        contributions: [{ playerId: playerAId, gems: 1, hearts: 0 }],
      }),
    ]
  );

  await execute(
    `INSERT INTO gl_market_trades
      (class_id, player_low_id, player_high_id, initiator_player_id, status, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, 'completed', NOW(), NOW(), NOW())`,
    [classId, playerAId, playerBId, playerAId]
  );
  const trade = await queryOne(
    'SELECT id FROM gl_market_trades WHERE class_id = ? ORDER BY id DESC LIMIT 1',
    [classId]
  );
  await execute(
    `INSERT INTO gl_market_trade_sides (trade_id, player_id, offer_health, offer_power, accepted)
     VALUES (?, ?, 1, 0, 1), (?, ?, 0, 1, 1)`,
    [trade.id, playerAId, trade.id, playerBId]
  );

  await execute(
    `INSERT INTO gl_learning_acknowledgements
      (reader_user_type, reader_user_id, target_type, target_code, acknowledged_at)
     VALUES ('gl_player', ?, 'species', 'SP001', NOW()),
            ('gl_player', ?, 'glossary', 'GL0001', NOW())`,
    [String(playerAId), String(playerAId)]
  );

  const tokens = await signTokens({
    adminId: admin.id,
    playerId: playerAId,
    playerPseudo: playerA.pseudo,
    adminPermissions: [
      'gl.read',
      'gl.players.manage',
      'gl.game.manage',
    ],
  });
  mjToken = tokens.adminToken;
  playerToken = tokens.playerToken;
});

test('agrégation pure : vitality_change, spell_cast, marché', () => {
  const flows = {};
  applyVitalityChangeEvent(flows, {
    healthDelta: 2,
    powerDelta: -1,
    results: [{ playerId: playerAId }],
  });
  applySpellCastEvent(flows, {
    contributions: [{ playerId: playerAId, gems: 1, hearts: 0 }],
  });
  applyMarketTrade(
    flows,
    { player_low_id: playerAId, player_high_id: playerBId },
    [
      { player_id: playerAId, offer_health: 1, offer_power: 0 },
      { player_id: playerBId, offer_health: 0, offer_power: 1 },
    ]
  );
  assert.strictEqual(flows[playerAId].heartsGained, 2);
  assert.strictEqual(flows[playerAId].heartsLost, 1);
  assert.strictEqual(flows[playerAId].gemsGained, 1);
  assert.strictEqual(flows[playerAId].gemsLost, 2);
  assert.strictEqual(flows[playerBId].heartsGained, 1);
  assert.strictEqual(flows[playerBId].gemsLost, 1);
});

test('emptyVitalityFlows retourne des zéros', () => {
  const f = emptyVitalityFlows();
  assert.deepStrictEqual(f, {
    heartsGained: 0,
    heartsLost: 0,
    gemsGained: 0,
    gemsLost: 0,
  });
});

test('GET /api/gl/stats/me — joueur lit ses stats', async () => {
  const res = await request(app)
    .get('/api/gl/stats/me')
    .set('Authorization', `Bearer ${playerToken}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.id, playerAId);
  assert.strictEqual(res.body.stats.hearts, 5);
  assert.strictEqual(res.body.stats.gems, 4);
  assert.strictEqual(res.body.stats.hearts_gained, 2);
  assert.strictEqual(res.body.stats.hearts_lost, 1);
  assert.strictEqual(res.body.stats.gems_lost, 2);
  assert.strictEqual(res.body.stats.species_learned, 1);
  assert.strictEqual(res.body.stats.glossary_learned, 1);
  assert.strictEqual(res.body.vitalityEnabled, true);
});

test('GET /api/gl/stats/class — joueur refusé', async () => {
  const res = await request(app)
    .get(`/api/gl/stats/class?class_id=${classId}`)
    .set('Authorization', `Bearer ${playerToken}`);
  assert.strictEqual(res.status, 403);
});

test('GET /api/gl/stats/class — MJ agrège la classe', async () => {
  const res = await request(app)
    .get(`/api/gl/stats/class?class_id=${classId}`)
    .set('Authorization', `Bearer ${mjToken}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.classId, classId);
  assert.ok(Array.isArray(res.body.players));
  assert.ok(res.body.players.length >= 2);
  const playerA = res.body.players.find((p) => p.id === playerAId);
  assert.ok(playerA);
  assert.strictEqual(playerA.stats.hearts_gained, 2);
  assert.strictEqual(playerA.stats.species_learned, 1);
  assert.ok(res.body.classTotals);
  assert.strictEqual(res.body.classTotals.active_players, res.body.players.length);
});

test('GET /api/gl/stats/me — vitalité désactivée masque le bloc', async () => {
  await setVitalityEnabled(false);
  const res = await request(app)
    .get('/api/gl/stats/me')
    .set('Authorization', `Bearer ${playerToken}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.vitalityEnabled, false);
  assert.strictEqual(res.body.stats.hearts, undefined);
  assert.strictEqual(res.body.stats.species_learned, 1);
  await setVitalityEnabled(true);
});
