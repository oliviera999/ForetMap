'use strict';

/**
 * « Tenir à deux » — chronométrage des séances (migration 346, 14 novembre 2026) : chaque
 * phase d'un tour garde son début et sa fin (`gl_game_round_phases`), le diagnostic en tire
 * les durées par phase et le rythme (écart premier / dernier geste par équipe pendant `jeu`,
 * gestes du prof par tour), et la console du prof lit « Ce tour : ouverture …, jeu …, souffle … ».
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { createTenirGame } = require('./helpers/glTenirFixtures');
const {
  dureesParTour,
  formatDuree,
  formatDureesTour,
  secondsBetween,
  loadRoundPhases,
} = require('../lib/glRoundPhases');
const { summarizePhases, summarizeRythme } = require('../lib/glDiagnostic');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const phase = (body) =>
  request(app).post(api('/tenir/tour/phase')).set(auth(ctx.adminToken)).send(body);

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
});

test('pur : durées par tour, phase encore ouverte, formats « 1 min 10 »', () => {
  assert.equal(secondsBetween('2026-11-14 10:00:00', '2026-11-14 10:01:10'), 70);
  assert.equal(secondsBetween('2026-11-14 10:00:00', null), null);
  assert.equal(formatDuree(70), '1 min 10');
  assert.equal(formatDuree(50), '0 min 50');
  assert.equal(formatDuree(725), '12 min 05');
  const rows = [
    {
      round_number: 1,
      phase: 'ouverture',
      started_at: '2026-11-14 10:00:00',
      ended_at: '2026-11-14 10:01:10',
    },
    {
      round_number: 1,
      phase: 'jeu',
      started_at: '2026-11-14 10:01:10',
      ended_at: '2026-11-14 10:07:50',
    },
    {
      round_number: 1,
      phase: 'souffle',
      started_at: '2026-11-14 10:07:50',
      ended_at: '2026-11-14 10:08:40',
    },
    {
      round_number: 2,
      phase: 'ouverture',
      started_at: '2026-11-21 10:00:00',
      ended_at: '2026-11-21 10:00:30',
    },
    { round_number: 2, phase: 'jeu', started_at: '2026-11-21 10:00:30', ended_at: null },
  ];
  const tours = dureesParTour(rows);
  assert.deepEqual(tours[0], {
    number: 1,
    phases: { ouverture: 70, jeu: 400, souffle: 50 },
    totalSecondes: 520,
    complet: true,
  });
  assert.equal(tours[1].phases.jeu, null, 'phase encore ouverte');
  assert.equal(tours[1].complet, false);
  assert.equal(
    formatDureesTour(tours[0].phases),
    'ouverture 1 min 10, jeu 6 min 40, souffle 0 min 50',
  );
  const resume = summarizePhases(rows);
  assert.equal(resume.toursMesures, 2);
  assert.deepEqual(resume.moyennesSecondes, { ouverture: 50, jeu: 400, souffle: 50 });
  assert.equal(resume.tours[0].libelle, 'ouverture 1 min 10, jeu 6 min 40, souffle 0 min 50');
});

test('pur : rythme — écart premier / dernier geste par équipe pendant « jeu », gestes du prof', () => {
  const phases = [
    {
      round_number: 1,
      phase: 'jeu',
      started_at: '2026-11-14 10:01:00',
      ended_at: '2026-11-14 10:08:00',
    },
  ];
  const rounds = [
    { round_number: 1, started_at: '2026-11-14 10:00:00', ended_at: '2026-11-14 10:09:00' },
  ];
  const events = [
    {
      team_id: null,
      actor_type: 'mj',
      event_type: 'tour_ouvert',
      created_at: '2026-11-14 10:00:00',
    },
    {
      team_id: null,
      actor_type: 'mj',
      event_type: 'round_start',
      created_at: '2026-11-14 10:00:00',
    },
    {
      team_id: null,
      actor_type: 'mj',
      event_type: 'tour_phase',
      created_at: '2026-11-14 10:01:00',
    },
    { team_id: 7, actor_type: 'team', event_type: 'dice_roll', created_at: '2026-11-14 10:02:00' },
    { team_id: 7, actor_type: 'team', event_type: 'fouille', created_at: '2026-11-14 10:06:30' },
    { team_id: 8, actor_type: 'mj', event_type: 'dice_roll', created_at: '2026-11-14 10:03:00' },
    { team_id: 7, actor_type: 'team', event_type: 'page_lue', created_at: '2026-11-14 10:08:30' },
    { team_id: null, actor_type: 'mj', event_type: 'tour_clos', created_at: '2026-11-14 10:09:00' },
    { team_id: 7, actor_type: 'team', event_type: 'page_lue', created_at: '2026-11-15 18:00:00' },
  ];
  const { tours } = summarizeRythme(events, phases, rounds, [{ id: 7, name: 'Gnomes A' }]);
  assert.equal(tours.length, 1);
  assert.equal(tours[0].gestesProf, 4, 'round_start (doublon) non compté');
  assert.equal(tours[0].phaseJeuMesuree, true);
  const a = tours[0].equipes.find((e) => e.teamId === 7);
  assert.equal(a.name, 'Gnomes A');
  assert.equal(a.gestes, 2, 'hors de la phase « jeu » : non compté');
  assert.equal(a.ecartSecondes, 270);
  const b = tours[0].equipes.find((e) => e.teamId === 8);
  assert.equal(b.gestes, 1);
  assert.equal(b.ecartSecondes, 0);
  // Tour joué avant la migration : pas de phase mesurée, pas d'écart inventé.
  const ancien = summarizeRythme(events, [], rounds);
  assert.equal(ancien.tours[0].phaseJeuMesuree, false);
  assert.deepEqual(ancien.tours[0].equipes, []);
});

test('moteur : ouvrir → jeu → souffle → clos écrit trois phases fermées dans l’ordre', async () => {
  const ouvrir = await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken));
  assert.equal(ouvrir.status, 200, JSON.stringify(ouvrir.body));
  let rows = await loadRoundPhases(db, ctx.game.id, 1);
  assert.deepEqual(
    rows.map((r) => [r.phase, r.ended_at == null]),
    [['ouverture', true]],
  );
  assert.equal((await phase({ phase: 'jeu' })).status, 200);
  rows = await loadRoundPhases(db, ctx.game.id, 1);
  assert.equal(rows.find((r) => r.phase === 'ouverture').ended_at != null, true);
  assert.equal(rows.find((r) => r.phase === 'jeu').ended_at, null);

  // Avant la clôture, la console ne lit pas encore de bilan fermé ; un élève n'en lit jamais.
  const eleve = await request(app).get(api('/tenir/tour')).set(auth(ctx.players[0].token));
  assert.equal(eleve.status, 200);
  assert.equal('durees' in eleve.body.round, false, 'les durées ne sortent que pour le prof');

  assert.equal((await phase({ phase: 'souffle', dort: true })).status, 200);
  assert.equal((await phase({ phase: 'clos' })).status, 200);
  rows = await loadRoundPhases(db, ctx.game.id, 1);
  assert.deepEqual(rows.map((r) => r.phase).sort(), ['jeu', 'ouverture', 'souffle']);
  assert.ok(
    rows.every((r) => r.ended_at != null),
    'toutes les phases sont fermées',
  );

  const prof = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken));
  assert.equal(prof.status, 200);
  assert.deepEqual(Object.keys(prof.body.round.durees.phases).sort(), [
    'jeu',
    'ouverture',
    'souffle',
  ]);
  assert.match(
    prof.body.round.durees.libelle,
    /^ouverture \d+ min \d{2}, jeu \d+ min \d{2}, souffle \d+ min \d{2}$/,
  );
});

test('moteur : un nouveau tour repart de zéro ; la clôture du chapitre ferme la phase ouverte', async () => {
  await request(app).post(api('/tenir/tour/ouvrir')).set(auth(ctx.adminToken)).expect(200);
  await phase({ phase: 'jeu' }).expect(200);
  let rows = await loadRoundPhases(db, ctx.game.id, 2);
  assert.equal(rows.length, 2);
  const fin = await request(app).post(`/api/gl/games/${ctx.game.id}/end`).set(auth(ctx.adminToken));
  assert.equal(fin.status, 200, JSON.stringify(fin.body));
  rows = await loadRoundPhases(db, ctx.game.id, 2);
  assert.ok(
    rows.every((r) => r.ended_at != null),
    'le Seuil ferme la phase « jeu » restée ouverte',
  );
  const tous = dureesParTour(await loadRoundPhases(db, ctx.game.id));
  assert.deepEqual(
    tous.map((t) => t.number),
    [1, 2],
  );
});
