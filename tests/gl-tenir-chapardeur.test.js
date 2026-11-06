'use strict';

/**
 * « Tenir à deux » v2 — le chapardeur (spec § 13) : au tour tiré, en phase souffle, une unité
 * de la ressource la plus abondante de la bourse la plus pleine part au nid ; l'identité reste
 * privée (plume visible du seul concerné et du prof) ; le nid revient au membre le moins riche
 * de la prochaine équipe découvreuse ; désactivable (`chapardeur` false). Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne } = db;
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
  readPlayerBourses,
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');
const { redactGameEventsForViewer } = require('../lib/glGameEvents');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await execute('UPDATE gl_game_tenir_state SET chapardeur_round = 1 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  // Le plus riche : joueur 2 (Licornes A) à 2 cœurs / 6 gemmes. Le plus pauvre de Gnomes A : joueur 4.
  await setPlayerBourses(ctx.players[2].id, 2, 6);
  await setPlayerBourses(ctx.players[4].id, 1, 1);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('phase souffle du tour tiré : une gemme part au nid ; payload privé ; plume vue du concerné et du prof seuls', async () => {
  const res = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(await readPlayerBourses(ctx.players[2].id), { health: 2, power: 5 });
  const state = await queryOne('SELECT nid_json FROM gl_game_tenir_state WHERE game_id = ?', [
    ctx.game.id,
  ]);
  const nid = JSON.parse(state.nid_json);
  assert.equal(nid.playerId, ctx.players[2].id);
  assert.equal(nid.ressource, 'power');

  const evt = await queryOne(
    "SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at FROM gl_game_events WHERE game_id = ? AND event_type = 'chapardeur'",
    [ctx.game.id],
  );
  assert.ok(evt);
  const [pub] = redactGameEventsForViewer([{ ...evt, payload: JSON.parse(evt.payload_json) }], {
    kind: 'player',
    playerId: ctx.players[0].id,
  });
  assert.equal(pub.payload.roundNumber, 1);
  assert.equal(pub.payload.playerId, undefined, 'personne ne sait qui');
  assert.equal(pub.payload.ressource, undefined);

  const concerne = await request(app).get(api('/tenir')).set(auth(ctx.players[2].token));
  assert.equal(concerne.body.plume, true);
  const autre = await request(app).get(api('/tenir')).set(auth(ctx.players[0].token));
  assert.equal(autre.body.plume, false);
  assert.equal(autre.body.state.nid, undefined, 'le nid n’est pas servi à un élève');
  const prof = await request(app).get(api('/tenir')).set(auth(ctx.adminToken));
  assert.equal(prof.body.plume, true);
  assert.equal(prof.body.state.nid.playerId, ctx.players[2].id);
});

test('une seule fois par chapitre ; le nid revient au membre le moins riche de l’équipe découvreuse', async () => {
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' })
    .expect(200);
  await execute('UPDATE gl_game_tenir_state SET chapardeur_round = 2 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  await ouvrirTourEnJeu(request, app, ctx);
  const fouille = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(ctx.players[0].token))
    .send({ x: 0.35, y: 0.3 });
  assert.equal(fouille.status, 201, JSON.stringify(fouille.body));
  const right = fouille.body.question.choices.find((c) => c.text === 'La forêt respire');
  const rep = await request(app)
    .post(api('/chasse/repondre'))
    .set(auth(ctx.players[0].token))
    .send({
      presentationToken: fouille.body.question.presentationToken,
      questionCode: fouille.body.question.questionCode,
      choiceId: right.id,
    });
  assert.equal(rep.status, 200, JSON.stringify(rep.body));
  assert.equal(rep.body.etat, 'trouvee');
  assert.deepEqual(
    await readPlayerBourses(ctx.players[4].id),
    { health: 1, power: 2 },
    'le nid (une gemme) revient au moins riche',
  );
  const state = await queryOne('SELECT nid_json FROM gl_game_tenir_state WHERE game_id = ?', [
    ctx.game.id,
  ]);
  assert.equal(state.nid_json, null);

  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true })
    .expect(200);
  const count = await queryOne(
    "SELECT COUNT(*) AS c FROM gl_game_events WHERE game_id = ? AND event_type = 'chapardeur'",
    [ctx.game.id],
  );
  assert.equal(Number(count.c), 1, 'jamais deux fois dans la partie');
});

test('profil prologue : pas de chapardeur', async () => {
  const autre = await createTenirGame({ stamp: Date.now() + 1, profil: 'prologue' });
  const a = (p) => `/api/gl/games/${autre.game.id}${p}`;
  await request(app).get(a('/tenir')).set(auth(autre.adminToken)).expect(200);
  await execute('UPDATE gl_game_tenir_state SET chapardeur_round = 1 WHERE game_id = ?', [
    autre.game.id,
  ]);
  await ouvrirTourEnJeu(request, app, autre);
  await request(app)
    .post(a('/tenir/tour/phase'))
    .set(auth(autre.adminToken))
    .send({ phase: 'souffle', dort: true })
    .expect(200);
  const count = await queryOne(
    "SELECT COUNT(*) AS c FROM gl_game_events WHERE game_id = ? AND event_type = 'chapardeur'",
    [autre.game.id],
  );
  assert.equal(Number(count.c), 0);
});
