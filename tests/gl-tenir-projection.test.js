'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema } = require('../database');
const { createTenirGame } = require('./helpers/glTenirFixtures');

let ctx;
let other;
let token = '';
const auth = (t) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  other = await createTenirGame({ stamp: Date.now() + 7 });
});

test('le MJ émet un jeton de projection (12 h) ; un joueur ne le peut pas', async () => {
  const refused = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/projection-token`)
    .set(auth(ctx.players[0].token));
  assert.equal(refused.status, 403);
  const res = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/projection-token`)
    .set(auth(ctx.adminToken));
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.token);
  assert.match(res.body.url, /gl\.html\?projection=/);
  token = res.body.token;
});

test('lectures OK sans aucune bourse, polygone ni motif', async () => {
  const state = await request(app).get(`/api/gl/games/${ctx.game.id}`).set(auth(token));
  assert.equal(state.status, 200, JSON.stringify(state.body));
  const raw = JSON.stringify(state.body);
  assert.ok(!raw.includes('healthPoints'));
  assert.ok(!raw.includes('powerPoints'));
  assert.ok(!raw.includes('polygone'));
  assert.deepEqual(state.body.vitality?.byPlayerId || {}, {});
  assert.equal(state.body.tenir.enabled, true);
  assert.equal(state.body.tenir.permissions.lire, false);
  const tenir = await request(app).get(`/api/gl/games/${ctx.game.id}/tenir`).set(auth(token));
  assert.equal(tenir.status, 200);
  assert.deepEqual(tenir.body.retraits, []);
  const tour = await request(app).get(`/api/gl/games/${ctx.game.id}/tenir/tour`).set(auth(token));
  assert.equal(tour.status, 200);
  const journal = await request(app).get(`/api/gl/journal/games/${ctx.game.id}`).set(auth(token));
  assert.equal(journal.status, 200);
  const olu = await request(app).get(`/api/gl/games/${ctx.game.id}/tenir/olu`).set(auth(token));
  assert.equal(olu.status, 200);
});

test('toute écriture reste 403 ; une autre partie est refusée', async () => {
  const write = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/tenir/lancer`)
    .set(auth(token))
    .send({ mode: 'serveur' });
  assert.equal(write.status, 403);
  const vit = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/vitality/player`)
    .set(auth(token))
    .send({ playerId: ctx.players[0].id, healthDelta: 1, reason: 'x' });
  assert.equal(vit.status, 403);
  const market = await request(app).get('/api/gl/market/classmates').set(auth(token));
  assert.equal(market.status, 403);
  const otherGame = await request(app).get(`/api/gl/games/${other.game.id}`).set(auth(token));
  assert.equal(otherGame.status, 403);
  const otherTenir = await request(app)
    .get(`/api/gl/games/${other.game.id}/tenir`)
    .set(auth(token));
  assert.equal(otherTenir.status, 403);
});

test('révocation : un nouveau jeton invalide le précédent ; `revoke` coupe tout', async () => {
  const renewed = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/projection-token`)
    .set(auth(ctx.adminToken));
  assert.equal(renewed.status, 201);
  const old = await request(app).get(`/api/gl/games/${ctx.game.id}`).set(auth(token));
  assert.equal(old.status, 403);
  const fresh = await request(app)
    .get(`/api/gl/games/${ctx.game.id}`)
    .set(auth(renewed.body.token));
  assert.equal(fresh.status, 200);
  const revoke = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/projection-token`)
    .set(auth(ctx.adminToken))
    .send({ revoke: true });
  assert.equal(revoke.status, 200);
  const gone = await request(app).get(`/api/gl/games/${ctx.game.id}`).set(auth(renewed.body.token));
  assert.equal(gone.status, 403);
});
