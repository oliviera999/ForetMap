'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne, queryAll } = require('../database');
const {
  createTenirGame,
  readPlayerBourses,
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
const posOf = async (teamId) =>
  Number(
    (await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [teamId]))
      .position_marker_id,
  );
const indexOf = (markerId) => ctx.markers.findIndex((m) => Number(m.id) === Number(markerId));

async function openRoundInJeu() {
  const r = await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken));
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'jeu' });
  return r.body.roundNumber;
}

async function closeRound() {
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'souffle', dort: true });
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'clos' });
}

before(async () => {
  await initSchema();
  // Surface tablette, dés physiques avec validation du prof.
  ctx = await createTenirGame({ stamp: Date.now() });
  await execute('UPDATE gl_games SET tenir_surface = ?, tenir_overrides_json = ? WHERE id = ?', [
    'tablette',
    JSON.stringify({ surface: 'tablette', des_mode: 'physique', des_physiques_validation: 'prof' }),
    ctx.game.id,
  ]);
});

test('ancienne route dice-roll : count ≠ 2 → 400, sinon 409 vers /tenir/lancer', async () => {
  const bad = await request(app)
    .post(api(`/teams/${ctx.teams[0].id}/dice-roll`))
    .set(auth(ctx.adminToken))
    .send({ count: 3 });
  assert.equal(bad.status, 400);
  const redirected = await request(app)
    .post(api(`/teams/${ctx.teams[0].id}/dice-roll`))
    .set(auth(ctx.adminToken))
    .send({ count: 2 });
  assert.equal(redirected.status, 409);
  assert.equal(redirected.body.code, 'TENIR_LANCER');
});

test('physique sur tablette : faces hors 1-6 → 400 ; saisie en attente du prof, puis validation applique', async () => {
  await openRoundInJeu();
  const team = ctx.teams[0];
  const player = ctx.players.find((p) => p.teamId === Number(team.id));
  const before = await posOf(team.id);
  const bad = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(player.token))
    .send({ mode: 'physique', faces: [7, 1] });
  assert.equal(bad.status, 400);
  const pending = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(player.token))
    .send({ mode: 'physique', faces: [2, 3] });
  assert.equal(pending.status, 202, JSON.stringify(pending.body));
  assert.equal(pending.body.enAttente, true);
  assert.equal(await posOf(team.id), before, 'rien n’avance avant le clic du prof');
  const view = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken));
  assert.equal(view.body.round.desEnAttente.length, 1);
  const refusedByPlayer = await request(app)
    .post(api(`/tenir/des/${pending.body.saisieId}/valider`))
    .set(auth(player.token));
  assert.equal(refusedByPlayer.status, 403);
  const ok = await request(app)
    .post(api(`/tenir/des/${pending.body.saisieId}/valider`))
    .set(auth(ctx.adminToken));
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(indexOf(await posOf(team.id)), indexOf(before) + 5);
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'dice_roll' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(evt.payload_json);
  assert.equal(payload.mode, 'physique');
  assert.deepEqual(payload.faces, [2, 3]);
  assert.equal(payload.saisieId, pending.body.saisieId);
  const saisie = await queryOne('SELECT statut FROM gl_game_des_saisies WHERE id = ?', [
    pending.body.saisieId,
  ]);
  assert.equal(saisie.statut, 'appliquee');
});

test('validation auto : la saisie physique d’une tablette s’applique directement', async () => {
  await execute('UPDATE gl_games SET tenir_overrides_json = ? WHERE id = ?', [
    JSON.stringify({ surface: 'tablette', des_mode: 'physique', des_physiques_validation: 'auto' }),
    ctx.game.id,
  ]);
  const team = ctx.teams[1];
  const player = ctx.players.find((p) => p.teamId === Number(team.id));
  const before = await posOf(team.id);
  const res = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(player.token))
    .send({ mode: 'physique', faces: [1, 1] });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(indexOf(await posOf(team.id)), indexOf(before) + 2);
});

test('serveur : 2 dés tirés, total 2–12, journal dice_roll serveur', async () => {
  await execute('UPDATE gl_games SET tenir_overrides_json = ? WHERE id = ?', [
    JSON.stringify({ surface: 'tablette', des_mode: 'serveur' }),
    ctx.game.id,
  ]);
  const team = ctx.teams[2];
  const player = ctx.players.find((p) => p.teamId === Number(team.id));
  const res = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(player.token))
    .send({ mode: 'serveur' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.ok(res.body.total >= 2 && res.body.total <= 12);
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'dice_roll' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(evt.payload_json);
  assert.equal(payload.faces.length, 2);
  assert.equal(payload.serverRoll, true);
});

test('avance libre : prof seul, 1–12 cases, motif obligatoire, journalisée, effets de case appliqués', async () => {
  const team = ctx.teams[3];
  const player = ctx.players.find((p) => p.teamId === Number(team.id));
  const byPlayer = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(player.token))
    .send({ mode: 'libre', cases: 2, motif: 'test' });
  assert.equal(byPlayer.status, 403);
  const noMotif = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'libre', teamId: team.id, cases: 2 });
  assert.equal(noMotif.status, 400);
  const tooFar = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'libre', teamId: team.id, cases: 13, motif: 'trop loin' });
  assert.equal(tooFar.status, 400);
  // Case 2 = Trame 1 : +1 ressource du peuple (licornes → gemme).
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[0].id,
    team.id,
  ]);
  const members = ctx.players.filter((p) => p.teamId === Number(team.id));
  for (const m of members) await setPlayerBourses(m.id, 3, 3);
  const ok = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'libre', teamId: team.id, cases: 2, motif: 'rattrapage de la séance manquée' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(indexOf(await posOf(team.id)), 2);
  assert.equal(ok.body.arrival.vitality.tonalite, 'trame');
  for (const m of members) assert.deepEqual(await readPlayerBourses(m.id), { health: 3, power: 4 });
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'avance_libre' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(JSON.parse(evt.payload_json).motif, 'rattrapage de la séance manquée');
  // L'avance libre ne consomme pas le dé : l'équipe peut encore lancer ce tour.
  const teamRow = await queryOne('SELECT last_dice_round_number FROM gl_teams WHERE id = ?', [
    team.id,
  ]);
  assert.ok(Number(teamRow.last_dice_round_number || 0) < 1, 'dé non consommé par l’avance libre');
});

test('équipe au camp : son jet est appliqué à l’équipe la plus en retard (bénéficiaire) ; première arrivée mémorisée', async () => {
  await closeRound();
  // Sans vent : la dernière reste la dernière d'une ouverture à l'autre.
  await execute('UPDATE gl_games SET tenir_overrides_json = ? WHERE id = ?', [
    JSON.stringify({
      surface: 'tablette',
      des_mode: 'physique',
      des_physiques_validation: 'auto',
      vent: false,
    }),
    ctx.game.id,
  ]);
  const camp = ctx.markers[ctx.markers.length - 1];
  const champion = ctx.teams[0];
  const late = ctx.teams[1];
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[ctx.markers.length - 3].id,
    champion.id,
  ]);
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[0].id, // du départ, +3 mène sur une étape sans effet
    late.id,
  ]);
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id IN (?, ?)', [
    ctx.markers[5].id,
    ctx.teams[2].id,
    ctx.teams[3].id,
  ]);
  await openRoundInJeu();
  // Un jet serveur précédent (aléatoire) a pu déjà mener une équipe au camp : on repart de
  // « aucune première arrivée » pour tester la mémorisation sans dépendre du tirage.
  await execute(
    'UPDATE gl_game_tenir_state SET premiere_arrivee_team_id = NULL WHERE game_id = ?',
    [ctx.game.id],
  );
  const champPlayer = ctx.players.find((p) => p.teamId === Number(champion.id));
  const arrive = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(champPlayer.token))
    .send({ mode: 'physique', faces: [6, 6] });
  assert.equal(arrive.status, 201, JSON.stringify(arrive.body));
  assert.equal(await posOf(champion.id), Number(camp.id));
  assert.equal(arrive.body.arrival.camp, true);
  assert.equal(arrive.body.arrival.premiereArrivee, true);
  const state = await queryOne(
    'SELECT premiere_arrivee_team_id FROM gl_game_tenir_state WHERE game_id = ?',
    [ctx.game.id],
  );
  assert.equal(Number(state.premiere_arrivee_team_id), Number(champion.id));
  await closeRound();
  await openRoundInJeu();
  const lateBefore = indexOf(await posOf(late.id));
  const gift = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(champPlayer.token))
    .send({ mode: 'physique', faces: [1, 2] });
  assert.equal(gift.status, 201, JSON.stringify(gift.body));
  assert.equal(gift.body.beneficiaryTeamId, Number(late.id));
  assert.equal(indexOf(await posOf(late.id)), lateBefore + 3);
  assert.equal(await posOf(champion.id), Number(camp.id), 'le champion reste au camp');
  const rolls = await queryAll(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'dice_roll' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(JSON.parse(rolls[0].payload_json).beneficiaryTeamId, Number(late.id));
});
