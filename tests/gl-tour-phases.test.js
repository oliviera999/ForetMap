'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { createTenirGame } = require('./helpers/glTenirFixtures');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
});

async function setSurface(surface) {
  await execute('UPDATE gl_games SET tenir_surface = ?, tenir_overrides_json = ? WHERE id = ?', [
    surface,
    JSON.stringify({ surface }),
    ctx.game.id,
  ]);
}

async function placeTeams(indexes) {
  for (let i = 0; i < ctx.teams.length; i += 1) {
    await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
      ctx.markers[indexes[i]].id,
      ctx.teams[i].id,
    ]);
  }
}

test('POST /turn/next renvoie 409 sur une partie « tenir » (le tour est à phases)', async () => {
  await execute(
    "INSERT INTO gl_settings (`key`, value_json, updated_at) VALUES ('gameplay.turns_enabled', 'true', NOW()) ON DUPLICATE KEY UPDATE value_json = 'true'",
  );
  require('../lib/glSettings').invalidateGameplayCache();
  const res = await request(app).post(api('/turn/next')).set(auth(ctx.adminToken));
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'TENIR_TOUR');
});

test('ouvrir : ordre inverse du plateau (retard d’abord, égalité → id), équipe active en tableau', async () => {
  await setSurface('tableau');
  await placeTeams([5, 2, 2, 8]);
  const res = await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.roundNumber, 1);
  const [t0, t1, t2, t3] = ctx.teams.map((t) => Number(t.id));
  assert.deepEqual(res.body.ordre, [t1, t2, t0, t3]);
  assert.equal(res.body.equipeActiveId, t1);
  assert.equal(res.body.ventTeamId, null, 'pas de vent au tour 1');
  const forbidden = await request(app)
    .post(api('/tenir/tour/ouvrir'))
    .set(auth(ctx.players[0].token));
  assert.equal(forbidden.status, 403);
  const again = await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken));
  assert.equal(again.status, 409, 'tour précédent non clos');
});

test('phases dans l’ordre : jeu, souffle, clos ; un saut ou un retour est refusé', async () => {
  const skip = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle' });
  assert.equal(skip.status, 409);
  const jeu = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'jeu' });
  assert.equal(jeu.status, 200, JSON.stringify(jeu.body));
  const back = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'jeu' });
  assert.equal(back.status, 409);
  const view = await request(app).get(api('/tenir/tour')).set(auth(ctx.players[0].token));
  assert.equal(view.status, 200);
  assert.equal(view.body.round.phase, 'jeu');
  assert.equal(view.body.round.operateurs, null, 'opérateurs réservés au prof');
});

test('tableau : un élève ne lance jamais ; le prof lance pour l’équipe active seulement', async () => {
  const player = ctx.players.find((p) => p.teamId === Number(ctx.teams[1].id));
  const refused = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(player.token))
    .send({ mode: 'serveur' });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.code, 'TENIR_PERMISSION');
  const ok = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'serveur', teamId: ctx.teams[1].id });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.total >= 2 && ok.body.total <= 12, true);
  const next = await request(app)
    .post(api('/tenir/tour/equipe-suivante'))
    .set(auth(ctx.adminToken));
  assert.equal(next.status, 200);
  assert.equal(next.body.equipeActiveId, Number(ctx.teams[2].id));
});

test('souffle puis clos : passeur et dé gris posés, tour fermé', async () => {
  const souffle = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', faces: [4] });
  assert.equal(souffle.status, 200, JSON.stringify(souffle.body));
  assert.equal(souffle.body.souffle.total, 4 + 4, '1d6 saisi + bonus plateau 1 = 4');
  assert.ok(souffle.body.passeur && souffle.body.passeur.feuilletCode, 'mot du Passeur');
  const badFace = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos', faces: [9] });
  assert.equal(badFace.status, 200, 'les faces ne servent qu’au souffle');
  const round = await queryOne(
    'SELECT phase, ended_at FROM gl_game_rounds WHERE game_id = ? AND round_number = 1',
    [ctx.game.id],
  );
  assert.equal(round.phase, 'clos');
  assert.ok(round.ended_at);
});

test('tour 2 : vent de la caravane si une seule équipe est dernière ; pas de vent à égalité', async () => {
  await placeTeams([6, 3, 6, 9]);
  const r2 = await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken));
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(r2.body.ventTeamId, Number(ctx.teams[1].id));
  const moved = await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [
    ctx.teams[1].id,
  ]);
  assert.equal(Number(moved.position_marker_id), ctx.markers[6].id, '+3 cases');
  assert.equal(r2.body.ordre[0], Number(ctx.teams[1].id), 'elle joue en premier malgré le vent');
  for (const phase of ['jeu', 'souffle', 'clos']) {
    await request(app)
      .post(api('/tenir/tour/phase'))
      .set(auth(ctx.adminToken))
      .send({ phase, dort: true });
  }
  await placeTeams([4, 4, 7, 9]);
  const r3 = await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken));
  assert.equal(r3.body.ventTeamId, null, 'deux dernières à égalité : pas de vent');
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'jeu' });
});

test('tablette : deux équipes lancent en parallèle (verrou par équipe), la même équipe deux fois → 409', async () => {
  await setSurface('tablette');
  const a = ctx.players.find((p) => p.teamId === Number(ctx.teams[0].id));
  const b = ctx.players.find((p) => p.teamId === Number(ctx.teams[2].id));
  const [ra, rb] = await Promise.all([
    request(app).post(api('/tenir/lancer')).set(auth(a.token)).send({ mode: 'serveur' }),
    request(app).post(api('/tenir/lancer')).set(auth(b.token)).send({ mode: 'serveur' }),
  ]);
  assert.equal(ra.status, 201, JSON.stringify(ra.body));
  assert.equal(rb.status, 201, JSON.stringify(rb.body));
  const again = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(a.token))
    .send({ mode: 'serveur' });
  assert.equal(again.status, 409);
  assert.equal(again.body.code, 'DICE_ALREADY_ROLLED');
});

test('geste hors phase « jeu » → 409 TENIR_PHASE ; absences enregistrées (privées)', async () => {
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true });
  const d = ctx.players.find((p) => p.teamId === Number(ctx.teams[3].id));
  const refused = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(d.token))
    .send({ mode: 'serveur' });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, 'TENIR_PHASE');
  const abs = await request(app)
    .post(api('/tenir/tour/absences'))
    .set(auth(ctx.adminToken))
    .send({ playerIds: [d.id] });
  assert.equal(abs.status, 200);
  const profView = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken));
  assert.deepEqual(profView.body.round.absences, [d.id]);
  const playerView = await request(app).get(api('/tenir/tour')).set(auth(d.token));
  assert.equal(playerView.body.round.absences, 1, 'un élève ne voit que le nombre');
  const journal = await request(app).get(`/api/gl/journal/games/${ctx.game.id}`).set(auth(d.token));
  const evt = journal.body.events.find((e) => e.eventType === 'absences');
  assert.equal(evt.payload.playerIds, undefined);
  assert.equal(evt.payload.count, 1);
});
