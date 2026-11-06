'use strict';

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { createTenirGame, readPlayerBourses } = require('./helpers/glTenirFixtures');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
const posOf = async (teamId) =>
  Number(
    (await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [teamId]))
      .position_marker_id,
  );
const indexOf = (markerId) => ctx.markers.findIndex((m) => Number(m.id) === Number(markerId));

async function correctChoiceId(presentation, questionCode) {
  const row = await queryOne(
    'SELECT reponse_correcte, choix_a, choix_b, choix_c, choix_d FROM gl_qcm_questions WHERE question_code = ?',
    [questionCode],
  );
  const expected = String(row[`choix_${String(row.reponse_correcte).toLowerCase()}`]).trim();
  return presentation.choices.findIndex((c) => c.text === expected);
}

async function present(teamId, markerId) {
  const res = await request(app)
    .post(api(`/markers/${markerId}/present-question`))
    .set(auth(ctx.adminToken))
    .send({ teamId });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await execute('UPDATE gl_games SET tenir_surface = ?, tenir_overrides_json = ? WHERE id = ?', [
    'tablette',
    JSON.stringify({ surface: 'tablette' }),
    ctx.game.id,
  ]);
  await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken));
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'jeu' });
});

test('bonne réponse de case : +1 case, dé réarmé (relance), aucun score ni ressource', async () => {
  const team = ctx.teams[0];
  const quiz = ctx.markers[1]; // Question 1 → case 2 = Trame 1
  await execute(
    'UPDATE gl_teams SET position_marker_id = ?, last_dice_round_number = 1 WHERE id = ?',
    [quiz.id, team.id],
  );
  const members = ctx.players.filter((p) => p.teamId === Number(team.id));
  for (const m of members)
    await execute('UPDATE gl_players SET health_points = 3, power_points = 3 WHERE id = ?', [m.id]);
  const p = await present(team.id, quiz.id);
  const choice = await correctChoiceId(p.presentation, p.questionCode);
  const res = await request(app).post(api('/qcm/answer')).set(auth(ctx.adminToken)).send({
    teamId: team.id,
    questionCode: p.questionCode,
    presentationToken: p.presentation.presentationToken,
    choiceId: choice,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.correct, true);
  assert.equal(res.body.scoreDelta, 0);
  assert.equal(res.body.tenir.bonusCase, true);
  assert.equal(indexOf(await posOf(team.id)), 2);
  const teamRow = await queryOne('SELECT last_dice_round_number FROM gl_teams WHERE id = ?', [
    team.id,
  ]);
  assert.equal(Number(teamRow.last_dice_round_number), 0, 'dé réarmé pour le tour 1');
  const score = await queryOne(
    'SELECT score FROM gl_team_scores WHERE game_id = ? AND team_id = ?',
    [ctx.game.id, team.id],
  );
  assert.ok(!score, 'aucun score en mode tenir');
  // La case bonus (Trame) s'applique : +1 cœur aux gnomes.
  for (const m of members) assert.deepEqual(await readPlayerBourses(m.id), { health: 4, power: 3 });
  const relance = await queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'relance_bonus'",
    [ctx.game.id, team.id],
  );
  assert.ok(relance);
});

test('mauvaise réponse : position inchangée, aucun delta, feedback « pas encore » sans « faux »', async () => {
  const team = ctx.teams[2];
  const quiz = ctx.markers[5]; // Question 2
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [quiz.id, team.id]);
  const p = await present(team.id, quiz.id);
  const good = await correctChoiceId(p.presentation, p.questionCode);
  const wrong = (good + 1) % p.presentation.choices.length;
  const res = await request(app).post(api('/qcm/answer')).set(auth(ctx.adminToken)).send({
    teamId: team.id,
    questionCode: p.questionCode,
    presentationToken: p.presentation.presentationToken,
    choiceId: wrong,
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.correct, false);
  assert.equal(res.body.tenir, undefined);
  assert.match(res.body.feedback, /^Pas encore/);
  assert.doesNotMatch(res.body.feedback.toLowerCase(), /faux|raté|perdu/);
  assert.equal(await posOf(team.id), Number(quiz.id));
});

test('chaîne : juste sur la question 3 (case 10) → case 11 (Souffle) → effet du plateau, juste sur une question puis une autre question se rejoue', async () => {
  const team = ctx.teams[1];
  const q1 = ctx.markers[1];
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [q1.id, team.id]);
  const p1 = await present(team.id, q1.id);
  const r1 = await request(app)
    .post(api('/qcm/answer'))
    .set(auth(ctx.adminToken))
    .send({
      teamId: team.id,
      questionCode: p1.questionCode,
      presentationToken: p1.presentation.presentationToken,
      choiceId: await correctChoiceId(p1.presentation, p1.questionCode),
    });
  assert.equal(r1.body.tenir.bonusCase, true);
  assert.equal(r1.body.tenir.arrival.question, false);
  // Placer sur la question 2 (case 6) dont la case suivante est l'événement (case 7, péripétie).
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[5].id,
    team.id,
  ]);
  const p2 = await present(team.id, ctx.markers[5].id);
  const r2 = await request(app)
    .post(api('/qcm/answer'))
    .set(auth(ctx.adminToken))
    .send({
      teamId: team.id,
      questionCode: p2.questionCode,
      presentationToken: p2.presentation.presentationToken,
      choiceId: await correctChoiceId(p2.presentation, p2.questionCode),
    });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(indexOf(await posOf(team.id)), 6);
  assert.ok(r2.body.tenir.arrival.peripetie, 'case événement sans texte → péripétie');
});
