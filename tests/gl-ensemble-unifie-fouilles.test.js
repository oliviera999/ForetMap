'use strict';

/**
 * Ensemble unifié, PR 1a, étape 1.1 — fouilles (M2, 17 novembre 2026) :
 * - 2 fouilles par équipe et par tour pour les deux peuples, 1 sous le voile (sauf Abri) ;
 * - une zone pâlie ne se fouille que par une équipe gnome : le refus d'une licorne ne consomme
 *   rien ; la fouille de réparation en plus a disparu ;
 * - seule une fouille licorne « pas encore » révèle la zone à la classe ; une fouille gnome
 *   « pas encore » ne révèle rien ;
 * - crédit de la révélation : carnet de la classe, sceau licorne (pages trouvées + révélées).
 * Fixtures anonymes (`joueur-a-<stamp>`…).
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne } = db;
const { DEFAULT_GAMEPLAY, GL_SETTINGS_REGISTRY } = require('../lib/glSettings');
const { resolveFouillesParTour, resolveFouillesSousVoile } = require('../lib/glTenir');
const { computeHonneurs } = require('../lib/glHonneurs');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
} = require('./helpers/glTenirFixtures');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (ctx, p) => `/api/gl/games/${ctx.game.id}${p}`;
const stamp = Date.now();
// Zones d'exemple du plateau 1 : cz-p1-01 autour de (0.35, 0.3), cz-p1-02 autour de (0.55, 0.3).
const Z1 = { x: 0.35, y: 0.3 };
const Z2 = { x: 0.55, y: 0.3 };
const LOIN = { x: 0.9, y: 0.9 };

async function zoneId(zoneKey) {
  const row = await queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ? LIMIT 1', [
    zoneKey,
  ]);
  return Number(row.id);
}

async function setPageEtat(ctx, zoneKey, etat) {
  await execute(
    `INSERT INTO gl_game_chasse_pages (game_id, zone_id, etat, updated_at) VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE etat = VALUES(etat), trouvee_par_team_id = NULL,
       tenue_par_team_id = NULL, revelee_par_team_id = NULL, updated_at = NOW()`,
    [ctx.game.id, await zoneId(zoneKey), etat],
  );
}

async function page(ctx, zoneKey) {
  return queryOne(
    'SELECT etat, revelee_par_team_id, revelee_round FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ?',
    [ctx.game.id, await zoneId(zoneKey)],
  );
}

async function mauvaiseReponse(question) {
  const row = await queryOne(
    'SELECT choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte FROM gl_qcm_questions WHERE question_code = ?',
    [question.questionCode],
  );
  const juste = row[`choix_${String(row.reponse_correcte).toLowerCase()}`];
  return question.choices.find((c) => c.text !== juste);
}

async function nouvellePartie(suffix) {
  const ctx = await createTenirGame({ stamp: `${stamp}-${suffix}`, plateau: 1 });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api(ctx, '/tenir')).set(auth(ctx.adminToken)).expect(200);
  await execute('UPDATE gl_game_tenir_state SET chapardeur_round = 99 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  await ouvrirTourEnJeu(request, app, ctx);
  return ctx;
}

const membre = (ctx, teamIndex) =>
  ctx.players.find((p) => Number(p.teamId) === Number(ctx.teams[teamIndex].id));
const fouiller = (ctx, joueur, point) =>
  request(app).post(api(ctx, '/chasse/fouiller')).set(auth(joueur.token)).send(point);

before(async () => {
  await initSchema();
});

test('réglages : 2 fouilles par tour, 1 sous le voile ; les anciennes clés ont disparu', () => {
  assert.equal(DEFAULT_GAMEPLAY.tenirFouillesParTour, 2);
  assert.equal(DEFAULT_GAMEPLAY.tenirFouillesSousVoile, 1);
  assert.equal(resolveFouillesParTour({ fouilles_par_tour: 3 }), 3);
  // Une ancienne valeur objet retombe au défaut, sans planter.
  assert.equal(resolveFouillesParTour({ fouilles_par_tour: { gnome: 1, unicorn: 2 } }), 2);
  assert.equal(resolveFouillesSousVoile({}), 1);
  assert.equal(GL_SETTINGS_REGISTRY['gameplay.tenir_fouilles_reparation_gnome'], undefined);
  assert.equal(GL_SETTINGS_REGISTRY['gameplay.tenir_fouille_sous_voile'], undefined);
  const fichier = require('../data/gl/tenir/reglages-defaut.json');
  assert.equal(fichier.defaut.fouilles_par_tour, 2);
  assert.equal(fichier.defaut.fouilles_sous_voile, 1);
});

test('quotas : 2 fouilles pour une équipe gnome comme pour une licorne, puis plus rien', async () => {
  const ctx = await nouvellePartie('quotas');
  for (const i of [0, 2]) {
    const joueur = membre(ctx, i);
    const carnet = await request(app).get(api(ctx, '/chasse')).set(auth(joueur.token)).expect(200);
    assert.deepEqual([carnet.body.fouilles.quota, carnet.body.fouilles.restantes], [2, 2]);
    assert.equal(carnet.body.fouilles.reparation, undefined, 'plus de fouille de réparation');
    for (const y of [0.9, 0.85]) {
      const f = await fouiller(ctx, joueur, { x: 0.9, y });
      assert.equal(f.status, 201, JSON.stringify(f.body));
    }
    const f3 = await fouiller(ctx, joueur, { x: 0.9, y: 0.8 });
    assert.equal(f3.status, 409);
    assert.equal(f3.body.code, 'FOUILLES_EPUISEES');
  }
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id);
  assert.deepEqual(inv.violations, []);
});

test('sous le voile : 1 fouille par tour (jamais 0) ; Abri rend le quota entier', async () => {
  const ctx = await nouvellePartie('voile');
  await execute('UPDATE gl_game_tenir_state SET voile_position = 30 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  const licorne = membre(ctx, 2);
  const carnet = await request(app).get(api(ctx, '/chasse')).set(auth(licorne.token)).expect(200);
  assert.equal(carnet.body.fouilles.quota, 1);
  assert.equal((await fouiller(ctx, licorne, LOIN)).status, 201);
  assert.equal((await fouiller(ctx, licorne, { x: 0.9, y: 0.8 })).status, 409);
  // Abri sur l'équipe gnome : elle garde ses deux fouilles sous le voile.
  const game = await queryOne('SELECT current_round_number FROM gl_games WHERE id = ?', [
    ctx.game.id,
  ]);
  await execute(
    `INSERT INTO gl_game_tenir_effets (game_id, round_number, team_id, kind, payload_json, created_at)
     VALUES (?, ?, ?, 'abri', '{}', NOW())`,
    [ctx.game.id, Number(game.current_round_number) || 1, ctx.teams[0].id],
  );
  const gnome = membre(ctx, 0);
  const abri = await request(app).get(api(ctx, '/chasse')).set(auth(gnome.token)).expect(200);
  assert.equal(abri.body.fouilles.quota, 2);
});

test('zone pâlie : refus licorne sans perte ; une équipe gnome la répare avec une fouille ordinaire', async () => {
  const ctx = await nouvellePartie('palie');
  await setPageEtat(ctx, 'cz-p1-02', 'palie');
  const licorne = membre(ctx, 2);
  const refus = await fouiller(ctx, licorne, Z2);
  assert.equal(refus.status, 201, JSON.stringify(refus.body));
  assert.equal(refus.body.verdict, 'palie');
  assert.equal(refus.body.message, 'Cette zone a pâli : les Gnomes savent la réparer.');
  const apres = await request(app).get(api(ctx, '/chasse')).set(auth(licorne.token)).expect(200);
  assert.equal(apres.body.fouilles.restantes, 2, 'aucune fouille consommée');

  const gnome = membre(ctx, 0);
  const f = await fouiller(ctx, gnome, Z2);
  assert.equal(f.status, 201, JSON.stringify(f.body));
  assert.equal(f.body.verdict, 'zone');
  assert.ok(f.body.question?.presentationToken);
  assert.equal(f.body.fouilles.restantes, 1, 'une fouille ordinaire est consommée');
});

test('révélation : une fouille licorne « pas encore » révèle la zone, une fouille gnome non', async () => {
  const ctx = await nouvellePartie('revelation');
  const gnome = membre(ctx, 0);
  const f = await fouiller(ctx, gnome, Z1);
  assert.equal(f.status, 201, JSON.stringify(f.body));
  const faux = await mauvaiseReponse(f.body.question);
  const r = await request(app).post(api(ctx, '/chasse/repondre')).set(auth(gnome.token)).send({
    presentationToken: f.body.question.presentationToken,
    questionCode: f.body.question.questionCode,
    choiceId: faux.id,
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.correct, false);
  assert.equal(r.body.etat, 'endormie', 'une fouille gnome « pas encore » ne révèle rien');
  assert.equal(String((await page(ctx, 'cz-p1-01')).etat), 'endormie');

  const licorne = membre(ctx, 2);
  const f2 = await fouiller(ctx, licorne, Z2);
  assert.equal(f2.status, 201, JSON.stringify(f2.body));
  const faux2 = await mauvaiseReponse(f2.body.question);
  const r2 = await request(app).post(api(ctx, '/chasse/repondre')).set(auth(licorne.token)).send({
    presentationToken: f2.body.question.presentationToken,
    questionCode: f2.body.question.questionCode,
    choiceId: faux2.id,
  });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(r2.body.etat, 'revelee');
  const p2 = await page(ctx, 'cz-p1-02');
  assert.equal(String(p2.etat), 'revelee');
  assert.equal(Number(p2.revelee_par_team_id), Number(ctx.teams[2].id));
  assert.ok(Number(p2.revelee_round) >= 1);

  // Carnet de la classe : « révélée par » l'équipe licorne.
  const carnet = await request(app).get(api(ctx, '/chasse')).set(auth(gnome.token)).expect(200);
  const item = carnet.body.pages.find((p) => p.zoneKey === 'cz-p1-02');
  assert.equal(item.reveleePar?.id, Number(ctx.teams[2].id));

  // Sceau licorne : pages trouvées + zones révélées.
  const { sceaux, stats } = await computeHonneurs(db, ctx.game.id);
  const st = stats.find((s) => s.teamId === Number(ctx.teams[2].id));
  assert.equal(st.revelees, 1);
  const eclaireuses = sceaux.find((s) => s.honneur === 'eclaireuses');
  assert.equal(eclaireuses?.teamId, Number(ctx.teams[2].id));
});
