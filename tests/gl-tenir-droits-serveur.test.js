'use strict';

/**
 * « Tenir à deux » — droits du tour rejoués par le serveur (audit du 19 novembre 2026, lot 2).
 *
 * - M1 : à l'escalier, un jet ne reste pas en suspens pour une Relance pas encore ouverte ;
 * - M2 : « répondre » est rejoué (phase, surface) et une question due ne rapporte qu'une fois ;
 * - M3 : `present-arrival` n'applique pas la case où un sort ou le vent a posé l'équipe ;
 * - M4 : une Relance payée et jamais rejouée est rendue au passage en souffle ;
 * - M5 : en hybride, la fenêtre de fouille ouvre bien le droit « fouiller » servi à l'élève ;
 * - P3 : `present-arrival` et `present-question` exigent une partie en cours.
 *
 * Une partie par constat (fixtures anonymes), suites séquentielles.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryAll, queryOne } = require('../database');
const { createTenirGame, ouvrirTourEnJeu, setPlayerBourses } = require('./helpers/glTenirFixtures');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (c, path) => `/api/gl/games/${c.game.id}${path}`;
const membres = (c, i) => c.players.filter((p) => p.teamId === Number(c.teams[i].id));
const indexOf = async (c, teamId) => {
  const row = await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [teamId]);
  return c.markers.findIndex((m) => Number(m.id) === Number(row.position_marker_id));
};
const poser = (c, i, index, extra = '') =>
  execute(`UPDATE gl_teams SET position_marker_id = ?${extra} WHERE id = ?`, [
    c.markers[index].id,
    c.teams[i].id,
  ]);
const gemmes = async (c, i) => {
  const row = await queryOne(
    `SELECT COALESCE(SUM(p.power_points), 0) AS g
       FROM gl_team_members tm INNER JOIN gl_players p ON p.id = tm.player_id
      WHERE tm.game_id = ? AND tm.team_id = ?`,
    [c.game.id, c.teams[i].id],
  );
  return Number(row.g);
};

async function surface(c, value, overrides = {}) {
  const row = await queryOne('SELECT tenir_overrides_json FROM gl_games WHERE id = ?', [c.game.id]);
  const next = {
    ...(JSON.parse(row.tenir_overrides_json || '{}') || {}),
    ...overrides,
    surface: value,
  };
  await execute('UPDATE gl_games SET tenir_surface = ?, tenir_overrides_json = ? WHERE id = ?', [
    value,
    JSON.stringify(next),
    c.game.id,
  ]);
}

const phase = (c, body) =>
  request(app).post(api(c, '/tenir/tour/phase')).set(auth(c.adminToken)).send(body);

const jet = (c, i, faces) =>
  request(app)
    .post(api(c, '/tenir/lancer'))
    .set(auth(c.adminToken))
    .send({ mode: 'physique', teamId: c.teams[i].id, faces });

async function cast(c, token, body) {
  const d = await request(app).post(api(c, '/spell-casts/drafts')).set(auth(token)).send(body);
  if (d.status !== 201) return d;
  return request(app)
    .post(api(c, `/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(token));
}

async function correctChoiceId(presentation, questionCode) {
  const row = await queryOne(
    'SELECT reponse_correcte, choix_a, choix_b, choix_c, choix_d FROM gl_qcm_questions WHERE question_code = ?',
    [questionCode],
  );
  const expected = String(row[`choix_${String(row.reponse_correcte).toLowerCase()}`]).trim();
  return presentation.choices.findIndex((ch) => ch.text === expected);
}

const presenter = (c, token, markerId, body = {}) =>
  request(app)
    .post(api(c, `/markers/${markerId}/present-question`))
    .set(auth(token))
    .send(body);

async function repondreJuste(c, token, p, body = {}) {
  return request(app)
    .post(api(c, '/qcm/answer'))
    .set(auth(token))
    .send({
      ...body,
      questionCode: p.questionCode,
      presentationToken: p.presentation.presentationToken,
      choiceId: await correctChoiceId(p.presentation, p.questionCode),
    });
}

let stamp = Date.now();
const partie = (opts = {}) => createTenirGame({ stamp: (stamp += 1), ...opts });

before(async () => {
  await initSchema();
});

// ---------------------------------------------------------------------
// M1 — escalier : pas de jet en suspens pour une Relance fermée
// ---------------------------------------------------------------------

test('M1 — escalier, séance 1 : le jet s’applique aussitôt, Relance n’étant pas ouverte', async () => {
  const c = await partie({ plateau: 1, overrides: { escalier: true, escalier_pas: 1 } });
  await ouvrirTourEnJeu(request, app, c);
  for (const m of membres(c, 0)) await setPlayerBourses(m.id, 3, 3);
  // Le lancement de Relance est bien refusé à cette marche…
  const brouillon = await request(app)
    .post(api(c, '/spell-casts/drafts'))
    .set(auth(c.adminToken))
    .send({ spellCode: 'SL005', teamId: c.teams[0].id });
  assert.equal(brouillon.status, 409, JSON.stringify(brouillon.body));
  assert.equal(brouillon.body.code, 'SPELL_ESCALIER');
  // … donc le jet n'attend pas un sort qui serait refusé.
  const r = await jet(c, 0, [1, 1]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.notEqual(r.body.arrival?.enSuspens, true, JSON.stringify(r.body.arrival));
  const suspendues = await queryAll(
    "SELECT id FROM gl_game_tenir_effets WHERE game_id = ? AND kind = 'arrivee_suspendue'",
    [c.game.id],
  );
  assert.equal(suspendues.length, 0);
});

test('M1 — escalier, séance 4 : Relance ouverte, le jet reste en suspens', async () => {
  const c = await partie({ plateau: 1, overrides: { escalier: true, escalier_pas: 4 } });
  await ouvrirTourEnJeu(request, app, c);
  for (const m of membres(c, 0)) await setPlayerBourses(m.id, 3, 3);
  const r = await jet(c, 0, [1, 1]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.arrival?.enSuspens, true, JSON.stringify(r.body.arrival));
});

// ---------------------------------------------------------------------
// M2 — « répondre » rejoué, une question due ne rapporte qu'une fois
// ---------------------------------------------------------------------

test('M2 (a) — deux présentations de la même question : une seule bonne réponse fait avancer', async () => {
  const c = await partie();
  await surface(c, 'tablette');
  await ouvrirTourEnJeu(request, app, c);
  const eleve = membres(c, 0)[0];
  await poser(c, 0, 1, ', last_dice_round_number = 1'); // Question 1
  const quiz = c.markers[1];
  const pEleve = await presenter(c, eleve.token, quiz.id);
  assert.equal(pEleve.status, 200, JSON.stringify(pEleve.body));
  const pProf = await presenter(c, c.adminToken, quiz.id, { teamId: c.teams[0].id });
  assert.equal(pProf.status, 200, JSON.stringify(pProf.body));

  const r1 = await repondreJuste(c, eleve.token, pEleve.body);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.correct, true);
  assert.equal(r1.body.tenir.bonusCase, true);
  assert.equal(await indexOf(c, c.teams[0].id), 2);

  const r2 = await repondreJuste(c, c.adminToken, pProf.body, { teamId: c.teams[0].id });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(r2.body.correct, true);
  assert.equal(r2.body.tenir?.bonusCase, false, 'la question a déjà rapporté sa case');
  assert.equal(await indexOf(c, c.teams[0].id), 2, 'une seule case gagnée');
  const bonus = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'relance_bonus'",
    [c.game.id, c.teams[0].id],
  );
  assert.equal(bonus.length, 1);
});

test('M2 (a) — question due à l’arrivée d’un jet : deux jetons, une seule case', async () => {
  const c = await partie();
  await surface(c, 'tablette');
  await ouvrirTourEnJeu(request, app, c);
  // Bourses vides : pas de Relance possible, la case s'applique et la question est notée due.
  for (const m of membres(c, 1)) await setPlayerBourses(m.id, 0, 0);
  await poser(c, 1, 3); // Étape → deux cases plus loin, Question 2
  const r = await jet(c, 1, [1, 1]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await indexOf(c, c.teams[1].id), 5, JSON.stringify(r.body));
  const quiz = c.markers[5];
  const eleve = membres(c, 1)[0];
  const pEleve = await presenter(c, eleve.token, quiz.id);
  assert.equal(pEleve.status, 200, JSON.stringify(pEleve.body));
  const pProf = await presenter(c, c.adminToken, quiz.id, { teamId: c.teams[1].id });
  assert.equal(pProf.status, 200, JSON.stringify(pProf.body));
  const r1 = await repondreJuste(c, c.adminToken, pProf.body, { teamId: c.teams[1].id });
  assert.equal(r1.body.tenir?.bonusCase, true, JSON.stringify(r1.body));
  const r2 = await repondreJuste(c, eleve.token, pEleve.body);
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(r2.body.tenir?.bonusCase, false);
  assert.equal(await indexOf(c, c.teams[1].id), 6, 'une seule case gagnée');
});

test('M2 — hybride : un élève ne présente ni ne joue la question, le prof si', async () => {
  const c = await partie();
  await surface(c, 'hybride');
  await ouvrirTourEnJeu(request, app, c);
  const eleve = membres(c, 0)[0];
  await poser(c, 0, 1, ', last_dice_round_number = 1');
  const quiz = c.markers[1];
  const refus = await presenter(c, eleve.token, quiz.id);
  assert.equal(refus.status, 403, JSON.stringify(refus.body));
  assert.equal(refus.body.code, 'TENIR_PERMISSION');
  const pProf = await presenter(c, c.adminToken, quiz.id, { teamId: c.teams[0].id });
  assert.equal(pProf.status, 200, JSON.stringify(pProf.body));
  // Le jeton du prof, rejoué par un élève : refusé, rien ne bouge.
  const vol = await repondreJuste(c, eleve.token, pProf.body);
  assert.equal(vol.status, 403, JSON.stringify(vol.body));
  assert.equal(vol.body.code, 'TENIR_PERMISSION');
  assert.equal(await indexOf(c, c.teams[0].id), 1);
  const r = await repondreJuste(c, c.adminToken, pProf.body, { teamId: c.teams[0].id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.tenir.bonusCase, true);
});

test('M2 (b) — question présentée en « jeu », réponse après le passage en souffle : refusée', async () => {
  const c = await partie();
  await surface(c, 'tablette');
  await ouvrirTourEnJeu(request, app, c);
  const eleve = membres(c, 2)[0];
  await poser(c, 2, 5, ', last_dice_round_number = 1'); // Question 2
  const quiz = c.markers[5];
  const p = await presenter(c, eleve.token, quiz.id);
  assert.equal(p.status, 200, JSON.stringify(p.body));
  const souffle = await phase(c, { phase: 'souffle', dort: true });
  assert.equal(souffle.status, 200, JSON.stringify(souffle.body));
  const r = await repondreJuste(c, eleve.token, p.body);
  assert.equal(r.status, 409, JSON.stringify(r.body));
  assert.equal(r.body.code, 'TENIR_PHASE');
  assert.equal(await indexOf(c, c.teams[2].id), 5, 'aucune case gagnée');
  const row = await queryOne('SELECT last_dice_round_number FROM gl_teams WHERE id = ?', [
    c.teams[2].id,
  ]);
  assert.equal(Number(row.last_dice_round_number), 1, 'dé non réarmé');
  // Présenter hors phase « jeu » : refusé aussi à l'élève, le prof garde la main.
  const tard = await presenter(c, eleve.token, quiz.id);
  assert.equal(tard.status, 409, JSON.stringify(tard.body));
  assert.equal(tard.body.code, 'TENIR_PHASE');
});

// ---------------------------------------------------------------------
// M5 — hybride : la fenêtre de fouille ouvre le droit servi à l'élève
// ---------------------------------------------------------------------

test('M5 — hybride : fenêtre de fouille ouverte → `permissions.fouiller` servi à l’élève', async () => {
  const c = await partie();
  await surface(c, 'hybride');
  await ouvrirTourEnJeu(request, app, c);
  const vue = async (token) =>
    (await request(app).get(api(c, '')).set(auth(token)).expect(200)).body.tenir.permissions;
  const a = membres(c, 0)[0];
  const b = membres(c, 1)[0];
  assert.equal((await vue(a.token)).fouiller, false, 'fenêtre fermée');
  // Fenêtre d'une seule équipe : l'autre n'y a pas droit.
  await request(app)
    .post(api(c, '/tenir/tour/fouille-fenetre'))
    .set(auth(c.adminToken))
    .send({ teamId: c.teams[0].id, ouverte: true })
    .expect(200);
  assert.equal((await vue(a.token)).fouiller, true);
  assert.equal((await vue(b.token)).fouiller, false);
  // Fenêtre pour tous.
  await request(app)
    .post(api(c, '/tenir/tour/fouille-fenetre'))
    .set(auth(c.adminToken))
    .send({ ouverte: true })
    .expect(200);
  assert.equal((await vue(b.token)).fouiller, true);
  await request(app)
    .post(api(c, '/tenir/tour/fouille-fenetre'))
    .set(auth(c.adminToken))
    .send({ ouverte: false })
    .expect(200);
  assert.equal((await vue(a.token)).fouiller, false);
});

// ---------------------------------------------------------------------
// M3 — `present-arrival` ne défait pas « sans appliquer la case »
// ---------------------------------------------------------------------

test('M3 — Progression pose l’équipe sur une Trame sans la jouer : la présenter ne donne rien', async () => {
  const c = await partie();
  await surface(c, 'tablette');
  await ouvrirTourEnJeu(request, app, c);
  const eleve = membres(c, 0)[0];
  for (const m of membres(c, 0)) await setPlayerBourses(m.id, 3, 3);
  await poser(c, 0, 6); // Péripétie → deux cases plus loin, Étape 2
  const r = await jet(c, 0, [1, 1]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const progression = await cast(c, eleve.token, {
    spellCode: 'SL002',
    teamId: c.teams[0].id,
    effectParams: { delta: -1 },
  });
  assert.equal(progression.status, 200, JSON.stringify(progression.body));
  assert.equal(await indexOf(c, c.teams[0].id), 7, 'posée sur Trame 2');
  const avant = await gemmes(c, 0);
  const trame = c.markers[7];
  for (const [token, body] of [
    [eleve.token, {}],
    [c.adminToken, { teamId: c.teams[0].id }],
  ]) {
    const res = await request(app)
      .post(api(c, `/markers/${trame.id}/present-arrival`))
      .set(auth(token))
      .send(body);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.notEqual(res.body.vitality?.applied, true, JSON.stringify(res.body.vitality));
    assert.equal(res.body.sansEffet, true);
  }
  assert.equal(await gemmes(c, 0), avant, 'aucune gemme : la case n’a pas été jouée');
  const effets = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'marker_effect'",
    [c.game.id, c.teams[0].id],
  );
  assert.equal(effets.length, 0);
});

test('M3 — le vent pose la dernière équipe sur une Trame : la présenter ne donne rien', async () => {
  const c = await partie();
  await surface(c, 'tablette');
  await ouvrirTourEnJeu(request, app, c);
  await phase(c, { phase: 'souffle', dort: true }).expect(200);
  await phase(c, { phase: 'clos' }).expect(200);
  // Une seule dernière : Gnomes B, à trois cases de Trame 2.
  for (const i of [0, 2, 3]) await poser(c, i, 8);
  await poser(c, 1, 4);
  for (const m of membres(c, 1)) await setPlayerBourses(m.id, 3, 3);
  await ouvrirTourEnJeu(request, app, c);
  const vent = await queryOne(
    "SELECT team_id FROM gl_game_events WHERE game_id = ? AND event_type = 'vent_caravane' ORDER BY id DESC LIMIT 1",
    [c.game.id],
  );
  assert.equal(Number(vent?.team_id), Number(c.teams[1].id), 'le vent a soufflé pour Gnomes B');
  assert.equal(await indexOf(c, c.teams[1].id), 7, 'posée sur Trame 2');
  const avant = await gemmes(c, 1);
  const res = await request(app)
    .post(api(c, `/markers/${c.markers[7].id}/present-arrival`))
    .set(auth(c.adminToken))
    .send({ teamId: c.teams[1].id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.notEqual(res.body.vitality?.applied, true, JSON.stringify(res.body.vitality));
  assert.equal(await gemmes(c, 1), avant);
});

test('M3 — une équipe posée à la main par le prof : la case se présente et s’applique comme avant', async () => {
  const c = await partie();
  await ouvrirTourEnJeu(request, app, c);
  for (const m of membres(c, 2)) await setPlayerBourses(m.id, 3, 3);
  await poser(c, 2, 2); // Trame 1
  const avant = await gemmes(c, 2);
  const res = await request(app)
    .post(api(c, `/markers/${c.markers[2].id}/present-arrival`))
    .set(auth(c.adminToken))
    .send({ teamId: c.teams[2].id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.vitality.applied, true);
  assert.equal(await gemmes(c, 2), avant + membres(c, 2).length);
});

// ---------------------------------------------------------------------
// M4 — Relance payée, jamais rejouée : rendue au passage en souffle
// ---------------------------------------------------------------------

test('M4 — Relance lancée, dé jamais rejoué : le sort est rendu au souffle, sans jet d’office', async () => {
  const c = await partie();
  await surface(c, 'tablette');
  await ouvrirTourEnJeu(request, app, c);
  const eleve = membres(c, 0)[0];
  for (const m of membres(c, 0)) await setPlayerBourses(m.id, 3, 3);
  const avant = await gemmes(c, 0);
  const r = await jet(c, 0, [1, 1]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.arrival?.enSuspens, true);
  const relance = await cast(c, eleve.token, { spellCode: 'SL005', teamId: c.teams[0].id });
  assert.equal(relance.status, 200, JSON.stringify(relance.body));
  assert.equal(await gemmes(c, 0), avant - 2, 'Relance payée');
  assert.equal(await indexOf(c, c.teams[0].id), 0, 'jet annulé');

  const souffle = await phase(c, { phase: 'souffle', dort: true });
  assert.equal(souffle.status, 200, JSON.stringify(souffle.body));
  assert.equal(await gemmes(c, 0), avant, 'Relance rendue : rien n’est retiré');
  const draft = await queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [
    relance.body.draft.id,
  ]);
  assert.equal(draft.status, 'rembourse');
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND team_id = ? AND event_type = 'spell_rembourse' ORDER BY id DESC LIMIT 1",
    [c.game.id, c.teams[0].id],
  );
  assert.ok(evt, 'évènement spell_rembourse');
  assert.equal(JSON.parse(evt.payload_json).spellCode, 'SL005');
  // Décision ouverte : ni jet d'office, ni jet annulé réappliqué.
  assert.equal(await indexOf(c, c.teams[0].id), 0);
  // Rendue une seule fois : la clôture ne rend rien de plus.
  await phase(c, { phase: 'clos' }).expect(200);
  assert.equal(await gemmes(c, 0), avant);
});

test('M4 — Relance rejouée : rien n’est rendu au souffle', async () => {
  const c = await partie();
  await surface(c, 'tablette');
  await ouvrirTourEnJeu(request, app, c);
  const eleve = membres(c, 0)[0];
  for (const m of membres(c, 0)) await setPlayerBourses(m.id, 3, 3);
  const avant = await gemmes(c, 0);
  await jet(c, 0, [1, 1]).expect(201);
  const relance = await cast(c, eleve.token, { spellCode: 'SL005', teamId: c.teams[0].id });
  assert.equal(relance.status, 200, JSON.stringify(relance.body));
  // Deux cases : Trame 1 (+ 1 gemme par membre), jouée par le second jet.
  const second = await jet(c, 0, [1, 1]);
  assert.equal(second.status, 201, JSON.stringify(second.body));
  await phase(c, { phase: 'souffle', dort: true }).expect(200);
  const draft = await queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [
    relance.body.draft.id,
  ]);
  assert.notEqual(draft.status, 'rembourse');
  assert.equal(await gemmes(c, 0), avant - 2 + membres(c, 0).length);
});

// ---------------------------------------------------------------------
// P3 — présenter exige une partie en cours
// ---------------------------------------------------------------------

test('P3 — partie en pause : `present-question` et `present-arrival` répondent 409', async () => {
  const c = await partie();
  await poser(c, 0, 1);
  await poser(c, 1, 2);
  await execute("UPDATE gl_games SET status = 'paused' WHERE id = ?", [c.game.id]);
  const q = await presenter(c, c.adminToken, c.markers[1].id, { teamId: c.teams[0].id });
  assert.equal(q.status, 409, JSON.stringify(q.body));
  assert.equal(q.body.error, 'La partie doit être en cours');
  const a = await request(app)
    .post(api(c, `/markers/${c.markers[2].id}/present-arrival`))
    .set(auth(c.adminToken))
    .send({ teamId: c.teams[1].id });
  assert.equal(a.status, 409, JSON.stringify(a.body));
  assert.equal(a.body.error, 'La partie doit être en cours');
  const evts = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type IN ('marker_question_presented', 'marker_arrival', 'marker_effect')",
    [c.game.id],
  );
  assert.equal(evts.length, 0);
});
