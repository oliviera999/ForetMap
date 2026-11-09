'use strict';

/**
 * « Tenir à deux » — arrivée en suspens (sort Relance, `lib/glArriveeSuspendue.js`).
 * Après un jet, tant que l'équipe peut lancer Relance, la case d'arrivée s'affiche sans
 * s'appliquer. Elle s'applique d'office quand la partie avance (une autre équipe jette,
 * changement de phase) ; elle ne se suspend pas quand Relance est impossible (bourses trop
 * maigres, module des sorts éteint). Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll, queryOne } = require('../database');
const {
  createTenirGame,
  ouvrirTourEnJeu,
  setGlSetting,
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');
const { invalidateModulesCache } = require('../lib/glSettings');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
// Équipes : 0 Gnomes A (joueurs 0, 4, 8), 1 Gnomes B (1, 5, 9), 2 Licornes A (2, 6), 3 Licornes B (3, 7).
const team = (i) => ctx.teams[i];

async function jet(teamIndex, faces) {
  return request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'physique', teamId: team(teamIndex).id, faces });
}

async function suspens(teamId) {
  const rows = await queryAll(
    "SELECT payload_json FROM gl_game_tenir_effets WHERE game_id = ? AND team_id = ? AND kind = 'arrivee_suspendue' ORDER BY id DESC",
    [ctx.game.id, teamId],
  );
  return rows.map((r) => JSON.parse(r.payload_json));
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 1 });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
});

after(async () => {
  await setGlSetting('modules.spell_cast_enabled', true);
  invalidateModulesCache();
});

test('une autre équipe qui jette applique d’office l’arrivée restée en suspens', async () => {
  const a = await jet(0, [1, 1]);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.arrival?.enSuspens, true, JSON.stringify(a.body.arrival));
  assert.equal((await suspens(team(0).id))[0].issue, undefined);

  const b = await jet(2, [2, 1]);
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(b.body.arrival?.enSuspens, true);
  assert.equal((await suspens(team(0).id))[0].issue, 'appliquee', 'le jet de A est gardé d’office');
  const gardee = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'arrivee_gardee' ORDER BY id DESC LIMIT 1",
    [ctx.game.id, team(0).id],
  );
  assert.equal(JSON.parse(gardee.payload_json).motif, 'auto');
});

test('la fin de la phase « jeu » applique l’arrivée restée en suspens', async () => {
  const phase = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true });
  assert.equal(phase.status, 200, JSON.stringify(phase.body));
  assert.equal((await suspens(team(2).id))[0].issue, 'appliquee');
  const vue = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken)).expect(200);
  assert.deepEqual(vue.body.round.arriveesEnSuspens, []);
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('pas de suspension quand l’équipe ne peut pas payer Relance', async () => {
  for (const i of [1, 5, 9]) await setPlayerBourses(ctx.players[i].id, 0, 0);
  await setPlayerBourses(ctx.players[1].id, 1, 1);
  await execute('UPDATE gl_teams SET last_dice_round_number = 0 WHERE id = ?', [team(1).id]);
  const r = await jet(1, [1, 2]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.notEqual(r.body.arrival?.enSuspens, true, 'case appliquée aussitôt');
  assert.equal((await suspens(team(1).id)).length, 0);
});

test('pas de suspension quand le module des sorts est éteint', async () => {
  await setGlSetting('modules.spell_cast_enabled', false);
  invalidateModulesCache();
  const r = await jet(3, [1, 1]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.notEqual(r.body.arrival?.enSuspens, true);
  assert.equal((await suspens(team(3).id)).length, 0);
});
