'use strict';

/**
 * « Tenir à deux » v2 — Olu commentateur et erreur du jour (spec § 13) : une erreur tirée par
 * tour, correction journalisée (`olu_corrige`) par l'équipe désignée, Lumière seulement si
 * activée, dite en fin de tour si personne ne corrige. Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const { createTenirGame, ouvrirTourEnJeu } = require('./helpers/glTenirFixtures');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;

before(async () => {
  await initSchema();
  await execute(
    `INSERT INTO gl_tenir_olu_lignes (id, moment, expression, texte, variables_json, correction, actif) VALUES
      ('olu-t-err', 'erreur', 'explique', 'Le manchot vole très bien, c’est connu.', '[]', 'Le manchot ne vole pas ; il « vole » sous l’eau.', 1),
      ('olu-t-jet', 'jet', 'joie', '{equipe} avance de {n} cases.', '["equipe","n"]', NULL, 1)
     ON DUPLICATE KEY UPDATE actif = 1`,
  );
  ctx = await createTenirGame({ stamp: Date.now() });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
});

test('une erreur du jour par tour, servie à l’ouverture ; la correction ne sort pas avant', async () => {
  await ouvrirTourEnJeu(request, app, ctx, { phase: 'ouverture' });
  const tour = await request(app).get(api('/tenir/tour')).set(auth(ctx.players[0].token));
  assert.equal(tour.status, 200);
  assert.ok(tour.body.round.oluErreur?.texte);
  assert.equal(tour.body.round.oluErreur.correction, undefined, 'la correction reste cachée');
  const lignes = await request(app).get(api('/tenir/olu')).set(auth(ctx.players[0].token));
  assert.ok(lignes.body.lignes.every((l) => l.correction === undefined));
  assert.equal(lignes.body.moments.dice_roll, 'jet');
});

test('corrigé par une équipe : événement olu_corrige avec la correction ; pas de Lumière si désactivée ; une seule fois', async () => {
  const team = ctx.teams[1];
  const res = await request(app)
    .post(api('/tenir/tour/olu-corrige'))
    .set(auth(ctx.adminToken))
    .send({ teamId: team.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'olu_corrige' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(evt.payload_json);
  assert.equal(Number(payload.teamId), team.id);
  assert.ok(payload.correction);
  const lumiere = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type LIKE 'lumiere%'",
    [ctx.game.id],
  );
  assert.equal(lumiere.length, 0, 'Lumière désactivée : rien');
  const again = await request(app)
    .post(api('/tenir/tour/olu-corrige'))
    .set(auth(ctx.adminToken))
    .send({ teamId: ctx.teams[2].id });
  assert.equal(again.status, 409);
});

test('personne ne corrige : la correction est dite au passage en « clos »', async () => {
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'jeu' })
    .expect(200);
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true })
    .expect(200);
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true })
    .expect(200);
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  const evts = await queryAll(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'olu_corrige' ORDER BY id ASC",
    [ctx.game.id],
  );
  assert.equal(evts.length, 2);
  const last = JSON.parse(evts[1].payload_json);
  assert.equal(last.teamId, null, 'dite par Olu, sans équipe');
  assert.equal(last.roundNumber, 2);
});
