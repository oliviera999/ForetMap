'use strict';

/**
 * Gnomes & Licornes — badges individuels sur le moteur commun (migration 338,
 * `lib/glRewards.js`, `routes/gl/rewards.js`) : chaque mesure sur fixtures anonymes, paliers
 * Fil / Nœud / Étoffe, idempotence et jamais de retrait, mot obligatoire, aucune ressource
 * créditée, aucune clé de classement, vitrine triée par nom, interrupteur de module, routes
 * héritées `tenir/badges` déléguées. Fixtures anonymes (`joueur-a-<stamp>`…).
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, queryAll } = db;
const {
  createTenirGame,
  importExempleChasse,
  readPlayerBourses,
  setGlSetting,
} = require('./helpers/glTenirFixtures');
const { createGlGameWithTeams, assignPlayerToGameTeam } = require('./helpers/glFixtures');
const { invalidateModulesCache } = require('../lib/glSettings');
const { glRewards, GL_REWARD_CATALOGUE, RESERVED_REWARDS } = require('../lib/glRewards');
const { createMetricContext } = require('../lib/glRewardsMetrics');
const { AIDE_SPELL_CODES } = require('../lib/glSpellEffects');
const { queueGlRewards, awardGlManualToTeam } = require('../lib/glRewardsHooks');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const RANKING_KEYS = /^(rank|rang|classement|position|score|ordre|place)$/i;

/** Aucune clé de classement, à aucune profondeur d'une réponse. */
function assertNoRankingKeys(value, path = '$') {
  if (Array.isArray(value)) return value.forEach((v, i) => assertNoRankingKeys(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      assert.ok(!RANKING_KEYS.test(k), `clé de classement « ${k} » dans ${path}`);
      assertNoRankingKeys(v, `${path}.${k}`);
    }
  }
  return undefined;
}

async function zoneId(zoneKey) {
  return Number(
    (await queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ?', [zoneKey])).id,
  );
}

async function insertEvent(gameId, teamId, eventType, payload) {
  const r = await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, ?, 'team', '1', ?, ?, NOW())`,
    [gameId, teamId, eventType, JSON.stringify(payload)],
  );
  return Number(r.insertId);
}

async function value(playerId, metric) {
  return createMetricContext(db, playerId).value(metric);
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  await setGlSetting('modules.rewards_enabled', true);
  invalidateModulesCache();
});

after(async () => {
  await setGlSetting('modules.rewards_enabled', true);
  invalidateModulesCache();
});

test('catalogue : 16 entrées, paliers de la Trame, réservés hors catalogue, aucun mot interdit', () => {
  assert.equal(GL_REWARD_CATALOGUE.length, 16);
  assert.deepEqual(
    glRewards.publicCatalogue().tiers.map((t) => `${t.emoji} ${t.label}`),
    ['🧵 Fil', '🪢 Nœud', '🧶 Étoffe'],
  );
  assert.deepEqual(glRewards.MANUAL_TYPES, ['chuchoteur', 'renard', 'esprit_equipe']);
  for (const r of RESERVED_REWARDS) assert.ok(!glRewards.CATALOGUE_BY_KEY.has(r.key));
  assert.ok(!GL_REWARD_CATALOGUE.some((e) => /opérateur|operateur/i.test(e.title)));
  const text = JSON.stringify(GL_REWARD_CATALOGUE);
  assert.doesNotMatch(
    text,
    /monstre|ennemi|attaque|poursui|corbeau|krâ|kraa|\bfaux\b|raté|perdu|classement/i,
  );
  assert.equal(glRewards.store.table, 'gl_player_rewards');
});

test('chasse : fouilles (joueur ou équipe en sa présence, tout verdict) et pages trouvées / réparées', async () => {
  const p = ctx.players[0]; // Gnomes A
  const mate = ctx.players[4]; // aussi Gnomes A
  const other = ctx.players[2]; // Licornes A
  for (let i = 0; i < 3; i += 1) {
    await execute(
      `INSERT INTO gl_game_chasse_empreintes (game_id, team_id, player_id, round_number, x, y, verdict, created_at)
       VALUES (?, ?, ?, 1, 0.1, 0.1, ?, NOW())`,
      [ctx.game.id, p.teamId, p.id, ['froid', 'tiede', 'chaud'][i]],
    );
  }
  // Fouille d'un coéquipier au tour 2, où le joueur est marqué absent : ne compte pas.
  await execute(
    `INSERT INTO gl_game_chasse_empreintes (game_id, team_id, player_id, round_number, x, y, verdict, created_at)
     VALUES (?, ?, ?, 2, 0.2, 0.2, 'chaud', NOW())`,
    [ctx.game.id, p.teamId, mate.id],
  );
  await execute(
    'INSERT IGNORE INTO gl_game_round_absences (game_id, round_number, player_id) VALUES (?, 2, ?)',
    [ctx.game.id, p.id],
  );
  // Fouille d'une autre équipe : ne compte pas.
  await execute(
    `INSERT INTO gl_game_chasse_empreintes (game_id, team_id, player_id, round_number, x, y, verdict, created_at)
     VALUES (?, ?, ?, 1, 0.3, 0.3, 'chaud', NOW())`,
    [ctx.game.id, other.teamId, other.id],
  );
  assert.equal(await value(p.id, 'fouilles'), 3, 'tout verdict ; absent au tour 2 exclu');
  assert.equal(await value(mate.id, 'fouilles'), 4, 'coéquipier présent aux deux tours');

  await insertEvent(ctx.game.id, p.teamId, 'page_trouvee', { zoneKey: 'cz-p1-01', roundNumber: 1 });
  await insertEvent(ctx.game.id, p.teamId, 'page_reparee', { zoneKey: 'cz-p1-02', roundNumber: 2 });
  assert.equal(await value(p.id, 'pages_equipe'), 1, 'la réparation du tour 2 : absent');
  assert.equal(await value(mate.id, 'pages_equipe'), 2);
  assert.equal(await value(mate.id, 'reparations'), 1);
  assert.equal(await value(p.id, 'reparations'), 0);
  assert.equal(await value(other.id, 'pages_equipe'), 0);
});

test('lecture : pages lues (carnet ∪ ouvertures) et pages tenues (équipe présente ou veillée)', async () => {
  const p = ctx.players[1]; // Gnomes B
  await execute(
    `INSERT IGNORE INTO gl_player_feuillet_states (player_id, feuillet_code, status, effacement_pct, acquired_via, acquired_at, updated_at)
     VALUES (?, 'tenir-ex-p1-1', 'read', 0, 'decouverte', NOW(), NOW()), (?, 'tenir-ex-p2-1', 'held', 0, 'decouverte', NOW(), NOW()),
            (?, 'tenir-ex-p3-1', 'discovered', 0, 'decouverte', NOW(), NOW())`,
    [p.id, p.id, p.id],
  );
  const z1 = await zoneId('cz-p1-01'); // feuillet tenir-ex-p1-1 : déjà compté
  const z2 = await zoneId('cz-p1-02');
  await execute(
    `INSERT INTO gl_game_chasse_ouvertures (game_id, zone_id, team_id, player_id, via, reussie, gain, semaine_iso, created_at)
     VALUES (?, ?, ?, ?, 'tour', NULL, 0, '2026-W40', NOW()), (?, ?, ?, ?, 'veillee', 1, 1, '2026-W41', NOW())`,
    [ctx.game.id, z1, p.teamId, p.id, ctx.game.id, z2, p.teamId, p.id],
  );
  assert.equal(await value(p.id, 'pages_lues'), 3, 'read + held + ouverture d’une autre page');
  await insertEvent(ctx.game.id, p.teamId, 'page_tenue', {
    zoneKey: 'cz-p1-03',
    via: 'tour',
    roundNumber: 1,
  });
  assert.equal(await value(p.id, 'pages_tenues'), 2, 'une au tour (équipe), une en veillée');
});

test('persévérance : réussite après un « pas encore » sur la même zone, question ou case', async () => {
  const p = ctx.players[2]; // Licornes A
  const g = ctx.game.id;
  await insertEvent(g, p.teamId, 'pas_encore', {
    kind: 'chasse',
    zoneKey: 'cz-p1-05',
    roundNumber: 1,
  });
  await insertEvent(g, p.teamId, 'pas_encore', {
    kind: 'chasse',
    zoneKey: 'cz-p1-05',
    roundNumber: 1,
  });
  await insertEvent(g, p.teamId, 'pas_encore', { kind: 'case', markerId: 77, roundNumber: 1 });
  await insertEvent(g, p.teamId, 'pas_encore', {
    kind: 'lecture',
    zoneKey: 'cz-p1-06',
    roundNumber: 1,
  });
  assert.equal(await value(p.id, 'pas_encore'), 0, 'un « pas encore » seul ne compte pas');
  await insertEvent(g, p.teamId, 'page_trouvee', { zoneKey: 'cz-p1-05', roundNumber: 2 });
  await insertEvent(g, p.teamId, 'qcm_answer', { markerId: 77, correct: true, roundNumber: 2 });
  await insertEvent(g, p.teamId, 'qcm_answer', { markerId: 78, correct: false, roundNumber: 2 });
  assert.equal(await value(p.id, 'pas_encore'), 2, 'zone + case ; la lecture attend encore');
  await insertEvent(g, p.teamId, 'page_tenue', {
    zoneKey: 'cz-p1-06',
    via: 'tour',
    roundNumber: 3,
  });
  assert.equal(await value(p.id, 'pas_encore'), 3);
});

test('coopération : dons, sorts d’aide (présence ou part au pot), réparations', async () => {
  const p = ctx.players[3]; // Licornes B
  const contributor = ctx.players[0]; // Gnomes A, hors équipe mais au pot
  for (let i = 0; i < 2; i += 1) {
    await execute(
      `INSERT INTO gl_market_dons (class_id, game_id, donneur_id, receveur_id, gemmes, coeurs, created_at)
       VALUES (?, ?, ?, ?, 1, 0, NOW())`,
      [ctx.cls.id, ctx.game.id, p.id, ctx.players[1].id],
    );
  }
  assert.equal(await value(p.id, 'dons'), 2);
  const aideCode = AIDE_SPELL_CODES[0];
  const cast = await execute(
    `INSERT INTO gl_spell_cast_drafts (game_id, team_id, spell_code, status, created_by_actor_type, created_by_actor_id, cast_round_number, created_at, updated_at, cast_at)
     VALUES (?, ?, ?, 'cast', 'team', 'x', 1, NOW(), NOW(), NOW())`,
    [ctx.game.id, p.teamId, aideCode],
  );
  await execute(
    `INSERT INTO gl_spell_cast_contributions (draft_id, player_id, gems, hearts, updated_by_player_id) VALUES (?, ?, 2, 0, ?)`,
    [cast.insertId, contributor.id, contributor.id],
  );
  // Un sort non « aide » et un brouillon jamais lancé ne comptent pas.
  await execute(
    `INSERT INTO gl_spell_cast_drafts (game_id, team_id, spell_code, status, created_by_actor_type, created_by_actor_id, cast_round_number, created_at, updated_at)
     VALUES (?, ?, 'SL001', 'cast', 'team', 'x', 1, NOW(), NOW()), (?, ?, ?, 'collecting', 'team', 'x', 1, NOW(), NOW())`,
    [ctx.game.id, p.teamId, ctx.game.id, p.teamId, aideCode],
  );
  assert.equal(await value(p.id, 'aide'), 1, 'membre présent de l’équipe lanceuse');
  assert.equal(await value(contributor.id, 'aide'), 1, 'part au pot depuis une autre équipe');
  assert.equal(await value(ctx.players[5].id, 'aide'), 0, 'Gnomes B : ni présent ni au pot');
});

test('savoirs, veillée, voyage : espèces, biomes, série de semaines, chapitres clos, deux peuples', async () => {
  const p = ctx.players[6]; // Licornes A (index 6 % 4 = 2)
  await execute(
    `INSERT IGNORE INTO gl_learning_acknowledgements (reader_user_type, reader_user_id, target_type, target_code)
     VALUES ('gl_player', ?, 'species', 'sp-a'), ('gl_player', ?, 'species', 'sp-b'), ('gl_player', ?, 'species', 'sp-c'),
            ('gl_player', ?, 'biome', 'savane'), ('gl_player', ?, 'ecosystem', 'eco-1'), ('gl_player', ?, 'glossary', 'gl-1')`,
    [p.id, p.id, p.id, p.id, p.id, p.id].map(String),
  );
  assert.equal(await value(p.id, 'especes'), 3);
  assert.equal(await value(p.id, 'biomes'), 2);
  const z = await zoneId('cz-p1-01');
  for (const semaine of ['2026-W40', '2026-W41', '2026-W43']) {
    await execute(
      `INSERT INTO gl_game_chasse_ouvertures (game_id, zone_id, team_id, player_id, via, gain, semaine_iso, created_at)
       VALUES (?, ?, ?, ?, 'veillee', 0, ?, NOW())`,
      [ctx.game.id, z, p.teamId, p.id, semaine],
    );
  }
  assert.equal(await value(p.id, 'veillee'), 2, 'série 40-41, puis 43');
  assert.equal(await value(p.id, 'chapitres'), 0);
  assert.equal(await value(p.id, 'deux_peuples'), 0);
  // Une expédition gnome close : chapitre traversé + second peuple.
  const second = await createGlGameWithTeams({
    classId: ctx.cls.id,
    chapterId: ctx.chapter.id,
    name: `Partie close ${Date.now()}`,
    createdBy: ctx.admin.id,
    status: 'ended',
    teams: [{ name: 'Gnomes C', type: 'gnome' }],
  });
  await assignPlayerToGameTeam({
    gameId: second.game.id,
    teamId: second.teams[0].id,
    playerId: p.id,
  });
  assert.equal(await value(p.id, 'chapitres'), 1);
  assert.equal(await value(p.id, 'deux_peuples'), 1);
});

test('évaluation : paliers Fil → Nœud, idempotente, jamais de retrait, aucune ressource créditée', async () => {
  const p = ctx.players[3]; // 2 dons déjà faits (Fil à 1, Nœud à 3)
  const before = await readPlayerBourses(p.id);
  let awarded = await glRewards.evaluate(String(p.id), { families: ['cooperation'] });
  assert.ok(awarded.some((r) => r.key === 'cooperation.dons.1'));
  assert.ok(awarded.some((r) => r.key === 'cooperation.aide.1'));
  assert.ok(!awarded.some((r) => r.key === 'cooperation.dons.2'), 'Nœud attend le 3e don');
  assert.deepEqual(await glRewards.evaluate(String(p.id), { families: ['cooperation'] }), []);
  await execute(
    `INSERT INTO gl_market_dons (class_id, game_id, donneur_id, receveur_id, gemmes, coeurs, created_at) VALUES (?, ?, ?, ?, 1, 0, NOW())`,
    [ctx.cls.id, ctx.game.id, p.id, ctx.players[1].id],
  );
  awarded = await glRewards.evaluate(String(p.id), { families: ['cooperation'] });
  assert.deepEqual(
    awarded.map((r) => r.key),
    ['cooperation.dons.2'],
  );
  // Jamais de retrait : les dons disparaissent, le palier reste.
  await execute('DELETE FROM gl_market_dons WHERE donneur_id = ?', [p.id]);
  assert.deepEqual(await glRewards.evaluate(String(p.id), { families: ['cooperation'] }), []);
  const { progress } = await glRewards.buildProgress(String(p.id));
  const dons = progress.find((x) => x.key === 'cooperation.dons');
  assert.equal(dons.tier, 2, 'palier enregistré gardé');
  assert.equal(dons.nextThreshold, 8);
  assert.deepEqual(await readPlayerBourses(p.id), before, 'un badge ne donne aucune ressource');
  const total = await queryOne(
    'SELECT SUM(health_points) AS h, SUM(power_points) AS pw FROM gl_players WHERE class_id = ?',
    [ctx.cls.id],
  );
  await queueGlRewards(ctx.players.map((x) => x.id));
  const totalAfter = await queryOne(
    'SELECT SUM(health_points) AS h, SUM(power_points) AS pw FROM gl_players WHERE class_id = ?',
    [ctx.cls.id],
  );
  assert.deepEqual(totalAfter, total, 'somme des bourses inchangée autour d’une évaluation');
});

test('GET /api/gl/rewards/me : joueur seul, catalogue + paliers Fil/Nœud/Étoffe, aucune clé de classement ; seen', async () => {
  const p = ctx.players[3];
  const res = await request(app).get('/api/gl/rewards/me').set(auth(p.token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.enabled, true);
  assert.deepEqual(
    res.body.tiers.map((t) => t.label),
    ['Fil', 'Nœud', 'Étoffe'],
  );
  assert.equal(res.body.catalogue.length, 16);
  assert.ok(res.body.rewards.some((r) => r.key === 'cooperation.dons.2' && r.seen === false));
  assert.ok(res.body.families.some((f) => f.key === 'manuel'));
  assertNoRankingKeys(res.body);
  const staff = await request(app).get('/api/gl/rewards/me').set(auth(ctx.adminToken));
  assert.equal(staff.status, 403);
  const seen = await request(app).post('/api/gl/rewards/me/seen').set(auth(p.token));
  assert.equal(seen.status, 200);
  assert.ok(seen.body.seen >= 1);
  const again = await request(app).get('/api/gl/rewards/me').set(auth(p.token));
  assert.ok(again.body.rewards.every((r) => r.seen === true));
});

test('vitrine du prof : membres triés par nom, « à un pas », aucune clé de classement ; joueur refusé', async () => {
  const forbidden = await request(app)
    .get(`/api/gl/rewards/games/${ctx.game.id}`)
    .set(auth(ctx.players[0].token));
  assert.equal(forbidden.status, 403);
  const res = await request(app)
    .get(`/api/gl/rewards/games/${ctx.game.id}`)
    .set(auth(ctx.adminToken));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.players.length, ctx.players.length);
  const names = res.body.players.map((s) => s.name);
  assert.deepEqual(
    names,
    [...names].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
    'ordre alphabétique, jamais par nombre',
  );
  assert.ok(res.body.players.every((s) => typeof s.families === 'object'));
  // Le joueur 3 est à un don du palier Étoffe ? Non (8) ; les Fouilleurs à 4 fouilles : « à un pas ».
  assert.ok(Array.isArray(res.body.near));
  assert.ok(res.body.near.some((n) => n.key === 'chasse.fouilles' && n.remaining === 1));
  assertNoRankingKeys(res.body);
  assert.deepEqual(
    res.body.manualTypes.map((t) => t.key),
    ['manuel.chuchoteur', 'manuel.renard', 'manuel.esprit_equipe'],
  );
  const missing = await request(app).get('/api/gl/rewards/games/999999').set(auth(ctx.adminToken));
  assert.equal(missing.status, 404);
});

test('badge décerné : mot obligatoire (400), type inconnu (400), hors partie (404), numéroté (201)', async () => {
  const p = ctx.players[7];
  const url = `/api/gl/rewards/games/${ctx.game.id}/award`;
  const noNote = await request(app)
    .post(url)
    .set(auth(ctx.adminToken))
    .send({ playerId: p.id, type: 'esprit_equipe', note: '   ' });
  assert.equal(noNote.status, 400);
  const badType = await request(app)
    .post(url)
    .set(auth(ctx.adminToken))
    .send({ playerId: p.id, type: 'tisserand', note: 'Un mot' });
  assert.equal(badType.status, 400, 'réservé : jamais décerné');
  const stranger = await request(app)
    .post(url)
    .set(auth(ctx.adminToken))
    .send({ playerId: 999999, type: 'esprit_equipe', note: 'Un mot' });
  assert.equal(stranger.status, 404);
  const asPlayer = await request(app)
    .post(url)
    .set(auth(p.token))
    .send({ playerId: p.id, type: 'esprit_equipe', note: 'Un mot' });
  assert.equal(asPlayer.status, 403);
  const first = await request(app)
    .post(url)
    .set(auth(ctx.adminToken))
    .send({ playerId: p.id, type: 'esprit_equipe', note: 'Tu as laissé ta place.' });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.reward.key, 'manuel.esprit_equipe.1');
  assert.equal(first.body.reward.note, 'Tu as laissé ta place.');
  const second = await request(app)
    .post(url)
    .set(auth(ctx.adminToken))
    .send({ playerId: p.id, type: 'esprit_equipe', note: 'Encore une fois.' });
  assert.equal(second.body.reward.key, 'manuel.esprit_equipe.2');
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'badge' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.ok(evt, 'évènement privé « badge » au journal');
  assert.equal(JSON.parse(evt.payload_json).private, true);
});

test('routes héritées tenir/badges : déléguées au moteur commun, table héritée intacte', async () => {
  const p = ctx.players[8];
  const legacyBefore = await queryOne('SELECT COUNT(*) AS c FROM gl_player_badges');
  const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
  const badge = await request(app)
    .post(api('/tenir/badges'))
    .set(auth(ctx.adminToken))
    .send({ playerId: p.id, badgeCode: 'correcteur_du_renard' });
  assert.equal(badge.status, 201, JSON.stringify(badge.body));
  assert.equal(badge.body.reward.key, 'manuel.renard.1');
  const again = await request(app)
    .post(api('/tenir/badges'))
    .set(auth(ctx.adminToken))
    .send({ playerId: p.id, badgeCode: 'correcteur_du_renard' });
  assert.equal(again.status, 200);
  assert.equal(again.body.awarded, false);
  const reserved = await request(app)
    .post(api('/tenir/badges'))
    .set(auth(ctx.adminToken))
    .send({ playerId: p.id, badgeCode: 'tisserand' });
  assert.equal(reserved.status, 409);
  const evaluer = await request(app).post(api('/tenir/badges/evaluer')).set(auth(p.token));
  assert.equal(evaluer.status, 200);
  assert.ok(Array.isArray(evaluer.body.badges));
  const legacyAfter = await queryOne('SELECT COUNT(*) AS c FROM gl_player_badges');
  assert.equal(Number(legacyAfter.c), Number(legacyBefore.c), 'plus aucune écriture héritée');
});

test('badge décerné à une équipe présente (mission, Olu corrigé) : absents exclus', async () => {
  const team = ctx.teams[1]; // Gnomes B : joueurs 1, 5, 9
  const absent = ctx.players[5];
  await execute(
    'INSERT IGNORE INTO gl_game_round_absences (game_id, round_number, player_id) VALUES (?, 7, ?)',
    [ctx.game.id, absent.id],
  );
  const out = await awardGlManualToTeam(ctx.game.id, team.id, {
    type: 'chuchoteur',
    note: 'Mission secrète réussie avec ton équipe.',
    awardedBy: String(ctx.admin.id),
    roundNumber: 7,
  });
  const ids = out.map((o) => Number(o.playerId)).sort((a, b) => a - b);
  assert.deepEqual(
    ids,
    [ctx.players[1].id, ctx.players[9].id].sort((a, b) => a - b),
  );
  const rows = await queryAll(
    "SELECT player_id FROM gl_player_rewards WHERE reward_key LIKE 'manuel.chuchoteur.%'",
  );
  assert.ok(!rows.some((r) => Number(r.player_id) === absent.id));
});

test('module éteint : /api/gl/rewards répond 503 ; les crochets continuent en silence', async () => {
  await setGlSetting('modules.rewards_enabled', false);
  invalidateModulesCache();
  const res = await request(app).get('/api/gl/rewards/me').set(auth(ctx.players[0].token));
  assert.equal(res.status, 503);
  const award = await request(app)
    .post(`/api/gl/rewards/games/${ctx.game.id}/award`)
    .set(auth(ctx.adminToken))
    .send({ playerId: ctx.players[0].id, type: 'esprit_equipe', note: 'Un mot' });
  assert.equal(award.status, 503);
  const awarded = await glRewards.evaluate(String(ctx.players[0].id), { families: ['chasse'] });
  assert.ok(Array.isArray(awarded));
  await setGlSetting('modules.rewards_enabled', true);
  invalidateModulesCache();
});
