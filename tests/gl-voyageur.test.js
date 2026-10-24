'use strict';

// Le Seuil — niveau du voyageur et grimoire personnel (`lib/glVoyageur.js`,
// `routes/gl/voyageur.js`, migration 317).

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { invalidateModulesCache } = require('../lib/glSettings');
const {
  pointsForLevel,
  levelForPoints,
  affinityFor,
  buildVoyageurProgress,
  buildSpellState,
  VOYAGEUR_SPELLS,
  SPELL_RECHARGE_POINTS,
} = require('../lib/glVoyageur');
const {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
} = require('./helpers/glFixtures');

const stamp = Date.now();
let playerId = null;
let playerToken = '';
let adminToken = '';
let lonePlayerToken = '';

async function setVoyageurModule(enabled) {
  await execute(
    `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
     VALUES ('modules.voyageur_enabled', ?, NOW())
     ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`,
    [enabled ? 'true' : 'false'],
  );
  invalidateModulesCache();
}

async function addAcks(pid, type, count, prefix) {
  for (let i = 0; i < count; i += 1) {
    await execute(
      `INSERT IGNORE INTO gl_learning_acknowledgements
         (reader_user_type, reader_user_id, target_type, target_code)
       VALUES ('gl_player', ?, ?, ?)`,
      [String(pid), type, `${prefix}-${stamp}-${i}`],
    );
  }
}

function getMe(token = playerToken) {
  return request(app).get('/api/gl/voyageur/me').set('Authorization', `Bearer ${token}`);
}

before(async () => {
  await initSchema();
  await setVoyageurModule(true);
  const admin = await createGlAdmin({ email: `mj.voyageur.${stamp}@ecole.local` });
  const glClass = await createGlClass({ adminId: admin.id, name: `Classe voyageur ${stamp}` });
  const player = await createGlPlayer({ classId: glClass.id, pseudo: `voy-a-${stamp}` });
  const mate = await createGlPlayer({ classId: glClass.id, pseudo: `voy-b-${stamp}` });
  const lone = await createGlPlayer({ classId: glClass.id, pseudo: `voy-c-${stamp}` });
  playerId = player.id;

  const { chapter } = await createGlChapterWithMarker({
    slug: `voyageur-${stamp}`,
    title: `Chapitre voyageur ${stamp}`,
  });
  const { game, teams } = await createGlGameWithTeams({
    classId: glClass.id,
    chapterId: chapter.id,
    createdBy: admin.id,
    status: 'paused',
    name: `Partie voyageur ${stamp}`,
    teams: [{ name: 'Les Ronces', type: 'unicorn', mascotId: 'gl-licorne-test' }],
  });
  await assignPlayerToGameTeam({ gameId: game.id, teamId: teams[0].id, playerId: player.id });
  await assignPlayerToGameTeam({ gameId: game.id, teamId: teams[0].id, playerId: mate.id });

  const tokens = await signTokens({
    adminId: admin.id,
    playerId: player.id,
    playerPseudo: player.pseudo,
  });
  playerToken = tokens.playerToken;
  adminToken = tokens.adminToken;
  lonePlayerToken = (await signTokens({ playerId: lone.id, playerPseudo: lone.pseudo }))
    .playerToken;
});

// --- Règles pures -------------------------------------------------------------------------

test('paliers de niveau : 0, 5, 15, 30, 50 points', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(pointsForLevel), [0, 5, 15, 30, 50]);
  assert.equal(levelForPoints(0), 1);
  assert.equal(levelForPoints(4), 1);
  assert.equal(levelForPoints(5), 2);
  assert.equal(levelForPoints(14), 2);
  assert.equal(levelForPoints(15), 3);
});

test('penchant : éveil, proche, loin, pacte du seuil', () => {
  assert.equal(affinityFor(2, 1).key, 'eveil');
  assert.equal(affinityFor(8, 2).key, 'proche');
  assert.equal(affinityFor(2, 8).key, 'loin');
  assert.equal(affinityFor(5, 5).key, 'pacte');
});

test('regards : sources proche / loin et sources ignorées (tutoriels)', () => {
  const p = buildVoyageurProgress({
    species: 3,
    qcm: 2,
    feuillets_found: 1,
    journal: 2,
    tutorial: 9,
  });
  assert.equal(p.regards.proche.points, 5);
  assert.equal(p.regards.loin.points, 3);
  assert.equal(p.points, 8);
  assert.equal(p.level, 2);
  assert.equal(p.nextLevelAt, 15);
  assert.equal(p.pointsToNextLevel, 7);
});

test('charge : disponible à la première fois, puis après SPELL_RECHARGE_POINTS nouveaux points', () => {
  const spell = VOYAGEUR_SPELLS.find((s) => s.code === 'seconde_chance');
  assert.equal(buildSpellState(spell, { level: 1, points: 4, useRow: null }).unlocked, false);
  assert.equal(buildSpellState(spell, { level: 2, points: 5, useRow: null }).charged, true);
  const used = { uses_count: 1, last_used_points: 6 };
  const after = buildSpellState(spell, { level: 2, points: 8, useRow: used });
  assert.equal(after.charged, false);
  assert.equal(after.pointsToRecharge, 6 + SPELL_RECHARGE_POINTS - 8);
  assert.equal(
    buildSpellState(spell, { level: 2, points: 6 + SPELL_RECHARGE_POINTS, useRow: used }).charged,
    true,
  );
});

// --- Routes ------------------------------------------------------------------------------

test('GET /me — réservé aux joueurs, refusé sans jeton et au MJ', async () => {
  await request(app).get('/api/gl/voyageur/me').expect(401);
  await getMe(adminToken).expect(403);
});

test('GET /me — module éteint : 503', async () => {
  await setVoyageurModule(false);
  try {
    await getMe().expect(503);
  } finally {
    await setVoyageurModule(true);
  }
});

test('GET /me — joueur neuf : niveau 1, grimoire verrouillé, expédition en cours', async () => {
  const res = await getMe().expect(200);
  assert.equal(res.body.level, 1);
  assert.equal(res.body.points, 0);
  assert.equal(res.body.stage.name, 'Graine');
  assert.equal(res.body.affinity.key, 'eveil');
  assert.ok(res.body.grimoire.every((s) => s.unlocked === false));
  assert.equal(res.body.expedition.teamName, 'Les Ronces');
  assert.equal(res.body.expedition.teamType, 'unicorn');
  assert.equal(res.body.expedition.gameStatus, 'paused');
  assert.deepEqual(res.body.expedition.teammates, [`voy-b-${stamp}`]);
});

test('GET /me — joueur sans équipe : expédition nulle', async () => {
  const res = await getMe(lonePlayerToken).expect(200);
  assert.equal(res.body.expedition, null);
});

test('Seconde chance : verrouillée avant le niveau 2, puis lève un délai d’attente', async () => {
  await request(app)
    .post('/api/gl/voyageur/spells/seconde_chance/cast')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ target: 'species:x' })
    .expect(409);

  await addAcks(playerId, 'species', 5, 'sp');
  const me = await getMe().expect(200);
  assert.equal(me.body.level, 2);
  const spell = me.body.grimoire.find((s) => s.code === 'seconde_chance');
  assert.equal(spell.unlocked, true);
  assert.equal(spell.charged, true);

  const ref = `sp-lock-${stamp}`;
  await execute(
    `INSERT INTO gl_resource_gating_cooldowns
       (reader_user_type, reader_user_id, resource_type, resource_ref, locked_until)
     VALUES ('gl_player', ?, 'species', ?, DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
    [String(playerId), ref],
  );
  const targets = await request(app)
    .get('/api/gl/voyageur/spells/seconde_chance/targets')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  assert.equal(targets.body.items.length, 1);
  assert.equal(targets.body.items[0].target, `species:${ref}`);

  const cast = await request(app)
    .post('/api/gl/voyageur/spells/seconde_chance/cast')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ target: `species:${ref}` })
    .expect(200);
  assert.equal(cast.body.success, true);
  assert.equal(cast.body.spell.charged, false);
  assert.equal(cast.body.spell.pointsToRecharge, SPELL_RECHARGE_POINTS);
  const row = await queryOne(
    `SELECT 1 AS ok FROM gl_resource_gating_cooldowns
      WHERE reader_user_type = 'gl_player' AND reader_user_id = ? AND resource_ref = ?`,
    [String(playerId), ref],
  );
  assert.equal(row, undefined);
});

test('Seconde chance : sans charge 409, rechargée après de nouveaux acquis', async () => {
  const ref = `sp-lock2-${stamp}`;
  await execute(
    `INSERT INTO gl_resource_gating_cooldowns
       (reader_user_type, reader_user_id, resource_type, resource_ref, locked_until)
     VALUES ('gl_player', ?, 'species', ?, DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
    [String(playerId), ref],
  );
  const refused = await request(app)
    .post('/api/gl/voyageur/spells/seconde_chance/cast')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ target: `species:${ref}` })
    .expect(409);
  assert.equal(refused.body.code, 'SPELL_NOT_CHARGED');

  await addAcks(playerId, 'glossary', SPELL_RECHARGE_POINTS, 'gl');
  await request(app)
    .post('/api/gl/voyageur/spells/seconde_chance/cast')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ target: `species:${ref}` })
    .expect(200);
});

test('Seconde chance : cible absente → 404, charge non consommée', async () => {
  await addAcks(playerId, 'ecosystem', SPELL_RECHARGE_POINTS, 'eco');
  const res = await request(app)
    .post('/api/gl/voyageur/spells/seconde_chance/cast')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ target: 'species:inexistante' })
    .expect(404);
  assert.equal(res.body.code, 'TARGET_NOT_FOUND');
  const me = await getMe().expect(200);
  assert.equal(me.body.grimoire.find((s) => s.code === 'seconde_chance').charged, true);
});

test('Mémoire : rend lisible un feuillet effacé du carnet', async () => {
  const code = `VOY${String(stamp).slice(-8)}`;
  await execute(
    `INSERT INTO gl_lore_feuillets (feuillet_code, titre, incipit, texte_accessible, biome_slug, ordre_voyage)
     VALUES (?, 'Le feuillet mangé', 'Il était…', 'Un texte que le Souffle a mangé.', NULL, 1)`,
    [code],
  );
  await execute(
    `INSERT INTO gl_player_feuillet_states (player_id, feuillet_code, status, effacement_pct)
     VALUES (?, ?, 'effaced', 60)`,
    [playerId, code],
  );
  // 15 points proche + 1 feuillet trouvé : niveau 3 → Mémoire déverrouillée.
  const me = await getMe().expect(200);
  assert.ok(me.body.level >= 3, `niveau ${me.body.level}`);
  assert.equal(me.body.regards.loin.points >= 1, true);

  const targets = await request(app)
    .get('/api/gl/voyageur/spells/memoire/targets')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(200);
  const item = targets.body.items.find((t) => t.target === code);
  assert.ok(item);
  assert.equal(item.effacementPct, 60);

  const cast = await request(app)
    .post('/api/gl/voyageur/spells/memoire/cast')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ target: code })
    .expect(200);
  assert.equal(cast.body.effect.previousEffacementPct, 60);
  const row = await queryOne(
    'SELECT status, effacement_pct FROM gl_player_feuillet_states WHERE player_id = ? AND feuillet_code = ?',
    [playerId, code],
  );
  assert.equal(Number(row.effacement_pct), 0);
  assert.equal(row.status, 'read');
});

test('sortilège inconnu → 404 ; cible vide → 400', async () => {
  await request(app)
    .get('/api/gl/voyageur/spells/inconnu/targets')
    .set('Authorization', `Bearer ${playerToken}`)
    .expect(404);
  await request(app)
    .post('/api/gl/voyageur/spells/memoire/cast')
    .set('Authorization', `Bearer ${playerToken}`)
    .send({ target: '' })
    .expect(400);
});
