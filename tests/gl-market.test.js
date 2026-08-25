'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { invalidateGameplayCache, invalidateModulesCache } = require('../lib/glSettings');
const { signAuthToken } = require('../middleware/requireTeacher');
const { createGlAdmin, createGlClass, createGlPlayer } = require('./helpers/glFixtures');

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
    [JSON.stringify(!!enabled), JSON.stringify(!!enabled)],
  );
  invalidateGameplayCache();
  invalidateModulesCache();
}

/** `gameplay.market_hearts_enabled` : cœurs échangeables ou non (défaut produit : non). */
async function setMarketHearts(enabled) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.market_hearts_enabled', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [JSON.stringify(!!enabled)],
  );
  invalidateGameplayCache();
}

/** Plafonds de jeu : 0 = illimité (défaut). */
async function setVitalityCaps(maxHealth, maxPower) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('gameplay.max_health_points', ?, NOW()),
            ('gameplay.max_power_points', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [JSON.stringify(maxHealth), JSON.stringify(maxPower)],
  );
  invalidateGameplayCache();
}

before(async () => {
  await initSchema();
  await setVitalityAndMarket(true);
  // Les scénarios historiques couvrent le cas « cœurs autorisés » ; le cas par
  // défaut (cœurs non échangeables) est testé en fin de fichier.
  await setMarketHearts(true);

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

  const rowA = await queryOne('SELECT health_points, power_points FROM gl_players WHERE id = ?', [
    playerAId,
  ]);
  const rowB = await queryOne('SELECT health_points, power_points FROM gl_players WHERE id = ?', [
    playerBId,
  ]);
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
  await execute('UPDATE gl_players SET health_points = 0, power_points = 0 WHERE id = ?', [
    playerAId,
  ]);

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

  await execute('UPDATE gl_players SET health_points = 5, power_points = 4 WHERE id = ?', [
    playerAId,
  ]);

  // L'échange reste « negotiating » après l'échec : le refermer, sinon toute création
  // suivante entre les deux mêmes joueurs part en 409 ACTIVE_TRADE_EXISTS.
  await request(app)
    .post(`/api/gl/market/trades/${tradeId}/cancel`)
    .set('Authorization', `Bearer ${tokenA}`)
    .expect(200);
});

test('module désactivé renvoie 503', async () => {
  await setVitalityAndMarket(false);
  const res = await request(app)
    .get('/api/gl/market/classmates')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(res.status, 503);
  await setVitalityAndMarket(true);
});

test('cœurs non échangeables : une offre en cœurs est refusée (409)', async () => {
  await setMarketHearts(false);
  try {
    const createRes = await request(app)
      .post('/api/gl/market/trades')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ peerPlayerId: playerBId });
    assert.strictEqual(createRes.status, 201);
    const tradeId = createRes.body.id;

    const heartOffer = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/offer`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ offerHealth: 1, offerPower: 0 });
    assert.strictEqual(heartOffer.status, 409);

    // Les gemmes, elles, circulent toujours.
    const gemOffer = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/offer`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ offerHealth: 0, offerPower: 1 });
    assert.strictEqual(gemOffer.status, 200);

    await request(app)
      .post(`/api/gl/market/trades/${tradeId}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  } finally {
    await setMarketHearts(true);
  }
});

test('cœurs non échangeables : une offre posée avant la bascule ne se finalise pas', async () => {
  const createRes = await request(app)
    .post('/api/gl/market/trades')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ peerPlayerId: playerBId });
  assert.strictEqual(createRes.status, 201);
  const tradeId = createRes.body.id;

  // Offre en cœurs déposée alors que le réglage l'autorise encore.
  const heartOffer = await request(app)
    .patch(`/api/gl/market/trades/${tradeId}/offer`)
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ offerHealth: 1, offerPower: 0 });
  assert.strictEqual(heartOffer.status, 200);

  const before = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [playerAId]);

  await setMarketHearts(false);
  try {
    await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/accept`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ accepted: true });

    const failRes = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/accept`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ accepted: true });
    assert.strictEqual(failRes.status, 409);

    // Aucun cœur n'a bougé : la finalisation est refusée, pas amputée en silence.
    const after = await queryOne('SELECT health_points FROM gl_players WHERE id = ?', [playerAId]);
    assert.strictEqual(Number(after.health_points), Number(before.health_points));
  } finally {
    await setMarketHearts(true);
    await request(app)
      .post(`/api/gl/market/trades/${tradeId}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`);
  }
});

test('plafond de jeu : un échange qui ferait dépasser est refusé, les soldes inchangés', async () => {
  // A à 5 gemmes, B lui en donne 2, plafond gemmes = 5 → avant le correctif,
  // B perdait 2 gemmes et A n'en recevait aucune (monnaie détruite).
  await execute('UPDATE gl_players SET health_points = 5, power_points = 5 WHERE id = ?', [
    playerAId,
  ]);
  await execute('UPDATE gl_players SET health_points = 3, power_points = 4 WHERE id = ?', [
    playerBId,
  ]);
  await setVitalityCaps(5, 5);
  try {
    const createRes = await request(app)
      .post('/api/gl/market/trades')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ peerPlayerId: playerBId });
    assert.strictEqual(createRes.status, 201);
    const tradeId = createRes.body.id;

    const gemOffer = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/offer`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ offerHealth: 0, offerPower: 2 });
    assert.strictEqual(gemOffer.status, 200);

    await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/accept`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ accepted: true });

    const failRes = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/accept`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ accepted: true });
    assert.strictEqual(failRes.status, 409);
    assert.match(String(failRes.body.error || ''), /plafond/i);

    const rowA = await queryOne('SELECT health_points, power_points FROM gl_players WHERE id = ?', [
      playerAId,
    ]);
    const rowB = await queryOne('SELECT health_points, power_points FROM gl_players WHERE id = ?', [
      playerBId,
    ]);
    assert.strictEqual(Number(rowA.power_points), 5, 'A ne reçoit rien au-dessus du plafond');
    assert.strictEqual(Number(rowB.power_points), 4, 'B ne perd pas les gemmes refusées');
    assert.strictEqual(Number(rowA.health_points), 5);
    assert.strictEqual(Number(rowB.health_points), 3);

    await request(app)
      .post(`/api/gl/market/trades/${tradeId}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
  } finally {
    await setVitalityCaps(0, 0);
    await execute('UPDATE gl_players SET health_points = 5, power_points = 4 WHERE id = ?', [
      playerAId,
    ]);
    await execute('UPDATE gl_players SET health_points = 3, power_points = 3 WHERE id = ?', [
      playerBId,
    ]);
  }
});
