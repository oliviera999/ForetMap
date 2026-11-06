'use strict';

/**
 * « Tenir à deux » v2 — la chasse par l'API : fouilles (verdicts, empreintes, quota), question
 * de chasse (fixe puis secours), page trouvée (feuillet découvert, carnet personnel), pages
 * déjà trouvées, carnet de la classe sans polygone pour un élève, lecture en projection.
 * Fixtures anonymes (`joueur-a-<stamp>`).
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, queryAll } = db;
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
  readPlayerBourses,
} = require('./helpers/glTenirFixtures');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
const gnomeA = () => ctx.players[0]; // équipe 0 (gnome)
const licorneA = () => ctx.players[2]; // équipe 2 (licorne)

/** Choix correct d'une présentation (la question de secours peut venir du catalogue réel). */
async function bonneReponse(question) {
  const row = await queryOne(
    'SELECT choix_a, choix_b, choix_c, choix_d, choix_e, reponse_correcte FROM gl_qcm_questions WHERE question_code = ?',
    [question.questionCode],
  );
  const text = row[`choix_${String(row.reponse_correcte).toLowerCase()}`];
  return question.choices.find((c) => c.text === text);
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('GET /chasse : carnet de la classe (indices, états endormis), aucun polygone pour un élève', async () => {
  const res = await request(app).get(api('/chasse')).set(auth(gnomeA().token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.total, 2);
  const page = res.body.pages.find((p) => p.zoneKey === 'cz-p1-01');
  assert.equal(page.etat, 'endormie');
  assert.ok(page.indice);
  assert.equal(page.points, undefined, 'polygone jamais servi à un élève');
  assert.equal(page.contour, null);
  assert.equal(page.feuilletCode, null, 'le feuillet reste caché tant que la page dort');
  assert.equal(res.body.fouilles.quota, 1, 'un gnome a une fouille par tour');
  const mj = await request(app).get(api('/chasse')).set(auth(ctx.adminToken));
  assert.ok(Array.isArray(mj.body.pages[0].points), 'le prof reçoit la géométrie');
});

test('fouiller à côté : verdict chaud / tiède / froid, empreinte publique, oiseau déplacé, quota consommé', async () => {
  // Licornes A : 2 fouilles. Zone cz-p1-01 centrée en (0.35, 0.30).
  const chaud = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(licorneA().token))
    .send({ x: 0.35, y: 0.355 });
  assert.equal(chaud.status, 201, JSON.stringify(chaud.body));
  assert.equal(chaud.body.verdict, 'chaud');
  assert.equal(chaud.body.question, null);
  assert.equal(chaud.body.kraa.etat, 'chaud');
  assert.equal(chaud.body.fouilles.restantes, 1);

  const froid = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(licorneA().token))
    .send({ x: 0.9, y: 0.9 });
  assert.equal(froid.status, 201);
  assert.equal(froid.body.verdict, 'froid');
  assert.equal(froid.body.fouilles.restantes, 0);

  const epuise = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(licorneA().token))
    .send({ x: 0.5, y: 0.5 });
  assert.equal(epuise.status, 409);
  assert.equal(epuise.body.code, 'FOUILLES_EPUISEES');

  const tiede = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(ctx.adminToken))
    .send({ teamId: ctx.teams[3].id, x: 0.35, y: 0.42 });
  assert.equal(tiede.status, 201, JSON.stringify(tiede.body));
  assert.equal(tiede.body.verdict, 'tiede', 'le prof fouille pour une équipe (sur son quota)');

  const carnet = await request(app).get(api('/chasse')).set(auth(gnomeA().token));
  assert.equal(carnet.body.empreintes.length, 3, 'les empreintes sont visibles de toute la classe');
  assert.equal(carnet.body.empreintes.filter((e) => e.teamId === licorneA().teamId).length, 2);
  assert.equal(carnet.body.kraa.etat, 'tiede');
});

test('fouiller dans une zone : question fixe, mauvaise réponse → page révélée, « pas encore », rien retiré', async () => {
  const before = await readPlayerBourses(gnomeA().id);
  const res = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(gnomeA().token))
    .send({ x: 0.35, y: 0.3 });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.verdict, 'zone');
  assert.equal(res.body.zoneKey, 'cz-p1-01');
  assert.equal(
    res.body.question.questionCode,
    'TEX-P1-01',
    'première tentative : la question fixe',
  );
  const wrong = res.body.question.choices.find((c) => c.text !== 'La forêt respire');
  const answer = await request(app).post(api('/chasse/repondre')).set(auth(gnomeA().token)).send({
    presentationToken: res.body.question.presentationToken,
    questionCode: res.body.question.questionCode,
    choiceId: wrong.id,
  });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.equal(answer.body.correct, false);
  assert.equal(answer.body.etat, 'revelee');
  assert.match(answer.body.feedback, /^Pas encore/);
  assert.doesNotMatch(answer.body.feedback, /faux|raté|perdu/i);
  assert.deepEqual(await readPlayerBourses(gnomeA().id), before, 'aucune ressource retirée');
  const carnet = await request(app).get(api('/chasse')).set(auth(licorneA().token));
  const page = carnet.body.pages.find((p) => p.zoneKey === 'cz-p1-01');
  assert.equal(page.etat, 'revelee');
  assert.ok(page.contour, 'contour visible de tous');
  // Le gnome n'a plus de fouille ce tour : la question de secours viendra au tour suivant.
  const epuise = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(gnomeA().token))
    .send({ x: 0.35, y: 0.3 });
  assert.equal(epuise.status, 409);
});

test('tour suivant : zone déjà tentée → question du thème de secours (code différent), bonne réponse → page trouvée', async () => {
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
  const res = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(gnomeA().token))
    .send({ x: 0.35, y: 0.3 });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.notEqual(res.body.question.questionCode, 'TEX-P1-01');
  const right = await bonneReponse(res.body.question);
  const before = await readPlayerBourses(gnomeA().id);
  const answer = await request(app).post(api('/chasse/repondre')).set(auth(gnomeA().token)).send({
    presentationToken: res.body.question.presentationToken,
    questionCode: res.body.question.questionCode,
    choiceId: right.id,
  });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.equal(answer.body.correct, true);
  assert.equal(answer.body.etat, 'trouvee');
  assert.equal(answer.body.feuilletCode, 'tenir-ex-p1-1');
  assert.equal(answer.body.kraa.etat, 'page_trouvee');
  assert.deepEqual(
    await readPlayerBourses(gnomeA().id),
    before,
    'une page trouvée ne donne aucune ressource',
  );

  const state = await queryOne(
    'SELECT status FROM gl_game_feuillet_states WHERE game_id = ? AND team_id = ? AND feuillet_code = ?',
    [ctx.game.id, gnomeA().teamId, 'tenir-ex-p1-1'],
  );
  assert.equal(state.status, 'discovered');
  const perso = await queryOne(
    'SELECT status FROM gl_player_feuillet_states WHERE player_id = ? AND feuillet_code = ?',
    [gnomeA().id, 'tenir-ex-p1-1'],
  );
  assert.equal(perso.status, 'discovered', 'carnet personnel des membres présents');
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'page_trouvee' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(JSON.parse(evt.payload_json).zoneKey, 'cz-p1-01');

  const carnet = await request(app).get(api('/chasse')).set(auth(licorneA().token));
  const page = carnet.body.pages.find((p) => p.zoneKey === 'cz-p1-01');
  assert.equal(page.etat, 'trouvee');
  assert.equal(page.trouveePar.id, gnomeA().teamId);
  assert.equal(page.titre, "Page d'exemple tenir-ex-p1-1");
});

test('fouiller une page déjà trouvée : « déjà trouvée », aucune fouille consommée', async () => {
  const res = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(licorneA().token))
    .send({ x: 0.35, y: 0.3 });
  assert.equal(res.status, 201);
  assert.equal(res.body.verdict, 'deja_trouvee');
  const carnet = await request(app).get(api('/chasse')).set(auth(licorneA().token));
  assert.equal(carnet.body.fouilles.utilisees, 0);
  const empreintes = await queryAll(
    'SELECT id FROM gl_game_chasse_empreintes WHERE game_id = ? AND round_number = 2',
    [ctx.game.id],
  );
  assert.equal(empreintes.length, 1, 'seule la fouille du gnome compte au tour 2');
});

test('le MJ fouille pour une équipe (teamId) ; un joueur hors partie est refusé ; projection lit le carnet', async () => {
  const mj = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(ctx.adminToken))
    .send({ teamId: ctx.teams[1].id, x: 0.55, y: 0.3 });
  assert.equal(mj.status, 201, JSON.stringify(mj.body));
  assert.equal(mj.body.verdict, 'zone');
  assert.equal(mj.body.zoneKey, 'cz-p1-02');

  const proj = await request(app).post(api('/projection-token')).set(auth(ctx.adminToken));
  assert.equal(proj.status, 201, JSON.stringify(proj.body));
  const view = await request(app).get(api('/chasse')).set(auth(proj.body.token));
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.equal(view.body.viewerTeamId, null);
  assert.equal(view.body.fouilles, null);
  assert.equal(view.body.pages[0].points, undefined);
  await execute('DELETE FROM gl_game_events WHERE game_id = ? AND id < 0', [ctx.game.id]);
});
