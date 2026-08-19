'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { invalidateGameplayCache, invalidateModulesCache } = require('../lib/glSettings');
const { upsertFeuilletState, loadPlayerFeuilletStates } = require('../lib/glLoreFeuillets');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const db = { queryOne, queryAll, execute };
const stamp = Date.now();
const biomeSlug = `mktf${stamp}`.slice(0, 64);
const ownedCode = `mkt-own-${stamp}`;
const strangerCode = `mkt-none-${stamp}`;

let tokenA = '';
let tokenB = '';
let playerAId = null;
let playerBId = null;
let playerCId = null;
let gameId = null;
let teamAId = null;
let teamBId = null;

async function setSettings({ market = true, vitality = true, feuillets = true, carnet = true }) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('modules.market_enabled', ?, NOW()),
            ('gameplay.vitality_enabled', ?, NOW()),
            ('gameplay.market_feuillets_enabled', ?, NOW()),
            ('modules.lore_carnet_enabled', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [
      JSON.stringify(!!market),
      JSON.stringify(!!vitality),
      JSON.stringify(!!feuillets),
      JSON.stringify(!!carnet),
    ],
  );
  invalidateGameplayCache();
  invalidateModulesCache();
}

/** Ouvre un échange A↔B, applique `fn`, puis referme systématiquement. */
async function withTrade(fn) {
  const createRes = await request(app)
    .post('/api/gl/market/trades')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ peerPlayerId: playerBId });
  assert.strictEqual(createRes.status, 201);
  const tradeId = createRes.body.id;
  try {
    return await fn(tradeId);
  } finally {
    await request(app)
      .post(`/api/gl/market/trades/${tradeId}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`);
  }
}

before(async () => {
  await initSchema();
  await setSettings({});

  const admin = await createGlAdmin({ email: `mktf.${stamp}@ecole.local` });
  const cls = await createGlClass({ name: `Classe MktF ${stamp}`, adminId: admin.id });

  await execute(
    'INSERT INTO gl_chapters (slug, title, plateau_number, order_index) VALUES (?, ?, NULL, 951)',
    [`mktf-${stamp}`, `Chapitre MktF ${stamp}`],
  );
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE slug = ? LIMIT 1', [
    `mktf-${stamp}`,
  ]);
  await execute('INSERT IGNORE INTO gl_biomes (slug, nom, order_index) VALUES (?, ?, 991)', [
    biomeSlug,
    `Biome MktF ${stamp}`,
  ]);

  const seed = await createGlGameWithTeams({
    classId: cls.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    teams: [
      { name: 'Equipe A', type: 'gnome' },
      { name: 'Equipe B', type: 'unicorn' },
    ],
  });
  gameId = Number(seed.game.id);
  teamAId = Number(seed.teams[0].id);
  teamBId = Number(seed.teams[1].id);
  await execute('UPDATE gl_games SET status = ? WHERE id = ?', ['live', gameId]);

  const playerA = await createGlPlayer({
    classId: cls.id,
    teamId: teamAId,
    pseudo: `mkta-${stamp}`,
  });
  const playerB = await createGlPlayer({
    classId: cls.id,
    teamId: teamBId,
    pseudo: `mktb-${stamp}`,
  });
  // Joueur C : même classe, rattaché à aucune partie → ne peut rien recevoir.
  const playerC = await createGlPlayer({ classId: cls.id, pseudo: `mktc-${stamp}` });
  playerAId = playerA.id;
  playerBId = playerB.id;
  playerCId = playerC.id;
  await assignPlayerToGameTeam({ gameId, teamId: teamAId, playerId: playerA.id });
  await assignPlayerToGameTeam({ gameId, teamId: teamBId, playerId: playerB.id });

  const tokensA = await signTokens({ playerId: playerA.id, teamId: teamAId, playerPseudo: 'A' });
  const tokensB = await signTokens({ playerId: playerB.id, teamId: teamBId, playerPseudo: 'B' });
  tokenA = tokensA.playerToken;
  tokenB = tokensB.playerToken;

  for (const code of [ownedCode, strangerCode]) {
    await execute(
      `INSERT INTO gl_lore_feuillets (feuillet_code, titre, incipit, texte_accessible, biome_slug, ordre_voyage)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [code, `Feuillet ${code}`, 'Incipit', 'Texte accessible', biomeSlug],
    );
  }

  // L'équipe A découvre le feuillet : la possession est matérialisée pour ses membres.
  await upsertFeuilletState(db, {
    gameId,
    teamId: teamAId,
    feuilletCode: ownedCode,
    status: 'discovered',
    unlockedVia: 'zone',
    discoveredByPlayerId: String(playerA.id),
    discoveredByName: 'A',
    discoveredSource: 'zone',
  });
});

test('découverte : la possession du feuillet est matérialisée par joueur', async () => {
  const row = await queryOne(
    'SELECT acquired_via, status FROM gl_player_feuillet_states WHERE player_id = ? AND feuillet_code = ?',
    [playerAId, ownedCode],
  );
  assert.ok(row, 'le membre de l’équipe doit posséder le feuillet en propre');
  assert.strictEqual(row.acquired_via, 'decouverte');
  assert.strictEqual(row.status, 'discovered');
});

test('durabilité : sortir un joueur de l’équipe ne lui retire pas son feuillet', async () => {
  await execute('DELETE FROM gl_team_members WHERE game_id = ? AND player_id = ?', [
    gameId,
    playerAId,
  ]);
  try {
    const states = await loadPlayerFeuilletStates(db, playerAId);
    assert.ok(
      states.has(ownedCode),
      'le carnet ne doit plus dépendre de l’appartenance à une équipe',
    );
  } finally {
    await assignPlayerToGameTeam({ gameId, teamId: teamAId, playerId: playerAId });
  }
});

test('GET /market/feuillets liste le carnet personnel du joueur', async () => {
  const res = await request(app)
    .get('/api/gl/market/feuillets')
    .set('Authorization', `Bearer ${tokenA}`);
  assert.strictEqual(res.status, 200);
  const codes = (res.body.items || []).map((f) => f.feuilletCode);
  assert.ok(codes.includes(ownedCode));

  const resB = await request(app)
    .get('/api/gl/market/feuillets')
    .set('Authorization', `Bearer ${tokenB}`);
  assert.strictEqual(resB.status, 200);
  assert.ok(!(resB.body.items || []).map((f) => f.feuilletCode).includes(ownedCode));
});

test('proposer un feuillet qu’on ne possède pas est refusé (409)', async () => {
  await withTrade(async (tradeId) => {
    const res = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/offer`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ offerHealth: 0, offerPower: 0, offerFeuillets: [strangerCode] });
    assert.strictEqual(res.status, 409);
  });
});

test('réglage désactivé : proposer un feuillet est refusé (409)', async () => {
  await setSettings({ feuillets: false });
  try {
    await withTrade(async (tradeId) => {
      const res = await request(app)
        .patch(`/api/gl/market/trades/${tradeId}/offer`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ offerHealth: 0, offerPower: 0, offerFeuillets: [ownedCode] });
      assert.strictEqual(res.status, 409);
    });
  } finally {
    await setSettings({});
  }
});

test('échange : le feuillet est recopié vers l’équipe du receveur, le donneur le garde', async () => {
  await withTrade(async (tradeId) => {
    const offerRes = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/offer`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ offerHealth: 0, offerPower: 0, offerFeuillets: [ownedCode] });
    assert.strictEqual(offerRes.status, 200);

    await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/accept`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ accepted: true });
    const completeRes = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/accept`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ accepted: true });
    assert.strictEqual(completeRes.status, 200);
    assert.strictEqual(completeRes.body.status, 'completed');

    // Reçu par l'équipe du receveur, marqué comme venant d'un échange.
    const teamState = await queryOne(
      `SELECT unlocked_via, discovered_source, discovered_by_name
         FROM gl_game_feuillet_states
        WHERE game_id = ? AND team_id = ? AND feuillet_code = ?`,
      [gameId, teamBId, ownedCode],
    );
    assert.ok(teamState, 'l’équipe du receveur doit avoir le feuillet');
    assert.strictEqual(teamState.unlocked_via, 'echange');
    assert.strictEqual(teamState.discovered_source, 'echange');
    // L'attribution d'origine voyage avec la copie.
    assert.strictEqual(teamState.discovered_by_name, 'A');

    const receiverOwn = await queryOne(
      'SELECT acquired_via FROM gl_player_feuillet_states WHERE player_id = ? AND feuillet_code = ?',
      [playerBId, ownedCode],
    );
    assert.ok(receiverOwn, 'le receveur doit posséder le feuillet en propre');
    assert.strictEqual(receiverOwn.acquired_via, 'echange');

    // Copie, pas transfert : le donneur garde le sien.
    const giverStates = await loadPlayerFeuilletStates(db, playerAId);
    assert.ok(giverStates.has(ownedCode), 'le donneur doit garder son feuillet');
  });
});

test('échange : ne dégrade pas un feuillet déjà trouvé par l’équipe du receveur', async () => {
  // L'équipe B a trouvé le feuillet intact sur la carte ; A en propose une copie effacée
  // à 90 %. Livrer la copie écrasait `status`, `effacement_pct` et `unlocked_via` : le
  // feuillet devenait illisible et la découverte se transformait en échange.
  const fadedCode = `mkt-fade-${stamp}`;
  await execute(
    `INSERT INTO gl_lore_feuillets (feuillet_code, titre, incipit, texte_accessible, biome_slug, ordre_voyage)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [fadedCode, `Feuillet ${fadedCode}`, 'Incipit', 'Texte accessible', biomeSlug],
  );
  await upsertFeuilletState(db, {
    gameId,
    teamId: teamAId,
    feuilletCode: fadedCode,
    status: 'effaced',
    effacementPct: 90,
    unlockedVia: 'echange',
    acquiredVia: 'echange',
    discoveredByPlayerId: String(playerAId),
    discoveredByName: 'A',
    discoveredSource: 'echange',
  });
  await upsertFeuilletState(db, {
    gameId,
    teamId: teamBId,
    feuilletCode: fadedCode,
    status: 'discovered',
    effacementPct: 0,
    unlockedVia: 'zone',
    acquiredVia: 'decouverte',
    discoveredByPlayerId: String(playerBId),
    discoveredByName: 'B',
    discoveredSource: 'zone',
  });

  await withTrade(async (tradeId) => {
    const offerRes = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/offer`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ offerHealth: 0, offerPower: 0, offerFeuillets: [fadedCode] });
    assert.strictEqual(offerRes.status, 200);

    await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/accept`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ accepted: true });
    const completeRes = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/accept`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ accepted: true });
    assert.strictEqual(completeRes.status, 200);
    assert.strictEqual(completeRes.body.status, 'completed');

    const teamState = await queryOne(
      `SELECT unlocked_via, status, effacement_pct FROM gl_game_feuillet_states
        WHERE game_id = ? AND team_id = ? AND feuillet_code = ?`,
      [gameId, teamBId, fadedCode],
    );
    assert.strictEqual(teamState.unlocked_via, 'zone');
    assert.strictEqual(teamState.status, 'discovered');
    assert.strictEqual(Number(teamState.effacement_pct), 0);
  });
});

test('receveur sans partie en cours : la finalisation est refusée (409)', async () => {
  const createRes = await request(app)
    .post('/api/gl/market/trades')
    .set('Authorization', `Bearer ${tokenA}`)
    .send({ peerPlayerId: playerCId });
  assert.strictEqual(createRes.status, 201);
  const tradeId = createRes.body.id;

  const tokensC = await signTokens({ playerId: playerCId, playerPseudo: 'C' });
  try {
    await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/offer`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ offerHealth: 0, offerPower: 0, offerFeuillets: [ownedCode] })
      .expect(200);

    await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/accept`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ accepted: true });
    const failRes = await request(app)
      .patch(`/api/gl/market/trades/${tradeId}/accept`)
      .set('Authorization', `Bearer ${tokensC.playerToken}`)
      .send({ accepted: true });
    assert.strictEqual(failRes.status, 409);

    const orphan = await queryAll(
      'SELECT 1 FROM gl_player_feuillet_states WHERE player_id = ? AND feuillet_code = ?',
      [playerCId, ownedCode],
    );
    assert.strictEqual(
      orphan.length,
      0,
      'aucun état ne doit être créé pour un receveur sans partie',
    );
  } finally {
    await request(app)
      .post(`/api/gl/market/trades/${tradeId}/cancel`)
      .set('Authorization', `Bearer ${tokenA}`);
  }
});
