'use strict';

/**
 * Ensemble unifié, PR 1a, étape 1.2 — case Souffle (M3, 17 novembre 2026) :
 * - l'arrêt sur une case Souffle pose « un seul dé au prochain tour » (oui / non, sans cumul) ;
 * - ni recul, ni tour passé, ni ressource retirée ; l'écran et la projection le disent ;
 * - le premier lancer d'un tour suivant se joue à un dé (serveur : un dé tiré ; physique : une
 *   face saisie), l'état se consomme ; dans le tour de pose, on lance encore deux dés ;
 * - une Relance (sort) relance ce seul dé ;
 * - l'état s'efface au camp et à la clôture de la partie.
 * Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, withTransaction } = db;
const tour = require('../lib/glTour');
const { createTenirGame, ouvrirTourEnJeu } = require('./helpers/glTenirFixtures');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (ctx, p) => `/api/gl/games/${ctx.game.id}${p}`;
const stamp = Date.now();

async function phase(ctx, p, extra = {}) {
  await request(app)
    .post(api(ctx, '/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: p, ...extra })
    .expect(200);
}

async function tourSuivant(ctx) {
  await phase(ctx, 'souffle', { dort: true });
  await phase(ctx, 'clos');
  await ouvrirTourEnJeu(request, app, ctx);
}

async function etat(teamId) {
  return queryOne(
    'SELECT un_de_prochain_tour, un_de_round, un_de_joue_round FROM gl_teams WHERE id = ?',
    [teamId],
  );
}

async function vueEquipe(ctx, teamId) {
  const vue = await request(app).get(api(ctx, '/tenir/tour')).set(auth(ctx.adminToken)).expect(200);
  return vue.body.teams.find((t) => Number(t.id) === Number(teamId));
}

async function nouvellePartie(suffix) {
  const ctx = await createTenirGame({ stamp: `${stamp}-${suffix}`, plateau: 1 });
  await request(app).get(api(ctx, '/tenir')).set(auth(ctx.adminToken)).expect(200);
  await execute('UPDATE gl_game_tenir_state SET chapardeur_round = 99 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  return ctx;
}

/** Porte l'équipe sur « Souffle 1 » (repère 4) par une avance libre du prof depuis le repère 3. */
async function arreterSurSouffle(ctx, team) {
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[3].id,
    team.id,
  ]);
  const res = await request(app)
    .post(api(ctx, '/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'libre', cases: 1, motif: 'test un seul dé', teamId: team.id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res;
}

before(async () => {
  await initSchema();
});

test('arrêt sur une case Souffle : « un seul dé au prochain tour », sans recul ni ressource retirée', async () => {
  const ctx = await nouvellePartie('pose');
  const licornes = ctx.teams[2];
  await ouvrirTourEnJeu(request, app, ctx);
  const avant = await queryOne(
    `SELECT SUM(p.power_points) AS g, SUM(p.health_points) AS h FROM gl_players p
       INNER JOIN gl_team_members tm ON tm.player_id = p.id AND tm.game_id = ? AND tm.team_id = ?`,
    [ctx.game.id, licornes.id],
  );
  const res = await arreterSurSouffle(ctx, licornes);
  assert.equal(res.body.arrival?.unDe, true);
  assert.match(String(res.body.arrival?.effectSummary || ''), /un seul dé|qu’un dé/);
  assert.equal(res.body.arrival?.tourPasse, undefined, 'plus de tour passé');
  const team = await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [
    licornes.id,
  ]);
  assert.equal(Number(team.position_marker_id), Number(ctx.markers[4].id), 'aucun recul');
  const apres = await queryOne(
    `SELECT SUM(p.power_points) AS g, SUM(p.health_points) AS h FROM gl_players p
       INNER JOIN gl_team_members tm ON tm.player_id = p.id AND tm.game_id = ? AND tm.team_id = ?`,
    [ctx.game.id, licornes.id],
  );
  assert.deepEqual(apres, avant, 'aucune ressource retirée');
  const e = await etat(licornes.id);
  assert.equal(Number(e.un_de_prochain_tour), 1);
  const evt = await queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'un_de_pose'",
    [ctx.game.id, licornes.id],
  );
  assert.equal(Number(evt.n), 1);
  const passe = await queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_tenir_effets WHERE game_id = ? AND kind = 'tour_passe'",
    [ctx.game.id],
  );
  assert.equal(Number(passe.n), 0);
  // Écran et projection : visible de tous ; dans le tour de pose, le prochain lancer reste à 2 dés.
  const vue = await vueEquipe(ctx, licornes.id);
  assert.deepEqual({ u: vue.unDe, d: vue.desProchainJet }, { u: true, d: 2 });
  const projection = await request(app)
    .get(api(ctx, '/tenir/tour'))
    .set(auth(ctx.players[0].token))
    .expect(200);
  assert.equal(projection.body.teams.find((t) => Number(t.id) === Number(licornes.id)).unDe, true);
  // Une seconde case Souffle avant le tour suivant ne se cumule pas.
  await withTransaction(async (tx) => {
    const events = await tour.poserUnDeTx(tx, {
      gameId: ctx.game.id,
      teamId: licornes.id,
      roundNumber: Number(e.un_de_round),
      marker: ctx.markers[10],
    });
    assert.deepEqual(events, [], 'déjà posé : rien de plus');
  });
  assert.equal(Number((await etat(licornes.id)).un_de_prochain_tour), 1);
});

test('tour suivant : un seul dé tiré par l’app, l’état se consomme ; le tour d’après, deux dés', async () => {
  const ctx = await nouvellePartie('serveur');
  const licornes = ctx.teams[2];
  const licorne = ctx.players.find((p) => Number(p.teamId) === Number(licornes.id));
  await ouvrirTourEnJeu(request, app, ctx);
  await arreterSurSouffle(ctx, licornes);
  await tourSuivant(ctx);
  assert.equal((await vueEquipe(ctx, licornes.id)).desProchainJet, 1);
  const jet = await request(app)
    .post(api(ctx, '/tenir/lancer'))
    .set(auth(licorne.token))
    .send({ mode: 'serveur' });
  assert.equal(jet.status, 201, JSON.stringify(jet.body));
  assert.ok(jet.body.total >= 1 && jet.body.total <= 6, 'un seul dé : de 1 à 6');
  const roll = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'dice_roll' ORDER BY id DESC LIMIT 1",
    [ctx.game.id, licornes.id],
  );
  const payload = JSON.parse(roll.payload_json);
  assert.equal(payload.faces.length, 1);
  assert.equal(payload.unDe, true);
  const joue = await queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'un_de_joue'",
    [ctx.game.id, licornes.id],
  );
  assert.equal(Number(joue.n), 1);
  const e = await etat(licornes.id);
  assert.equal(Number(e.un_de_prochain_tour), 0, 'l’état est consommé');
  const vue = await vueEquipe(ctx, licornes.id);
  assert.equal(vue.unDe, false);
  // Le tour d'après : deux dés (sauf si le seul dé l'a posée sur l'autre case Souffle).
  const surSouffle =
    Number(
      (await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [licornes.id]))
        .position_marker_id,
    ) === Number(ctx.markers[10].id);
  await tourSuivant(ctx);
  assert.equal((await vueEquipe(ctx, licornes.id)).desProchainJet, surSouffle ? 1 : 2);
});

test('dés physiques : une seule face attendue ; deux faces refusées sans rien consommer', async () => {
  const ctx = await nouvellePartie('physique');
  const gnomes = ctx.teams[0];
  await ouvrirTourEnJeu(request, app, ctx);
  await arreterSurSouffle(ctx, gnomes);
  await tourSuivant(ctx);
  const deux = await request(app)
    .post(api(ctx, '/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'physique', faces: [3, 4], teamId: gnomes.id });
  assert.equal(deux.status, 400, JSON.stringify(deux.body));
  assert.equal(Number((await etat(gnomes.id)).un_de_prochain_tour), 1, 'rien consommé');
  const une = await request(app)
    .post(api(ctx, '/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'physique', faces: [3], teamId: gnomes.id });
  assert.equal(une.status, 201, JSON.stringify(une.body));
  assert.equal(une.body.total, 3);
  assert.equal(Number((await etat(gnomes.id)).un_de_prochain_tour), 0);
});

test('Relance (sort) : relance ce seul dé ; une relance de case se joue à deux dés', async () => {
  const ctx = await nouvellePartie('relance');
  const gnomes = ctx.teams[1];
  await ouvrirTourEnJeu(request, app, ctx);
  const round = Number(
    (await queryOne('SELECT current_round_number AS r FROM gl_games WHERE id = ?', [ctx.game.id]))
      .r,
  );
  // Le seul dé a été joué ce tour ; une Relance (sort) attend.
  await execute('UPDATE gl_teams SET un_de_joue_round = ? WHERE id = ?', [round, gnomes.id]);
  await execute(
    `INSERT INTO gl_game_tenir_effets (game_id, round_number, kind, team_id, payload_json, created_at)
     VALUES (?, ?, 'relance', ?, '{}', NOW())`,
    [ctx.game.id, round, gnomes.id],
  );
  const n = await tour.desPourJet(db, {
    gameId: ctx.game.id,
    teamId: gnomes.id,
    roundNumber: round,
    desCount: 2,
  });
  assert.equal(n, 1, 'la Relance relance le seul dé');
  // Sans Relance en attente (relance de case), deux dés.
  await execute(
    "UPDATE gl_game_tenir_effets SET payload_json = '{\"consomme\":1}' WHERE game_id = ? AND kind = 'relance'",
    [ctx.game.id],
  );
  assert.equal(
    await tour.desPourJet(db, {
      gameId: ctx.game.id,
      teamId: gnomes.id,
      roundNumber: round,
      desCount: 2,
    }),
    2,
  );
  // Pur : posé à un tour antérieur → un dé ; posé ce tour → pas encore.
  assert.equal(tour.unDeEnAttente({ un_de_prochain_tour: 1, un_de_round: 2 }, 3), true);
  assert.equal(tour.unDeEnAttente({ un_de_prochain_tour: 1, un_de_round: 3 }, 3), false);
  assert.equal(tour.unDeEnAttente({ un_de_prochain_tour: 0, un_de_round: 1 }, 3), false);
});

test('l’état s’efface au camp et à la clôture de la partie', async () => {
  const ctx = await nouvellePartie('camp');
  const gnomes = ctx.teams[0];
  const licornes = ctx.teams[2];
  await ouvrirTourEnJeu(request, app, ctx);
  await arreterSurSouffle(ctx, gnomes);
  await arreterSurSouffle(ctx, licornes);
  // Gnomes : avance libre jusqu'au camp.
  const camp = ctx.markers.length - 1;
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[camp - 1].id,
    gnomes.id,
  ]);
  const res = await request(app)
    .post(api(ctx, '/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'libre', cases: 1, motif: 'vers le camp', teamId: gnomes.id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(Number((await etat(gnomes.id)).un_de_prochain_tour), 0, 'effacé au camp');
  assert.equal(Number((await etat(licornes.id)).un_de_prochain_tour), 1);
  // Clôture : plus rien ne reste posé.
  await withTransaction(async (tx) => tour.effacerUnDeTx(tx, { gameId: ctx.game.id }));
  assert.equal(Number((await etat(licornes.id)).un_de_prochain_tour), 0);
});
