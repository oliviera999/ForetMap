'use strict';

/**
 * « Tenir à deux » — équilibrage du 7 novembre 2026 (migration 337), un test par réglage,
 * activé et désactivé :
 * - E1 `tenir_voile_bonus_par_plateau` {1:3, 2:4, 3:5, 4:6}, migration conditionnelle ;
 * - E2 `tenir_fouilles_reparation_gnome` : fouille de réparation d'une équipe gnome, page pâlie
 *   seulement (`FOUILLE_REPARATION_SEULEMENT`), comptée dans le quota affiché ;
 * - E3 `tenir_palissement_rang_plancher` : une zone de rang < plancher ne pâlit pas avant que le
 *   voile atteigne le plancher ;
 * - E4 `tenir_surplus_reserve` : surplus au plafond → réserve de la caravane, visible de l'équipe
 *   et du prof, jamais en projection ; la réserve paie le pot d'un sort en premier ; remise à
 *   zéro au Seuil ; invariants (somme du livre = bourses + réserves, réserve ≥ 0) ;
 * - E5 `tenir_olu_bourse_pleine` : une fois par séance, à l'écran d'équipe seulement.
 * Fixtures anonymes (`joueur-a-<stamp>`…).
 */

require('./helpers/setup');
const fs = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, queryAll, withTransaction } = db;
const { DEFAULT_GAMEPLAY, getGameplaySettings } = require('../lib/glSettings');
const { resolveTenirSettings, resolveVoileBonus, surplusReserveActif } = require('../lib/glTenir');
const { applyPlayerVitalityDelta } = require('../lib/glVitality');
const { loadReserve, listReserves } = require('../lib/glBourses');
const { checkTenirInvariantsFromDb, checkTenirInvariants } = require('../lib/glTenirInvariants');
const { EVENT_MOMENTS } = require('../lib/glTenirOlu');
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
  setPlayerBourses,
  readPlayerBourses,
  setGlSetting,
} = require('./helpers/glTenirFixtures');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (ctx, p) => `/api/gl/games/${ctx.game.id}${p}`;
const stamp = Date.now();

async function zoneId(zoneKey) {
  const row = await queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ? LIMIT 1', [
    zoneKey,
  ]);
  return Number(row.id);
}

async function setPageEtat(ctx, zoneKey, etat) {
  const id = await zoneId(zoneKey);
  await execute(
    `INSERT INTO gl_game_chasse_pages (game_id, zone_id, etat, updated_at) VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE etat = VALUES(etat), trouvee_par_team_id = NULL, tenue_par_team_id = NULL, updated_at = NOW()`,
    [ctx.game.id, id, etat],
  );
}

async function pageEtat(ctx, zoneKey) {
  const id = await zoneId(zoneKey);
  const row = await queryOne(
    'SELECT etat FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ? LIMIT 1',
    [ctx.game.id, id],
  );
  return row ? String(row.etat) : null;
}

async function bonneReponse(question) {
  const row = await queryOne(
    'SELECT choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte FROM gl_qcm_questions WHERE question_code = ?',
    [question.questionCode],
  );
  const text = row[`choix_${String(row.reponse_correcte).toLowerCase()}`];
  return question.choices.find((c) => c.text === text);
}

/** Nouvelle partie prête (tour ouvert en phase jeu), zones d'exemple du plateau 1. */
async function nouvellePartie(suffix, settings = {}) {
  const ctx = await createTenirGame({ stamp: `${stamp}-${suffix}`, plateau: 1, settings });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api(ctx, '/tenir')).set(auth(ctx.adminToken)).expect(200);
  // Pas de chapardeur dans ces parties : il brouillerait les soldes attendus.
  await execute('UPDATE gl_game_tenir_state SET chapardeur_round = 99 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  await ouvrirTourEnJeu(request, app, ctx);
  return ctx;
}

const membres = (ctx, teamIndex) =>
  ctx.players.filter((p) => Number(p.teamId) === Number(ctx.teams[teamIndex].id));

before(async () => {
  await initSchema();
});

after(async () => {
  await setGlSetting('gameplay.tenir_fouilles_reparation_gnome', 1);
  await setGlSetting('gameplay.tenir_palissement_rang_plancher', 8);
  await setGlSetting('gameplay.tenir_surplus_reserve', true);
  await setGlSetting('gameplay.tenir_olu_bourse_pleine', true);
});

// ---------------------------------------------------------------- E1
test('E1 : le dé gris vaut 1d6 + {3,4,5,6} par défaut (code, fichier de réglages, base), migration conditionnelle', async () => {
  assert.deepEqual(DEFAULT_GAMEPLAY.tenirVoileBonusParPlateau, { 1: 3, 2: 4, 3: 5, 4: 6 });
  const fichier = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, '..', 'data', 'gl', 'tenir', 'reglages-defaut.json'),
      'utf8',
    ),
  );
  assert.deepEqual(fichier.defaut.voile_bonus_par_plateau, { 1: 3, 2: 4, 3: 5, 4: 6 });
  assert.equal(fichier.defaut.fouilles_reparation_gnome, 1);
  assert.equal(fichier.defaut.palissement_rang_plancher, 8);
  assert.equal(fichier.defaut.surplus_reserve, true);
  assert.equal(fichier.defaut.olu_bourse_pleine, true);

  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '337_gl_tenir_equilibrage.sql'),
    'utf8',
  );
  const updateE1 = migration
    .split(/;\s*\n/)
    .find((stmt) => /UPDATE gl_settings/.test(stmt) && /tenir_voile_bonus_par_plateau/.test(stmt));
  assert.ok(updateE1, 'la migration porte le UPDATE conditionnel E1');
  const key = 'gameplay.tenir_voile_bonus_par_plateau';
  const current = await queryOne('SELECT value_json FROM gl_settings WHERE `key` = ?', [key]);
  try {
    // Ancien défaut → nouveau défaut.
    await setGlSetting(key, { 1: 4, 2: 4, 3: 5, 4: 6 });
    await execute(updateE1);
    assert.deepEqual(
      JSON.parse(
        (await queryOne('SELECT value_json FROM gl_settings WHERE `key` = ?', [key])).value_json,
      ),
      { 1: 3, 2: 4, 3: 5, 4: 6 },
    );
    // Valeur retouchée par le MJ → jamais écrasée.
    await setGlSetting(key, { 1: 2, 2: 2, 3: 2, 4: 2 });
    await execute(updateE1);
    assert.deepEqual(
      JSON.parse(
        (await queryOne('SELECT value_json FROM gl_settings WHERE `key` = ?', [key])).value_json,
      ),
      { 1: 2, 2: 2, 3: 2, 4: 2 },
    );
    const settings = await getGameplaySettings({ forceRefresh: true });
    assert.equal(
      resolveVoileBonus(resolveTenirSettings(settings, { tenir_profil: 'complet' }), 1),
      2,
    );
  } finally {
    if (current)
      await execute('UPDATE gl_settings SET value_json = ? WHERE `key` = ?', [
        current.value_json,
        key,
      ]);
    else await execute('DELETE FROM gl_settings WHERE `key` = ?', [key]);
    const { invalidateGameplayCache } = require('../lib/glSettings');
    invalidateGameplayCache();
  }
  const settings = await getGameplaySettings({ forceRefresh: true });
  assert.equal(
    resolveVoileBonus(resolveTenirSettings(settings, { tenir_profil: 'complet' }), 1),
    3,
  );
  assert.equal(
    resolveVoileBonus(resolveTenirSettings(settings, { tenir_profil: 'complet' }), 4),
    6,
  );
});

// ---------------------------------------------------------------- E2
test('E2 : une équipe gnome a une fouille de réparation, seulement sur une page pâlie ; comptée dans le quota ; 0 pour les licornes et quand le réglage vaut 0', async () => {
  const ctx = await nouvellePartie('e2');
  const gnome = membres(ctx, 0)[0];
  const licorne = membres(ctx, 2)[0];
  // Sans page pâlie : pas de fouille de réparation.
  let carnet = await request(app).get(api(ctx, '/chasse')).set(auth(gnome.token)).expect(200);
  assert.deepEqual(
    { q: carnet.body.fouilles.quota, r: carnet.body.fouilles.reparation.quota },
    { q: 1, r: 0 },
  );
  await setPageEtat(ctx, 'cz-p1-02', 'palie');
  carnet = await request(app).get(api(ctx, '/chasse')).set(auth(gnome.token)).expect(200);
  assert.deepEqual(
    {
      q: carnet.body.fouilles.quota,
      r: carnet.body.fouilles.reparation.quota,
      rr: carnet.body.fouilles.reparation.restantes,
    },
    { q: 1, r: 1, rr: 1 },
    '« 1 + 1 réparation »',
  );
  const carnetLicorne = await request(app)
    .get(api(ctx, '/chasse'))
    .set(auth(licorne.token))
    .expect(200);
  assert.deepEqual(
    { q: carnetLicorne.body.fouilles.quota, r: carnetLicorne.body.fouilles.reparation.quota },
    { q: 2, r: 0 },
    'une équipe licorne ne répare pas',
  );
  // La console du tour (prof) voit le quota par équipe.
  const tour = await request(app)
    .get(api(ctx, '/tenir/tour'))
    .set(auth(ctx.adminToken))
    .expect(200);
  const carteGnome = tour.body.teams.find((t) => Number(t.id) === Number(ctx.teams[0].id));
  assert.equal(carteGnome.fouilles.reparation.quota, 1);

  // 1. Fouille générale à côté : consomme la fouille de base.
  const f1 = await request(app)
    .post(api(ctx, '/chasse/fouiller'))
    .set(auth(gnome.token))
    .send({ x: 0.9, y: 0.9 });
  assert.equal(f1.status, 201, JSON.stringify(f1.body));
  assert.deepEqual(
    {
      r: f1.body.fouilles.restantes,
      rep: f1.body.fouilles.reparation.restantes,
      flag: f1.body.reparation,
    },
    { r: 0, rep: 1, flag: false },
  );
  // 2. Une seconde fouille à côté : la fouille bonus ne vise qu'une page pâlie.
  const f2 = await request(app)
    .post(api(ctx, '/chasse/fouiller'))
    .set(auth(gnome.token))
    .send({ x: 0.9, y: 0.85 });
  assert.equal(f2.status, 409);
  assert.equal(f2.body.code, 'FOUILLE_REPARATION_SEULEMENT');
  // 3. Sur la page pâlie : la fouille de réparation est consommée, une question est posée.
  const f3 = await request(app)
    .post(api(ctx, '/chasse/fouiller'))
    .set(auth(gnome.token))
    .send({ x: 0.55, y: 0.3 });
  assert.equal(f3.status, 201, JSON.stringify(f3.body));
  assert.equal(f3.body.verdict, 'zone');
  assert.equal(f3.body.reparation, true);
  assert.ok(f3.body.question?.presentationToken);
  assert.equal(f3.body.fouilles.reparation.restantes, 0);
  const empreintes = await queryOne(
    'SELECT COUNT(*) AS n, SUM(reparation) AS r FROM gl_game_chasse_empreintes WHERE game_id = ? AND team_id = ?',
    [ctx.game.id, ctx.teams[0].id],
  );
  assert.deepEqual({ n: Number(empreintes.n), r: Number(empreintes.r) }, { n: 2, r: 1 });
  // 4. Plus rien.
  const f4 = await request(app)
    .post(api(ctx, '/chasse/fouiller'))
    .set(auth(gnome.token))
    .send({ x: 0.55, y: 0.31 });
  assert.equal(f4.status, 409);
  assert.equal(f4.body.code, 'FOUILLES_EPUISEES');
  // Invariant « fouilles du tour ≤ quota » tenu.
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id);
  assert.deepEqual(inv.violations, []);
  const f = inv.snapshot.fouilles.find((x) => Number(x.teamId) === Number(ctx.teams[0].id));
  assert.deepEqual(
    { n: f.n, rep: f.nReparation, q: f.quotaMax, qr: f.quotaReparation },
    { n: 2, rep: 1, q: 1, qr: 1 },
  );
  // Réponse juste sur la page pâlie : réparée, +1 cœur par Gnome (règle § 5).
  const right = await bonneReponse(f3.body.question);
  const avant = await readPlayerBourses(gnome.id);
  const rep = await request(app).post(api(ctx, '/chasse/repondre')).set(auth(gnome.token)).send({
    presentationToken: f3.body.question.presentationToken,
    questionCode: f3.body.question.questionCode,
    choiceId: right.id,
  });
  assert.equal(rep.status, 200, JSON.stringify(rep.body));
  assert.equal(rep.body.etat, 'reparee');
  assert.equal((await readPlayerBourses(gnome.id)).health, avant.health + 1);

  // Désactivé : plus de fouille de réparation, même avec une page pâlie.
  await setGlSetting('gameplay.tenir_fouilles_reparation_gnome', 0);
  await setPageEtat(ctx, 'cz-p1-01', 'palie');
  carnet = await request(app).get(api(ctx, '/chasse')).set(auth(gnome.token)).expect(200);
  assert.equal(carnet.body.fouilles.reparation.quota, 0);
  await setGlSetting('gameplay.tenir_fouilles_reparation_gnome', 1);
});

// ---------------------------------------------------------------- E3
test('E3 : plancher de pâlissement — une zone proche du départ ne pâlit pas avant que le voile atteigne le plancher ; 0 = comportement d’avant', async () => {
  const ctx = await nouvellePartie('e3');
  await execute("UPDATE gl_chasse_zones SET rang_case = 2 WHERE zone_key = 'cz-p1-01'");
  await execute("UPDATE gl_chasse_zones SET rang_case = 7 WHERE zone_key = 'cz-p1-02'");
  // Voile : −1 + 2 + 3 (bonus plateau 1) = 4 ; plancher 8 → rien ne pâlit.
  await request(app)
    .post(api(ctx, '/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', faces: [2] })
    .expect(200);
  const state = await queryOne('SELECT voile_position FROM gl_game_tenir_state WHERE game_id = ?', [
    ctx.game.id,
  ]);
  assert.equal(Number(state.voile_position), 4);
  assert.equal(await pageEtat(ctx, 'cz-p1-01'), 'endormie', 'rang 2 traité comme 8 > 4');
  assert.equal(await pageEtat(ctx, 'cz-p1-02'), 'endormie');
  // Tour suivant, plancher désactivé : 4 + 1 + 3 = 8 → les deux zones (rangs 2 et 7) pâlissent.
  await request(app)
    .post(api(ctx, '/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  await setGlSetting('gameplay.tenir_palissement_rang_plancher', 0);
  await ouvrirTourEnJeu(request, app, ctx);
  await request(app)
    .post(api(ctx, '/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', faces: [1] })
    .expect(200);
  assert.equal(await pageEtat(ctx, 'cz-p1-01'), 'palie');
  assert.equal(await pageEtat(ctx, 'cz-p1-02'), 'palie');
  await setGlSetting('gameplay.tenir_palissement_rang_plancher', 8);
  // Le rang affiché ne change pas : le plancher ne touche que le pâlissement.
  const carnet = await request(app).get(api(ctx, '/chasse')).set(auth(ctx.adminToken)).expect(200);
  assert.equal(carnet.body.pages.find((p) => p.zoneKey === 'cz-p1-01').rangCase, 2);
});

// ---------------------------------------------------------------- E4
test('E4 : le surplus au plafond va à la réserve de la caravane ; visible de l’équipe et du prof, jamais en projection ; la réserve paie le pot en premier ; remise à zéro au Seuil', async () => {
  const ctx = await nouvellePartie('e4');
  const gnomes = membres(ctx, 0); // 3 membres
  const licornes = membres(ctx, 2); // 2 membres
  for (const p of gnomes) await setPlayerBourses(p.id, 8, 3);
  for (const p of licornes) await setPlayerBourses(p.id, 3, 8);
  const initial = {};
  for (const p of ctx.players) initial[p.id] = await readPlayerBourses(p.id);

  // Page trouvée par les Gnomes, tenue par les Licornes : +1 à chaque membre des deux équipes,
  // tous au plafond de leur ressource → tout part en réserve (3 cœurs, 2 gemmes).
  const f = await request(app)
    .post(api(ctx, '/chasse/fouiller'))
    .set(auth(gnomes[0].token))
    .send({ x: 0.35, y: 0.3 });
  assert.equal(f.status, 201, JSON.stringify(f.body));
  const right = await bonneReponse(f.body.question);
  const rep = await request(app)
    .post(api(ctx, '/chasse/repondre'))
    .set(auth(gnomes[0].token))
    .send({
      presentationToken: f.body.question.presentationToken,
      questionCode: f.body.question.questionCode,
      choiceId: right.id,
    });
  assert.equal(rep.status, 200, JSON.stringify(rep.body));
  assert.equal(rep.body.etat, 'trouvee');
  const ouvert = await request(app)
    .post(api(ctx, '/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(licornes[0].token));
  assert.equal(ouvert.status, 200, JSON.stringify(ouvert.body));
  assert.equal(ouvert.body.peutTenir, true);
  const bonne = ouvert.body.question.choices.find((c) => c.text === 'Que la forêt respire');
  const tenue = await request(app)
    .post(api(ctx, '/chasse/pages/cz-p1-01/tenir'))
    .set(auth(licornes[0].token))
    .send({
      presentationToken: ouvert.body.question.presentationToken,
      questionCode: ouvert.body.question.questionCode,
      choiceId: bonne.id,
    });
  assert.equal(tenue.status, 200, JSON.stringify(tenue.body));
  for (const p of [...gnomes, ...licornes]) {
    assert.deepEqual(
      await readPlayerBourses(p.id),
      initial[p.id],
      'au plafond : la bourse ne bouge pas',
    );
  }
  assert.deepEqual(await loadReserve(db, ctx.game.id, ctx.teams[0].id), {
    teamId: Number(ctx.teams[0].id),
    health: 3,
    power: 0,
  });
  assert.deepEqual(await loadReserve(db, ctx.game.id, ctx.teams[2].id), {
    teamId: Number(ctx.teams[2].id),
    health: 0,
    power: 2,
  });
  const entrees = await queryAll(
    "SELECT team_id, delta_health, delta_power FROM gl_resource_ledger WHERE game_id = ? AND kind = 'reserve' AND cause = 'reserve_entree' ORDER BY id",
    [ctx.game.id],
  );
  assert.equal(entrees.length, 5, 'une ligne de réserve par surplus');
  const inv1 = await checkTenirInvariantsFromDb(db, ctx.game.id);
  assert.deepEqual(inv1.violations, []);
  assert.equal(inv1.snapshot.reserves.length, 4);

  // Visibilité : son équipe pour l'élève, tout pour le prof, rien en projection.
  const vueGnome = await request(app)
    .get(api(ctx, '/tenir'))
    .set(auth(gnomes[0].token))
    .expect(200);
  assert.deepEqual(vueGnome.body.reserves, [
    { teamId: Number(ctx.teams[0].id), health: 3, power: 0 },
  ]);
  const vueProf = await request(app).get(api(ctx, '/tenir')).set(auth(ctx.adminToken)).expect(200);
  assert.equal(vueProf.body.reserves.length, 4);
  const jeton = await request(app)
    .post(api(ctx, '/projection-token'))
    .set(auth(ctx.adminToken))
    .expect(201);
  const vueProjection = await request(app)
    .get(api(ctx, '/tenir'))
    .set(auth(jeton.body.token))
    .expect(200);
  assert.deepEqual(vueProjection.body.reserves, []);

  // Le pot d'un sort puise d'abord la réserve : Lanterne (2 gemmes, Licornes) payée par la
  // réserve seule, aucune gemme retirée aux membres.
  const d = await request(app)
    .post(api(ctx, '/spell-casts/drafts'))
    .set(auth(licornes[0].token))
    .send({ spellCode: 'SL037', teamId: ctx.teams[2].id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  assert.deepEqual(
    d.body.draft.reserve && { g: d.body.draft.reserve.gems, h: d.body.draft.reserve.hearts },
    { g: 2, h: 0 },
  );
  assert.deepEqual(d.body.draft.requiredAfterReserve, { gems: 0, hearts: 0 });
  assert.equal(d.body.draft.ready, true, 'rien à verser : la réserve couvre tout');
  const l = await request(app)
    .post(api(ctx, `/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(licornes[0].token));
  assert.equal(l.status, 200, JSON.stringify(l.body));
  for (const p of licornes) assert.equal((await readPlayerBourses(p.id)).power, 8);
  assert.equal((await loadReserve(db, ctx.game.id, ctx.teams[2].id)).power, 0);
  const sortie = await queryOne(
    "SELECT COUNT(*) AS n FROM gl_resource_ledger WHERE game_id = ? AND cause = 'reserve_sortie'",
    [ctx.game.id],
  );
  assert.equal(Number(sortie.n), 1);
  const inv2 = await checkTenirInvariantsFromDb(db, ctx.game.id);
  assert.deepEqual(inv2.violations, []);

  // Seuil : la réserve des Gnomes (3 cœurs) s'éteint, sans transfert.
  await request(app).post(api(ctx, '/end')).set(auth(ctx.adminToken)).expect(200);
  assert.deepEqual(
    (await listReserves(db, ctx.game.id)).map((r) => r.health + r.power),
    [0, 0, 0, 0],
  );
  const seuil = await queryOne(
    "SELECT SUM(delta_health) AS dh FROM gl_resource_ledger WHERE game_id = ? AND cause = 'reserve_seuil'",
    [ctx.game.id],
  );
  assert.equal(Number(seuil.dh), -3);
  for (const p of gnomes)
    assert.equal((await readPlayerBourses(p.id)).health, 8, 'aucun transfert');
  const inv3 = await checkTenirInvariantsFromDb(db, ctx.game.id);
  assert.deepEqual(inv3.violations, []);
});

test('E4 désactivé : le surplus est perdu comme avant ; invariants purs de la réserve', async () => {
  const ctx = await nouvellePartie('e4off');
  const gnome = membres(ctx, 0)[0];
  await setPlayerBourses(gnome.id, 8, 3);
  await withTransaction(async (tx) => {
    await applyPlayerVitalityDelta(tx, {
      playerId: gnome.id,
      healthDelta: 1,
      caps: { maxHealth: 8, maxPower: 8 },
      cause: 'page_tenue',
      gameId: ctx.game.id,
      reserveTeamId: null,
    });
  });
  assert.equal((await loadReserve(db, ctx.game.id, ctx.teams[0].id)).health, 0);
  await setGlSetting('gameplay.tenir_surplus_reserve', false);
  const settings = await getGameplaySettings({ forceRefresh: true });
  assert.equal(surplusReserveActif(resolveTenirSettings(settings, ctx.game)), false);
  const vue = await request(app).get(api(ctx, '/tenir')).set(auth(gnome.token)).expect(200);
  assert.equal(vue.body.settings.surplus_reserve, false);
  await setGlSetting('gameplay.tenir_surplus_reserve', true);

  // Invariants purs : réserve négative, livre de réserve incohérent, total bourses + réserves.
  const snap = {
    caps: { maxHealth: 8, maxPower: 8 },
    players: [{ id: 1, teamId: 10, health: 8, power: 3, initialHealth: 8, initialPower: 3 }],
    teams: [{ id: 10, type: 'gnome', pathIndex: 1 }],
    campIndex: 11,
    voilePosition: -1,
    pages: [],
    ledger: [
      {
        playerId: 1,
        kind: 'bourse',
        deltaHealth: 0,
        deltaPower: 0,
        soldeHealthApres: 8,
        soldePowerApres: 3,
        cause: 'page_tenue',
      },
      {
        playerId: 1,
        kind: 'reserve',
        teamId: 10,
        deltaHealth: 1,
        deltaPower: 0,
        soldeHealthApres: 1,
        soldePowerApres: 0,
        cause: 'reserve_entree',
      },
    ],
    reserves: [{ teamId: 10, health: 1, power: 0 }],
    fouilles: [
      { roundNumber: 1, teamId: 10, n: 2, nReparation: 1, quotaMax: 1, quotaReparation: 1 },
    ],
    relances: [],
    relancesMax: 1,
  };
  assert.deepEqual(checkTenirInvariants(snap).violations, []);
  const codes = (s) => checkTenirInvariants(s).violations.map((v) => v.code);
  assert.ok(
    codes({ ...snap, reserves: [{ teamId: 10, health: -1, power: 0 }] }).includes(
      'RESERVE_NEGATIVE',
    ),
  );
  assert.ok(
    codes({ ...snap, reserves: [{ teamId: 10, health: 2, power: 0 }] }).includes('RESERVE_LIVRE'),
  );
  assert.ok(
    codes({ ...snap, reserves: [{ teamId: 10, health: 2, power: 0 }] }).includes('LIVRE_TOTAL'),
    'rien ne se perd entre bourses et réserves',
  );
  assert.ok(
    codes({
      ...snap,
      fouilles: [
        { roundNumber: 1, teamId: 10, n: 3, nReparation: 1, quotaMax: 1, quotaReparation: 1 },
      ],
    }).includes('FOUILLES_QUOTA'),
  );
  assert.ok(
    codes({
      ...snap,
      fouilles: [
        { roundNumber: 1, teamId: 10, n: 2, nReparation: 2, quotaMax: 1, quotaReparation: 1 },
      ],
    }).includes('FOUILLES_QUOTA'),
  );
});

// ---------------------------------------------------------------- E5
test('E5 : Olu signale les bourses pleines une fois par séance, à l’écran d’équipe seulement ; désactivable', async () => {
  assert.equal(EVENT_MOMENTS.olu_bourse_pleine, 'bourse_pleine');
  // Catalogue d'Olu chargé depuis data/gl/tenir/ (la base de test n'est pas synchronisée au démarrage).
  const { runImports } = require('../scripts/gl-import-tenir');
  const [rapport] = await runImports(db, {
    fichier: 'olu-lignes',
    dossier: path.join(__dirname, '..', 'data', 'gl', 'tenir'),
  });
  assert.deepEqual(rapport.errors, []);
  const lignes = await queryAll(
    "SELECT id, texte FROM gl_tenir_olu_lignes WHERE moment = 'bourse_pleine' AND actif = 1",
  );
  assert.ok(lignes.length >= 3, 'trois lignes au moins dans olu-lignes.json');
  const ctx = await nouvellePartie('e5');
  const gnomes = membres(ctx, 0);
  const compter = async () =>
    Number(
      (
        await queryOne(
          "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND event_type = 'olu_bourse_pleine'",
          [ctx.game.id],
        )
      ).n,
    );
  // Deux membres au plafond : rien.
  await setPlayerBourses(gnomes[0].id, 8, 3);
  await setPlayerBourses(gnomes[1].id, 8, 3);
  await request(app).get(api(ctx, '/tenir')).set(auth(gnomes[0].token)).expect(200);
  assert.equal(await compter(), 0);
  // Trois membres au plafond de leur ressource (cœurs pour des Gnomes) : une fois.
  await setPlayerBourses(gnomes[2].id, 8, 3);
  await request(app).get(api(ctx, '/tenir')).set(auth(gnomes[0].token)).expect(200);
  await request(app).get(api(ctx, '/tenir')).set(auth(gnomes[1].token)).expect(200);
  assert.equal(await compter(), 1, 'une seule fois par séance et par équipe');
  const evt = await queryOne(
    "SELECT team_id, payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'olu_bourse_pleine' LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(Number(evt.team_id), Number(ctx.teams[0].id));
  // La projection et le prof ne déclenchent rien ; le journal d'un autre élève ne porte pas les détails.
  const jeton = await request(app)
    .post(api(ctx, '/projection-token'))
    .set(auth(ctx.adminToken))
    .expect(201);
  await request(app).get(api(ctx, '/tenir')).set(auth(jeton.body.token)).expect(200);
  await request(app).get(api(ctx, '/tenir')).set(auth(ctx.adminToken)).expect(200);
  assert.equal(await compter(), 1);
  const journal = await request(app)
    .get(`/api/gl/journal/games/${ctx.game.id}`)
    .set(auth(membres(ctx, 2)[0].token))
    .expect(200);
  assert.ok(!/auPlafond/.test(JSON.stringify(journal.body)), 'payload privé expurgé');
  // Séance suivante : Olu peut le redire une fois.
  await request(app)
    .post(api(ctx, '/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', faces: [1] })
    .expect(200);
  await request(app)
    .post(api(ctx, '/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
  await request(app).get(api(ctx, '/tenir')).set(auth(gnomes[0].token)).expect(200);
  assert.equal(await compter(), 2);
  // Désactivé : plus rien, même au tour suivant.
  await setGlSetting('gameplay.tenir_olu_bourse_pleine', false);
  await request(app)
    .post(api(ctx, '/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', faces: [1] })
    .expect(200);
  await request(app)
    .post(api(ctx, '/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
  await request(app).get(api(ctx, '/tenir')).set(auth(gnomes[0].token)).expect(200);
  assert.equal(await compter(), 2);
  await setGlSetting('gameplay.tenir_olu_bourse_pleine', true);
});
