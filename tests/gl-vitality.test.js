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
  createGlPlayer,
  signTokens,
} = require('./helpers/glFixtures');

let adminToken = '';
let gameId = null;
let teamId = null;
let playerAId = null;
let playerBId = null;
const stamp = Date.now();
const adminEmail = `vitality.mj.${stamp}@ecole.local`;
const className = `Classe Vitalité ${stamp}`;
const gameName = `Partie Vitalité ${stamp}`;

async function setVitalityEnabled(enabled) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [JSON.stringify(!!enabled)],
  );
  invalidateGameplayCache();
}

before(async () => {
  await initSchema();
  invalidateGameplayCache();

  const admin = await createGlAdmin({ email: adminEmail, displayName: 'MJ Vitalité' });
  const cls = await createGlClass({ name: className, school: 'Ecole Test', adminId: admin.id });
  const chapter = await queryOne("SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1");
  const gameSeed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    name: gameName,
    createdBy: admin.id,
    status: 'live',
    teams: [{ name: 'Équipe A', type: 'gnome', color: '#65a30d' }],
  });
  gameId = Number(gameSeed.game.id);
  teamId = Number(gameSeed.teams[0].id);

  const playerA = await createGlPlayer({
    classId: cls.id,
    pseudo: `vitality-a-${stamp}`,
    password: '1234',
  });
  const playerB = await createGlPlayer({
    classId: cls.id,
    pseudo: `vitality-b-${stamp}`,
    password: '1234',
  });
  playerAId = Number(playerA.id);
  playerBId = Number(playerB.id);

  await execute(
    `INSERT IGNORE INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW()), (?, ?, ?, NOW())`,
    [gameId, teamId, playerAId, gameId, teamId, playerBId],
  );

  await execute('UPDATE gl_players SET health_points = 3, power_points = 3 WHERE id IN (?, ?)', [
    playerAId,
    playerBId,
  ]);

  const tokens = await signTokens({
    adminId: admin.id,
    adminDisplayName: 'MJ Vitalité',
    adminPermissions: [
      'gl.read',
      'gl.game.manage',
      'gl.event.emit',
      'gl.players.manage',
      'gl.settings.manage',
    ],
    playerId: playerAId,
    playerPseudo: playerA.pseudo,
    playerPermissions: ['gl.read'],
    teamId,
  });
  adminToken = tokens.adminToken;
});

test('POST vitality/player refusé si module désactivé', async () => {
  await setVitalityEnabled(false);
  await request(app)
    .post(`/api/gl/games/${gameId}/vitality/player`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ playerId: playerAId, healthDelta: 1 })
    .expect(409);
});

test('delta joueur et plancher à 0', async () => {
  await setVitalityEnabled(true);
  await execute('UPDATE gl_players SET health_points = 1, power_points = 2 WHERE id = ?', [
    playerAId,
  ]);

  await request(app)
    .post(`/api/gl/games/${gameId}/vitality/player`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ playerId: playerAId, healthDelta: 2, powerDelta: 1 })
    .expect(200);

  const row = await queryOne('SELECT health_points, power_points FROM gl_players WHERE id = ?', [
    playerAId,
  ]);
  assert.strictEqual(Number(row.health_points), 3);
  assert.strictEqual(Number(row.power_points), 3);

  await request(app)
    .post(`/api/gl/games/${gameId}/vitality/player`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ playerId: playerAId, healthDelta: -10 })
    .expect(200);

  const rowFloor = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [playerAId]);
  assert.strictEqual(Number(rowFloor.health_points), 0);
});

test('delta équipe applique à tous les membres', async () => {
  await setVitalityEnabled(true);
  await execute('UPDATE gl_players SET health_points = 3, power_points = 3 WHERE id IN (?, ?)', [
    playerAId,
    playerBId,
  ]);

  const res = await request(app)
    .post(`/api/gl/games/${gameId}/vitality/team`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ teamId, powerDelta: 2 })
    .expect(200);

  assert.strictEqual(res.body.results.length, 2);
  const rowA = await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerAId]);
  const rowB = await queryOne('SELECT power_points FROM gl_players WHERE id = ?', [playerBId]);
  assert.strictEqual(Number(rowA.power_points), 5);
  assert.strictEqual(Number(rowB.power_points), 5);
});

test('GET game state et roster exposent la vitalité', async () => {
  await setVitalityEnabled(true);
  await execute('UPDATE gl_players SET health_points = 4, power_points = 5 WHERE id = ?', [
    playerAId,
  ]);

  const gameRes = await request(app)
    .get(`/api/gl/games/${gameId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  assert.strictEqual(gameRes.body.vitality?.enabled, true);
  assert.strictEqual(gameRes.body.vitality.byPlayerId[String(playerAId)].health, 4);
  assert.strictEqual(gameRes.body.vitality.byPlayerId[String(playerAId)].power, 5);

  const rosterRes = await request(app)
    .get(`/api/gl/games/${gameId}/roster`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);

  const entry = rosterRes.body.find((row) => Number(row.id) === playerAId);
  assert.ok(entry);
  assert.strictEqual(entry.healthPoints, 4);
  assert.strictEqual(entry.powerPoints, 5);
});

test('nouveau joueur reçoit les défauts configurés', async () => {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.default_health_points', '7', NOW()), ('gameplay.default_power_points', '8', NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
  );
  invalidateGameplayCache();

  const pseudo = `vitality-new-${stamp}`;
  const createRes = await request(app)
    .post('/api/gl/admin/players')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      classId: (await queryOne('SELECT class_id FROM gl_games WHERE id = ?', [gameId])).class_id,
      firstName: 'Nouveau',
      lastName: 'Joueur',
      pseudo,
      password: '1234',
    })
    .expect(201);

  const created = await queryOne(
    'SELECT health_points, power_points FROM gl_players WHERE id = ?',
    [createRes.body.id],
  );
  assert.strictEqual(Number(created.health_points), 7);
  assert.strictEqual(Number(created.power_points), 8);

  await execute(
    `UPDATE gl_settings SET value_json = '3', updated_at = NOW()
      WHERE \`key\` IN ('gameplay.default_health_points', 'gameplay.default_power_points')`,
  );
  invalidateGameplayCache();
});
