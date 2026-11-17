'use strict';

/**
 * « Tenir à deux » — présences par équipe. Ensemble unifié (M14) : **tout le monde est présent
 * par défaut**. Rien n'est à confirmer, rien n'attend dans la file du prof, et un pot de sort se
 * crée sans confirmation. En hybride et sur tablette, une équipe dit s'il manque quelqu'un : un
 * absent ne paie pas et n'entre pas dans les mesures de présence ; un retardataire revient dans
 * le pot suivant.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { createTenirGame, setPlayerBourses, ouvrirTourEnJeu } = require('./helpers/glTenirFixtures');
const { issueTeamSession } = require('../lib/glGuestToken');
const { listPresentMembers } = require('../lib/glTenir');
const { listDemandes } = require('../lib/glDemandes');
const { presentJournalEvent } = require('../lib/glJournalPresent');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p, c = ctx) => `/api/gl/games/${c.game.id}${p}`;
const membres = (teamId, c = ctx) => c.players.filter((p) => Number(p.teamId) === Number(teamId));
const tourCourant = async (c = ctx) =>
  Number(
    (await db.queryOne('SELECT current_round_number AS r FROM gl_games WHERE id = ?', [c.game.id]))
      .r,
  );
const pot = (token, body, c = ctx) =>
  request(app).post(api('/spell-casts/drafts', c)).set(auth(token)).send(body);

async function phase(nom, extra = {}, c = ctx) {
  const res = await request(app)
    .post(api('/tenir/tour/phase', c))
    .set(auth(c.adminToken))
    .send({ phase: nom, ...extra });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}

before(async () => {
  await db.initSchema();
  // Abri (SL043) s'ouvre au chapitre 2 (ensemble unifié, M6).
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 2 });
  for (const p of ctx.players) await setPlayerBourses(p.id, 6, 6);
});

test('tour ouvert sur tablette : tout le monde est présent d’office — rien à confirmer, aucune demande, le pot se crée', async () => {
  await ouvrirTourEnJeu(request, app, ctx, { presences: false });
  const gnomes = ctx.teams[0];
  const [eleve] = membres(gnomes.id);

  const vue = await request(app).get(api('/tenir/tour')).set(auth(eleve.token));
  assert.equal(vue.status, 200, JSON.stringify(vue.body));
  // Le geste « Il manque quelqu'un ? » reste proposé ; personne n'a rien déclaré.
  assert.equal(vue.body.presences.requise, true);
  assert.equal(vue.body.presences.equipes.length, 4);
  assert.ok(vue.body.presences.equipes.every((e) => e.confirmee === false));
  // Un élève ne voit les absents que de sa propre équipe.
  for (const e of vue.body.presences.equipes) {
    assert.equal('absents' in e, Number(e.teamId) === Number(gnomes.id));
  }
  assert.deepEqual(await listDemandes(db, ctx.game.id), [], 'rien n’attend le prof');
  const tour = await tourCourant();
  assert.equal(
    (await listPresentMembers(db, ctx.game.id, gnomes.id, tour)).length,
    membres(gnomes.id).length,
    'tous les membres sont présents',
  );

  // Sans confirmation, le pot se crée et tous les membres y figurent.
  const cree = await pot(eleve.token, {
    spellCode: 'SL043',
    teamId: gnomes.id,
    ressource: 'coeurs',
  });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  assert.equal(cree.body.draft.presents.length, membres(gnomes.id).length);
  await request(app)
    .delete(api(`/spell-casts/drafts/${cree.body.draft.id}`))
    .set(auth(eleve.token));
});

test('« Il manque quelqu’un ? » : l’absent sort du pot et des présents ; un membre d’une autre équipe est refusé', async () => {
  const gnomes = ctx.teams[0];
  const [eleve, absent] = membres(gnomes.id);
  const etranger = membres(ctx.teams[1].id)[0];
  const tour = await tourCourant();

  const intrus = await request(app)
    .post(api('/tenir/presences'))
    .set(auth(eleve.token))
    .send({ absents: [etranger.id] });
  assert.equal(intrus.status, 400, JSON.stringify(intrus.body));
  assert.equal(intrus.body.code, 'PRESENCE_ABSENT_INVALIDE');

  const ok = await request(app)
    .post(api('/tenir/presences'))
    .set(auth(eleve.token))
    .send({ absents: [absent.id] });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual(ok.body.absents, [absent.id]);
  const presents = await listPresentMembers(db, ctx.game.id, gnomes.id, tour);
  assert.ok(!presents.includes(absent.id), 'absent exclu des présents (pot, mesures de présence)');
  assert.ok(presents.includes(eleve.id));

  const vue = await request(app).get(api('/tenir/tour')).set(auth(eleve.token));
  const mienne = vue.body.presences.equipes.find((e) => Number(e.teamId) === Number(gnomes.id));
  assert.equal(mienne.confirmee, true);
  assert.deepEqual(mienne.absents, [absent.id]);

  // Le pot se crée, et l'absent n'y figure pas.
  const cree = await pot(eleve.token, {
    spellCode: 'SL043',
    teamId: gnomes.id,
    ressource: 'coeurs',
  });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const lignes = cree.body.draft.contributions || [];
  assert.ok(lignes.length >= 1);
  assert.ok(!lignes.some((c) => Number(c.playerId) === Number(absent.id)), 'l’absent ne paie pas');
  await request(app)
    .delete(api(`/spell-casts/drafts/${cree.body.draft.id}`))
    .set(auth(eleve.token));

  // Journal : le nombre d'absents est public, leurs identités restent au prof.
  const evt = await db.queryOne(
    "SELECT id, payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'presence_confirmee' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(evt.payload_json);
  assert.equal(payload.private, true);
  assert.deepEqual(payload.publicKeys, ['roundNumber', 'teamId', 'count']);
  const etat = await request(app).get(api('')).set(auth(etranger.token));
  const vu = etat.body.events.find((e) => Number(e.id) === Number(evt.id));
  assert.equal(vu.payload.playerIds, undefined, 'identités des absents masquées aux élèves');
  assert.equal(vu.payload.count, 1);
  const libelle = presentJournalEvent(
    {
      eventType: 'presence_confirmee',
      teamId: gnomes.id,
      payload: { count: 1, teamId: gnomes.id },
    },
    {
      teamsById: { [gnomes.id]: { id: gnomes.id, name: 'Gnomes A' } },
      forPlayer: true,
      tenir: true,
    },
  );
  assert.match(`${libelle.title} ${libelle.body}`, /1 absent/);
});

test('retardataire : « Quelqu’un vient d’arriver » le remet dans le pot suivant', async () => {
  const gnomes = ctx.teams[0];
  const [eleve, absent] = membres(gnomes.id);
  const tour = await tourCourant();
  const arrive = await request(app)
    .post(api('/tenir/presences/arrivee'))
    .set(auth(eleve.token))
    .send({ playerId: absent.id });
  assert.equal(arrive.status, 200, JSON.stringify(arrive.body));
  assert.ok((await listPresentMembers(db, ctx.game.id, gnomes.id, tour)).includes(absent.id));
  const encore = await request(app)
    .post(api('/tenir/presences/arrivee'))
    .set(auth(eleve.token))
    .send({ playerId: absent.id });
  assert.equal(encore.status, 409);
  assert.equal(encore.body.code, 'PRESENCE_PAS_ABSENT');

  const cree = await pot(eleve.token, {
    spellCode: 'SL043',
    teamId: gnomes.id,
    ressource: 'coeurs',
  });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  assert.ok(
    (cree.body.draft.contributions || []).some((c) => Number(c.playerId) === Number(absent.id)),
    'le retardataire est dans le pot suivant',
  );
  await request(app)
    .delete(api(`/spell-casts/drafts/${cree.body.draft.id}`))
    .set(auth(eleve.token));
});

test('tablette d’équipe : déclare pour SON équipe ; le prof corrige à tout moment ; l’appel du prof vaut pour tout le monde', async () => {
  const licornes = ctx.teams[2];
  const [a, b] = membres(licornes.id);
  const s = await issueTeamSession(db, { gameId: ctx.game.id, teamId: licornes.id });
  const tablette = await request(app)
    .post(api('/tenir/presences'))
    .set(auth(s.token))
    .send({ absents: [] });
  assert.equal(tablette.status, 200, JSON.stringify(tablette.body));
  const ailleurs = await request(app)
    .post(api('/tenir/presences'))
    .set(auth(s.token))
    .send({ teamId: ctx.teams[3].id, absents: [] });
  assert.equal(ailleurs.status, 403);
  assert.equal(ailleurs.body.code, 'TEAM_SESSION_AUTRE_EQUIPE');
  const evt = await db.queryOne(
    "SELECT actor_type, actor_id FROM gl_game_events WHERE game_id = ? AND event_type = 'presence_confirmee' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.deepEqual({ ...evt }, { actor_type: 'team', actor_id: `equipe-${licornes.id}` });

  // Le prof corrige : b est absent.
  const prof = await request(app)
    .post(api('/tenir/presences'))
    .set(auth(ctx.adminToken))
    .send({ teamId: licornes.id, absents: [b.id] });
  assert.equal(prof.status, 200, JSON.stringify(prof.body));
  const tour = await tourCourant();
  assert.deepEqual(await listPresentMembers(db, ctx.game.id, licornes.id, tour), [
    ...membres(licornes.id)
      .map((m) => m.id)
      .filter((id) => id !== b.id),
  ]);
  assert.ok(a.id);

  // L'appel du prof (console) confirme toutes les équipes d'un coup.
  const appel = await request(app)
    .post(api('/tenir/tour/absences'))
    .set(auth(ctx.adminToken))
    .send({ playerIds: [b.id] });
  assert.equal(appel.status, 200, JSON.stringify(appel.body));
  const vue = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken));
  assert.ok(vue.body.presences.equipes.every((e) => e.confirmee === true));
  assert.ok(
    vue.body.presences.equipes.every((e) => Array.isArray(e.absents)),
    'le prof voit tout',
  );
});

test('après la phase de jeu, une équipe ne déclare plus d’absent ; rien n’est resté en attente', async () => {
  await phase('souffle', { dort: true });
  await phase('clos');
  await ouvrirTourEnJeu(request, app, ctx, { presences: false });
  assert.deepEqual(await listDemandes(db, ctx.game.id), []);
  await phase('souffle', { dort: true });
  const tard = await request(app)
    .post(api('/tenir/presences'))
    .set(auth(membres(ctx.teams[0].id)[0].token))
    .send({ absents: [] });
  assert.equal(tard.status, 409, JSON.stringify(tard.body));
  assert.equal(tard.body.code, 'PRESENCE_PHASE');
  const vue = await request(app).get(api('/tenir/tour')).set(auth(ctx.adminToken));
  assert.equal(vue.body.presences.requise, false);
  await phase('clos');
});

test('au tableau, rien ne change : le geste n’est pas proposé, le pot du prof se crée', async () => {
  const autre = await createTenirGame({ stamp: Date.now() + 7 });
  await db.execute(
    "UPDATE gl_games SET tenir_surface = 'tableau', tenir_overrides_json = NULL WHERE id = ?",
    [autre.game.id],
  );
  for (const p of autre.players) await setPlayerBourses(p.id, 6, 6);
  await ouvrirTourEnJeu(request, app, autre, { presences: false });
  const vue = await request(app).get(api('/tenir/tour', autre)).set(auth(autre.adminToken));
  assert.equal(vue.body.presences.requise, false);
  const active = vue.body.round.equipeActiveId;
  const cree = await pot(
    autre.adminToken,
    { spellCode: 'SL036', teamId: active, ressource: 'coeurs' },
    autre,
  );
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
});
