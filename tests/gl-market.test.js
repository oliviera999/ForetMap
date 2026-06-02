'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const {
  invalidateGameplayCache,
  invalidateModulesCache,
} = require('../lib/glSettings');
const { signAuthToken } = require('../middleware/requireTeacher');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
} = require('./helpers/glFixtures');

let tokenA = '';
let tokenB = '';
let tokenC = '';
let playerAId = null;
let playerBId = null;
let playerCId = null;
let classId = null;

const stamp = Date.now();

async function setVitalityAndMarket(enabled) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.vitality_enabled', ?, NOW()),
            ('modules.market_enabled', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [JSON.stringify(!!enabled), JSON.stringify(!!enabled)]
  );
  invalidateGameplayCache();
  invalidateModulesCache();
}

before(async () => {
  await initSchema();
  await setVitalityAndMarket(true);

  const admin = await createGlAdmin({
    email: `market.mj.${stamp}@ecole.local`,
    displayName: 'MJ Market',
  });
  const cls = await createGlClass({
    name: `Classe Market ${stamp}`,
    school: 'Ecole Test',
    adminId: admin.id,
  });
  classId = Number(cls.id);

  const otherCls = await createGlClass({
    name: `Classe Autre ${stamp}`,
    school: 'Ecole Test',
    adminId: admin.id,
  });

  const playerA = await createGlPlayer({
    classId,
    pseudo: `market-a-${stamp}`,
    password: '1234',
    healthPoints: 5,
    powerPoints: 4,
  });
  const playerB = await createGlPlayer({
    classId,
    pseudo: `market-b-${stamp}`,
    password: '1234',
    healthPoints: 3,
    powerPoints: 3,
  });
  const playerC = await createGlPlayer({
    classId: otherCls.id,
    pseudo: `market-c-${stamp}`,
    password: '1234',
    healthPoints: 3,
    powerPoints: 3,
  });

  playerAId = Number(playerA.id);
  playerBId = Number(playerB.id);
  playerCId = Number(playerC.id);

  tokenA = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(playerAId),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: playerA.pseudo,
    classId,
  });
  tokenB = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(playerBId),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: playerB.pseudo,
    classId,
  });
  tokenC = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(playerCId),
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
    displayName: playerC.pseudo,
    classId: Number(otherCls.id),
  });
});

test('GET classmates liste la classe sans soi', async () => {
  const res = await request(app)
    .get('/api/gl/market/classmates')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(res.status, 200);
  const ids = res.body.items.map((row) => row.id);
  assert.ok(ids.includes(playerBId));
  assert.ok(!ids.includes(playerAId));
});

test('POST trade refuse camarade autre classe', async () => {
  const res = await request(app)
    .post('/api/gl/market/trades')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ peerPlayerId: playerCId });
  assert.strictEqual(res.status, 403);
});

test('flux complet : offres, figement, double accept, soldes', async () => {
  const createRes = await request(app)
    .post('/api/gl/market/trades')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ peerPlayerId: playerBId });
  assert.strictEqual(createRes.status, 201);
  const tradeId = createRes.body.id;

  await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/offer`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ offerHealth: 1, offerPower: 0 });

  await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/offer`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ offerHealth: 0, offerPower: 1 });

  const freezeRes = await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/accept`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ accepted: true });
  assert.strictEqual(freezeRes.status, 200);
  assert.strictEqual(freezeRes.body.frozen, true);

  const blockedOffer = await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/offer`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ offerHealth: 2, offerPower: 0 });
  assert.strictEqual(blockedOffer.status, 409);

  const completeRes = await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/accept`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ accepted: true });
  assert.strictEqual(completeRes.status, 200);
  assert.strictEqual(completeRes.body.status, 'completed');

  const rowA = await queryOne('SELECT health_points, power_points FROM gl_players WHERE id = ?', [playerAId]);
  const rowB = await queryOne('SELECT health_points, power_points FROM gl_players WHERE id = ?', [playerBId]);
  assert.strictEqual(Number(rowA.health_points), 4);
  assert.strictEqual(Number(rowA.power_points), 5);
  assert.strictEqual(Number(rowB.health_points), 4);
  assert.strictEqual(Number(rowB.power_points), 2);
});

test('dé-accept défige les offres', async () => {
  const createRes = await request(app)
    .post('/api/gl/market/trades')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ peerPlayerId: playerBId });
  assert.strictEqual(createRes.status, 201);
  const tradeId = createRes.body.id;

  await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/accept`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ accepted: true });

  const unacceptRes = await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/accept`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ accepted: false });
  assert.strictEqual(unacceptRes.status, 200);
  assert.strictEqual(unacceptRes.body.frozen, false);

  const offerRes = await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/offer`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ offerHealth: 1, offerPower: 0 });
  assert.strictEqual(offerRes.status, 200);

  await request(app)
    .post(`/api/gl/market/trades/${tradeId}/cancel`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
});

test('solde insuffisant bloque la finalisation', async () => {
  await execute('UPDATE gl_players SET health_points = 0, power_points = 0 WHERE id = ?', [playerAId]);

  const createRes = await request(app)
    .post('/api/gl/market/trades')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ peerPlayerId: playerBId });
  assert.strictEqual(createRes.status, 201);
  const tradeId = createRes.body.id;

  await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/offer`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ offerHealth: 1, offerPower: 0 });

  await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/offer`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ offerHealth: 0, offerPower: 0 });

  await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/accept`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ accepted: true });

  const failRes = await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/accept`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ accepted: true });
  assert.strictEqual(failRes.status, 409);

  await execute('UPDATE gl_players SET health_points = 5, power_points = 4 WHERE id = ?', [playerAId]);
});

test('module désactivé renvoie 503', async () => {
  await setVitalityAndMarket(false);
  const res = await request(app)
    .get('/api/gl/market/classmates')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(res.status, 503);
  await setVitalityAndMarket(true);
});
