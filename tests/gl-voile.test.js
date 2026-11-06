'use strict';

/**
 * « Tenir à deux » v2 — le voile (spec § 7) : avance en phase souffle (dé + bonus, jamais
 * au-delà du camp −1), équipes recouvertes (fouilles à 0, pages trouvées non lues qui pâlissent,
 * plafond), zones endormies recouvertes → pâlies, « le voile dort », reculs bornés à −1,
 * aucune ressource retirée. Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, withTransaction } = db;
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
  readPlayerBourses,
} = require('./helpers/glTenirFixtures');
const { retreatVoileTx } = require('../lib/glVoile');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;

async function zoneId(zoneKey) {
  return Number(
    (await queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ?', [zoneKey])).id,
  );
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  // Rangs de case connus : cz-p1-01 près du départ, cz-p1-02 près du camp.
  await execute('UPDATE gl_chasse_zones SET rang_case = 2 WHERE zone_key = ?', ['cz-p1-01']);
  await execute('UPDATE gl_chasse_zones SET rang_case = 10 WHERE zone_key = ?', ['cz-p1-02']);
  // Licornes A ont trouvé cz-p1-02 sans l'avoir lue ; Gnomes B sont loin devant (case 9).
  await execute(
    "UPDATE gl_game_chasse_pages SET etat = 'trouvee', trouvee_par_team_id = ? WHERE game_id = ? AND zone_id = ?",
    [ctx.teams[2].id, ctx.game.id, await zoneId('cz-p1-02')],
  );
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[9].id,
    ctx.teams[1].id,
  ]);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('phase souffle : position = min(position + dé + bonus, camp − 1) ; équipes recouvertes ; zones pâlies ; pages pâlissent', async () => {
  const avant = await readPlayerBourses(ctx.players[2].id);
  const res = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', faces: [3] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body.souffle, { faces: [3], bonus: 4, total: 7, dort: false });
  const state = await queryOne(
    'SELECT voile_position, voile_last_roll_round FROM gl_game_tenir_state WHERE game_id = ?',
    [ctx.game.id],
  );
  assert.equal(Number(state.voile_position), 6, '−1 + 7');
  assert.equal(Number(state.voile_last_roll_round), 1);
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'voile_avance' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(evt.payload_json);
  assert.deepEqual(
    payload.teamsUnderVoile.sort(),
    [ctx.teams[0].id, ctx.teams[2].id, ctx.teams[3].id].sort(),
    'Gnomes B (case 9) hors du voile',
  );
  assert.deepEqual(payload.zonesPalies, ['cz-p1-01'], 'rang 2 ≤ 6 → pâlie ; rang 10 non');
  assert.deepEqual(payload.pagesPalies, [
    { zoneKey: 'cz-p1-02', teamId: ctx.teams[2].id, pct: 10 },
  ]);
  assert.deepEqual(
    await readPlayerBourses(ctx.players[2].id),
    avant,
    'le voile ne retire jamais de ressource',
  );
  const page = await queryOne(
    'SELECT etat FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ?',
    [ctx.game.id, await zoneId('cz-p1-01')],
  );
  assert.equal(page.etat, 'palie');
  const carnet = await request(app).get(api('/chasse')).set(auth(ctx.players[2].token));
  assert.equal(carnet.body.voilePosition, 6);
  assert.equal(carnet.body.pages.find((p) => p.zoneKey === 'cz-p1-02').palissementPct, 10);
  assert.equal(carnet.body.pages.find((p) => p.zoneKey === 'cz-p1-01').etat, 'palie');
});

test('sous le voile : fouilles à 0 (409) ; une équipe hors du voile fouille ; une zone pâlie est réservée aux gnomes', async () => {
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
  const sous = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(ctx.players[2].token))
    .send({ x: 0.9, y: 0.9 });
  assert.equal(sous.status, 409, JSON.stringify(sous.body));
  assert.equal(sous.body.code, 'FOUILLES_EPUISEES');
  assert.equal(sous.body.sousVoile, true);
  assert.equal(sous.body.fouilles.quota, 0);
  const carnet = await request(app).get(api('/chasse')).set(auth(ctx.players[2].token));
  assert.equal(carnet.body.fouilles.sousVoile, true);

  const libre = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(ctx.players[1].token))
    .send({ x: 0.9, y: 0.9 });
  assert.equal(libre.status, 201, JSON.stringify(libre.body));

  // Zone pâlie : une licorne (même hors du voile) n'y peut rien ; un gnome la répare.
  await execute('UPDATE gl_game_tenir_state SET voile_position = -1 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  const licorne = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(ctx.players[3].token))
    .send({ x: 0.35, y: 0.3 });
  assert.equal(licorne.status, 201);
  assert.equal(licorne.body.verdict, 'palie');
  assert.equal(licorne.body.reservee, 'gnome');
  const gnome = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(ctx.players[0].token))
    .send({ x: 0.35, y: 0.3 });
  assert.equal(gnome.status, 201, JSON.stringify(gnome.body));
  assert.equal(gnome.body.verdict, 'zone');
  const right = gnome.body.question.choices.find((c) => c.text === 'La forêt respire');
  const avant = await readPlayerBourses(ctx.players[0].id);
  const rep = await request(app)
    .post(api('/chasse/repondre'))
    .set(auth(ctx.players[0].token))
    .send({
      presentationToken: gnome.body.question.presentationToken,
      questionCode: gnome.body.question.questionCode,
      choiceId: right.id,
    });
  assert.equal(rep.status, 200, JSON.stringify(rep.body));
  assert.equal(rep.body.etat, 'reparee');
  assert.equal(
    (await readPlayerBourses(ctx.players[0].id)).health,
    avant.health + 1,
    'réparation : +1 cœur par gnome',
  );
});

test('« le voile dort » : pas d’avance ; recul jamais sous −1 ; une seule avance par tour', async () => {
  await execute('UPDATE gl_game_tenir_state SET voile_position = 6 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  const dort = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true });
  assert.equal(dort.status, 200, JSON.stringify(dort.body));
  assert.equal(dort.body.souffle.dort, true);
  let state = await queryOne('SELECT voile_position FROM gl_game_tenir_state WHERE game_id = ?', [
    ctx.game.id,
  ]);
  assert.equal(Number(state.voile_position), 6);

  const events = await withTransaction((tx) =>
    retreatVoileTx(tx, { gameId: ctx.game.id, cases: 100, reason: 'test' }),
  );
  assert.equal(events[0].eventType, 'voile_recul');
  state = await queryOne('SELECT voile_position FROM gl_game_tenir_state WHERE game_id = ?', [
    ctx.game.id,
  ]);
  assert.equal(Number(state.voile_position), -1);

  // Plafond au camp − 1 : un gros total ne dépasse jamais la case 10 (camp = 11).
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
  await execute('UPDATE gl_game_tenir_state SET voile_position = 8 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  const gros = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', faces: [6] });
  assert.equal(gros.status, 200);
  state = await queryOne('SELECT voile_position FROM gl_game_tenir_state WHERE game_id = ?', [
    ctx.game.id,
  ]);
  assert.equal(Number(state.voile_position), 10);
});
