'use strict';

/**
 * « Tenir à deux », lot 2, étape 2.2 — lien de classe permanent (QR) et session d'équipe.
 * Une tablette ouvre le lien, touche la mascotte de son équipe et joue avec les droits d'un
 * membre : sa partie, son équipe, pendant un tour ouvert. Aucun nom d'élève ne sort du lien.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const {
  createTenirGame,
  setPlayerBourses,
  ouvrirTourEnJeu,
  importExempleChasse,
} = require('./helpers/glTenirFixtures');
const { CODE_ALPHABET, normalizeCode } = require('../lib/glClassLink');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');

let ctx;
let lien;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p, c = ctx) => `/api/gl/games/${c.game.id}${p}`;
const equipe = (i) => ctx.teams[i];
const membres = (teamId) => ctx.players.filter((p) => Number(p.teamId) === Number(teamId));

async function ouvrirSession(teamId, by = { code: lien.code }) {
  const res = await request(app)
    .post('/api/gl/class-link/session')
    .send({ ...by, teamId });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

async function phase(nom, extra = {}) {
  const res = await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: nom, ...extra });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  for (const p of ctx.players) await setPlayerBourses(p.id, 5, 5);
});

test('lien de classe : créé une fois, permanent, réservé au prof ; code sans caractère ambigu', async () => {
  const url = `/api/gl/classes/${ctx.cls.id}/lien`;
  const cree = await request(app).get(url).set(auth(ctx.adminToken));
  assert.equal(cree.status, 200, JSON.stringify(cree.body));
  lien = cree.body;
  assert.match(lien.url, /^gl\.html\?classe=[\w-]{20,}$/);
  assert.equal(lien.code.length, 8);
  for (const c of lien.code) assert.ok(CODE_ALPHABET.includes(c), `caractère ambigu : ${c}`);
  assert.ok(!/[01OIL]/.test(CODE_ALPHABET));
  assert.equal(lien.className, ctx.cls.name);

  const encore = await request(app).get(url).set(auth(ctx.adminToken));
  assert.equal(encore.body.code, lien.code, 'le lien est permanent');
  assert.equal(encore.body.url, lien.url);

  const eleve = await request(app).get(url).set(auth(ctx.players[0].token));
  assert.equal(eleve.status, 403);
  const inconnue = await request(app)
    .get('/api/gl/classes/99999999/lien')
    .set(auth(ctx.adminToken));
  assert.equal(inconnue.status, 404);
  // Seul le hachage du jeton est stocké.
  const row = await db.queryOne('SELECT token_hash FROM gl_class_links WHERE class_id = ?', [
    ctx.cls.id,
  ]);
  const jeton = new URL(lien.url, 'http://x').searchParams.get('classe');
  assert.notEqual(row.token_hash, jeton);
  assert.equal(
    normalizeCode(` ${lien.code.slice(0, 4).toLowerCase()}-${lien.code.slice(4)} `),
    lien.code,
  );
});

test('ouverture du lien : classe, partie, équipes, phase — aucun nom d’élève', async () => {
  const jeton = new URL(lien.url, 'http://x').searchParams.get('classe');
  for (const by of [{ code: lien.code }, { token: jeton }, { code: lien.code.toLowerCase() }]) {
    const res = await request(app).post('/api/gl/class-link/open').send(by);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.className, ctx.cls.name);
    assert.equal(res.body.game.id, Number(ctx.game.id));
    assert.equal(res.body.teams.length, 4);
    assert.deepEqual(Object.keys(res.body.teams[0]).sort(), [
      'color',
      'mascotId',
      'name',
      'teamId',
      'type',
    ]);
    const brut = JSON.stringify(res.body);
    assert.ok(!brut.includes('joueur-'), 'aucun pseudo');
    assert.ok(!/healthPoints|powerPoints/.test(brut), 'aucune bourse');
  }
  const inconnu = await request(app).post('/api/gl/class-link/open').send({ code: 'ZZZZZZZZ' });
  assert.equal(inconnu.status, 404);
  assert.equal(inconnu.body.code, 'CLASS_LINK_INCONNU');
  const vide = await request(app).post('/api/gl/class-link/open').send({});
  assert.equal(vide.status, 404);
  const sansEquipe = await request(app)
    .post('/api/gl/class-link/session')
    .send({ code: lien.code, teamId: 99999999 });
  assert.equal(sansEquipe.status, 404);
});

test('hors tour : la tablette lit sa partie sans aucune bourse, et ne fait aucun geste', async () => {
  const team = equipe(0);
  const s = await ouvrirSession(team.id);
  assert.equal(s.gameId, Number(ctx.game.id));
  assert.equal(s.teamId, Number(team.id));
  const etat = await request(app).get(api('')).set(auth(s.token));
  assert.equal(etat.status, 200, JSON.stringify(etat.body));
  assert.equal(etat.body.tenir.tablette.horsTour, true);
  for (const r of etat.body.roster) {
    assert.equal('healthPoints' in r, false, 'aucune bourse hors tour');
    assert.equal('powerPoints' in r, false);
  }
  assert.deepEqual(etat.body.vitality?.byPlayerId || {}, {});
  assert.deepEqual(etat.body.tenir.reserves, []);
  assert.ok(Object.values(etat.body.tenir.permissions).every((v) => v === false));

  const jet = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(s.token))
    .send({ mode: 'serveur' });
  assert.equal(jet.status, 409, JSON.stringify(jet.body));
  assert.equal(jet.body.code, 'TEAM_SESSION_HORS_TOUR');
  const fouille = await request(app)
    .post(api('/chasse/fouiller'))
    .set(auth(s.token))
    .send({ x: 0.5, y: 0.5 });
  assert.equal(fouille.status, 409);
  assert.equal(fouille.body.code, 'TEAM_SESSION_HORS_TOUR');
});

test('quatre sessions d’équipe jouent un tour complet en parallèle', async () => {
  const sessions = await Promise.all(ctx.teams.map((t) => ouvrirSession(t.id)));
  await ouvrirTourEnJeu(request, app, ctx);

  // Pendant le tour : les bourses de SON équipe seulement.
  const etat = await request(app).get(api('')).set(auth(sessions[0].token));
  assert.equal(etat.body.tenir.tablette.horsTour, false);
  assert.equal(etat.body.tenir.permissions.lancer, true);
  for (const r of etat.body.roster) {
    const mienne = Number(r.teamId) === Number(equipe(0).id);
    assert.equal('healthPoints' in r, mienne, 'bourses de son équipe seulement');
  }
  assert.equal(etat.body.tenir.reserves.length, 1);

  const jets = await Promise.all(
    sessions.map((s) =>
      request(app).post(api('/tenir/lancer')).set(auth(s.token)).send({ mode: 'serveur' }),
    ),
  );
  for (const j of jets) assert.equal(j.status, 201, JSON.stringify(j.body));

  const fouilles = await Promise.all(
    sessions.map((s, i) =>
      request(app)
        .post(api('/chasse/fouiller'))
        .set(auth(s.token))
        .send({ x: 0.1 + i * 0.2, y: 0.9 }),
    ),
  );
  for (const f of fouilles) assert.equal(f.status, 201, JSON.stringify(f.body));

  // Chaque équipe garde son jet (case en suspens appliquée) puis lit le carnet de la classe.
  for (const s of sessions) {
    const garde = await request(app).post(api('/tenir/arrivee/garder')).set(auth(s.token));
    assert.ok([200, 409].includes(garde.status), JSON.stringify(garde.body));
    const carnet = await request(app).get(api('/chasse')).set(auth(s.token));
    assert.equal(carnet.status, 200, JSON.stringify(carnet.body));
    assert.equal(carnet.body.viewerTeamId, s.teamId);
    assert.ok(carnet.body.fouilles, 'quota de fouilles de son équipe');
  }

  // Question de case : une équipe posée sur une case « question » la reçoit et y répond.
  const quiz = ctx.markers.find((m) => m.event_type === 'quiz');
  await db.execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    quiz.id,
    equipe(1).id,
  ]);
  const question = await request(app)
    .post(api(`/markers/${quiz.id}/present-question`))
    .set(auth(sessions[1].token))
    .send({});
  assert.equal(question.status, 200, JSON.stringify(question.body));
  const reponse = await request(app).post(api('/qcm/answer')).set(auth(sessions[1].token)).send({
    questionCode: question.body.questionCode,
    presentationToken: question.body.presentation.presentationToken,
    choiceId: question.body.presentation.choices[0].id,
  });
  assert.equal(reponse.status, 200, JSON.stringify(reponse.body));
  assert.ok(!/\b(faux|rat[ée]e?|perdu)\b/i.test(String(reponse.body.feedback || '')));

  await phase('souffle', { dort: true });
  await phase('clos');

  // Journal : un geste de tablette est signé de l'équipe, jamais d'un élève.
  const gestes = await db.queryAll(
    `SELECT DISTINCT actor_type, actor_id FROM gl_game_events
      WHERE game_id = ? AND actor_id LIKE 'equipe-%'`,
    [ctx.game.id],
  );
  assert.equal(gestes.length, 4);
  for (const g of gestes) assert.equal(g.actor_type, 'team');
  assert.deepEqual(
    gestes.map((g) => g.actor_id).sort(),
    ctx.teams.map((t) => `equipe-${t.id}`).sort(),
  );
  // Quatre jets, un par équipe (une bonne réponse de case rend ensuite son jet à l'équipe :
  // on compte donc les jets au journal, pas le marqueur « a déjà jeté »).
  const jetsDuTour = await db.queryOne(
    "SELECT COUNT(DISTINCT team_id) AS c FROM gl_game_events WHERE game_id = ? AND event_type = 'dice_roll'",
    [ctx.game.id],
  );
  assert.equal(Number(jetsDuTour.c), 4);
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);
});

test('un membre en retrait ne retire pas le Marché à la tablette de son équipe', async () => {
  const team = equipe(2);
  const [eleve] = membres(team.id);
  const s = await ouvrirSession(team.id);
  const retrait = await request(app)
    .post(api('/tenir/retrait'))
    .set(auth(ctx.adminToken))
    .send({ playerId: eleve.id, entree: true, motif: 'test' });
  assert.ok([200, 201].includes(retrait.status), JSON.stringify(retrait.body));
  await ouvrirTourEnJeu(request, app, ctx);

  const etatEleve = await request(app).get(api('')).set(auth(eleve.token));
  assert.equal(etatEleve.body.tenir.enRetrait, true);
  assert.equal(etatEleve.body.tenir.permissions.marche, false);
  const etat = await request(app).get(api('')).set(auth(s.token));
  assert.equal(etat.body.tenir.enRetrait, false, 'le retrait reste individuel');
  assert.equal(etat.body.tenir.permissions.marche, true);
  assert.deepEqual(etat.body.tenir.retraits, [], 'la tablette ne voit pas qui est en retrait');

  await request(app)
    .post(api('/tenir/retrait'))
    .set(auth(ctx.adminToken))
    .send({ playerId: eleve.id, entree: false });
});

test('session d’une équipe refusée sur une autre ; déconnectée par le prof → refus au geste suivant', async () => {
  // Tour ouvert par le test précédent.
  const s = await ouvrirSession(equipe(3).id);
  const ailleurs = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(s.token))
    .send({ mode: 'serveur', teamId: equipe(0).id });
  assert.equal(ailleurs.status, 403, JSON.stringify(ailleurs.body));
  assert.equal(ailleurs.body.code, 'TEAM_SESSION_AUTRE_EQUIPE');

  const liste = await request(app).get(api('/tenir/sessions')).set(auth(ctx.adminToken));
  assert.equal(liste.status, 200, JSON.stringify(liste.body));
  const mienne = liste.body.sessions.filter((x) => Number(x.teamId) === Number(equipe(3).id));
  assert.ok(mienne.length >= 1);
  assert.ok(!JSON.stringify(liste.body).includes(s.token), 'aucun jeton dans la liste');
  const eleve = await request(app).get(api('/tenir/sessions')).set(auth(ctx.players[0].token));
  assert.equal(eleve.status, 403);

  for (const x of mienne) {
    const coupe = await request(app)
      .delete(api(`/tenir/sessions/${x.id}`))
      .set(auth(ctx.adminToken));
    assert.equal(coupe.status, 200, JSON.stringify(coupe.body));
  }
  const apres = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(s.token))
    .send({ mode: 'serveur' });
  assert.equal(apres.status, 401, JSON.stringify(apres.body));
  assert.equal(apres.body.code, 'TEAM_SESSION_TERMINEE');
});

test('lien régénéré : l’ancien QR et l’ancien code sont refusés, les sessions de la classe tombent', async () => {
  const s = await ouvrirSession(equipe(0).id);
  const ancien = { ...lien };
  const ancienJeton = new URL(ancien.url, 'http://x').searchParams.get('classe');
  const regen = await request(app)
    .post(`/api/gl/classes/${ctx.cls.id}/lien/regenerer`)
    .set(auth(ctx.adminToken));
  assert.equal(regen.status, 200, JSON.stringify(regen.body));
  assert.notEqual(regen.body.code, ancien.code);
  assert.ok(regen.body.sessionsRevoquees >= 1);
  lien = regen.body;

  for (const by of [{ code: ancien.code }, { token: ancienJeton }]) {
    const res = await request(app).post('/api/gl/class-link/open').send(by);
    assert.equal(res.status, 404, JSON.stringify(res.body));
  }
  const lu = await request(app).get(api('/tenir/tour')).set(auth(s.token));
  assert.equal(lu.status, 401);
  const nouveau = await request(app).post('/api/gl/class-link/open').send({ code: lien.code });
  assert.equal(nouveau.status, 200);
});

test('partie close : plus de session d’équipe ; classe sans partie en cours → message d’attente', async () => {
  const s = await ouvrirSession(equipe(1).id);
  await db.execute("UPDATE gl_games SET status = 'ended' WHERE id = ?", [ctx.game.id]);
  const lu = await request(app).get(api('/tenir/tour')).set(auth(s.token));
  assert.equal(lu.status, 401, JSON.stringify(lu.body));
  const ouvre = await request(app).post('/api/gl/class-link/open').send({ code: lien.code });
  assert.equal(ouvre.status, 200);
  assert.equal(ouvre.body.game, null);
  const session = await request(app)
    .post('/api/gl/class-link/session')
    .send({ code: lien.code, teamId: equipe(1).id });
  assert.equal(session.status, 409);
  assert.equal(session.body.code, 'CLASS_LINK_SANS_PARTIE');
});
