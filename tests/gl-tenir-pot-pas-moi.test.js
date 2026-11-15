'use strict';

/**
 * « Tenir à deux », lot 2, étape 2.4 — pot de sort : partage automatique entre présents,
 * « pas moi », plus de saisie de part sur la tablette de l'équipe, saisie d'un compte élève
 * limitée à l'équipe lanceuse. Un pot « Tenir » ne part plus vers toute la partie.
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
  readPlayerBourses,
  ouvrirTourEnJeu,
} = require('./helpers/glTenirFixtures');
const { issueTeamSession } = require('../lib/glGuestToken');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const membres = (teamId) => ctx.players.filter((p) => Number(p.teamId) === Number(teamId));
const pot = (token, body) =>
  request(app).post(api('/spell-casts/drafts')).set(auth(token)).send(body);
const exclure = (token, draftId, body) =>
  request(app)
    .post(api(`/spell-casts/drafts/${draftId}/exclure`))
    .set(auth(token))
    .send(body);
const part = (draft, playerId) =>
  (draft.contributions || []).find((c) => Number(c.playerId) === Number(playerId)) || {
    hearts: 0,
    gems: 0,
  };
const sommeCoeurs = (draft) => (draft.contributions || []).reduce((s, c) => s + c.hearts, 0);

// Gnomes A : trois membres (joueurs a, e, i). Abri (SL043) coûte 2 cœurs, fenêtre « jeu ».
let gnomes;
let a;
let e;
let i;

before(async () => {
  await db.initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  gnomes = ctx.teams[0];
  [a, e, i] = membres(gnomes.id);
  assert.ok(a && e && i, 'trois membres dans l’équipe');
  for (const p of ctx.players) await setPlayerBourses(p.id, 4, 4);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('« pas moi » : le partage se refait entre les présents restants, sans dépasser aucun solde', async () => {
  await setPlayerBourses(a.id, 4, 4);
  await setPlayerBourses(e.id, 1, 4);
  await setPlayerBourses(i.id, 4, 4);
  const cree = await pot(a.token, { spellCode: 'SL043', teamId: gnomes.id });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const draft = cree.body.draft;
  assert.equal(sommeCoeurs(draft), 2);
  assert.deepEqual([...draft.presents].sort(), [a.id, e.id, i.id].sort());
  assert.deepEqual(draft.exclus, []);

  // Un élève ne retire que lui-même.
  const pourUnAutre = await exclure(a.token, draft.id, { playerId: e.id, exclu: true });
  assert.equal(pourUnAutre.status, 403, JSON.stringify(pourUnAutre.body));
  assert.equal(pourUnAutre.body.code, 'QUI_AGIT_INVALIDE');

  const sansA = await exclure(a.token, draft.id, { playerId: a.id, exclu: true });
  assert.equal(sansA.status, 200, JSON.stringify(sansA.body));
  assert.deepEqual(sansA.body.draft.exclus, [a.id]);
  assert.deepEqual(part(sansA.body.draft, a.id), { hearts: 0, gems: 0 });
  assert.equal(sommeCoeurs(sansA.body.draft), 2, 'le coût reste couvert');
  assert.ok(part(sansA.body.draft, e.id).hearts <= 1, 'jamais au-delà du solde de e');
  assert.ok(part(sansA.body.draft, i.id).hearts <= 4);
  assert.equal(sansA.body.draft.ready, true);

  const remis = await exclure(a.token, draft.id, { playerId: a.id, exclu: false });
  assert.equal(remis.status, 200);
  assert.deepEqual(remis.body.draft.exclus, []);
  assert.equal(sommeCoeurs(remis.body.draft), 2);
  await request(app)
    .delete(api(`/spell-casts/drafts/${draft.id}`))
    .set(auth(a.token))
    .expect(200);
});

test('le reste ne couvre plus le coût : pot incomplet, lancement refusé sans aucun débit', async () => {
  await setPlayerBourses(a.id, 4, 4);
  await setPlayerBourses(e.id, 1, 4);
  await setPlayerBourses(i.id, 0, 4);
  const cree = await pot(a.token, { spellCode: 'SL043', teamId: gnomes.id });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const sansA = await exclure(a.token, cree.body.draft.id, { playerId: a.id, exclu: true });
  assert.equal(sansA.status, 200, JSON.stringify(sansA.body));
  assert.equal(sommeCoeurs(sansA.body.draft), 1, 'e n’a qu’un cœur');
  assert.equal(sansA.body.draft.ready, false);

  const lance = await request(app)
    .post(api(`/spell-casts/drafts/${cree.body.draft.id}/launch`))
    .set(auth(a.token));
  assert.equal(lance.status, 409, JSON.stringify(lance.body));
  assert.equal(findForbiddenString(lance.body.error), null);
  assert.deepEqual(await readPlayerBourses(a.id), { health: 4, power: 4 });
  assert.deepEqual(await readPlayerBourses(e.id), { health: 1, power: 4 });
  await request(app)
    .delete(api(`/spell-casts/drafts/${cree.body.draft.id}`))
    .set(auth(a.token))
    .expect(200);
});

test('un absent n’apparaît jamais dans le pot ; on ne le retire ni ne le remet', async () => {
  for (const p of [a, e, i]) await setPlayerBourses(p.id, 4, 4);
  await request(app)
    .post(api('/tenir/presences'))
    .set(auth(a.token))
    .send({ absents: [i.id] })
    .expect(200);
  const cree = await pot(a.token, { spellCode: 'SL043', teamId: gnomes.id });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  assert.ok(!cree.body.draft.presents.includes(i.id));
  assert.deepEqual(part(cree.body.draft, i.id), { hearts: 0, gems: 0 });
  const absent = await exclure(ctx.adminToken, cree.body.draft.id, { playerId: i.id, exclu: true });
  assert.equal(absent.status, 409, JSON.stringify(absent.body));
  assert.equal(absent.body.code, 'EXCLUSION_ABSENT');
  await request(app)
    .delete(api(`/spell-casts/drafts/${cree.body.draft.id}`))
    .set(auth(a.token))
    .expect(200);
  await request(app)
    .post(api('/tenir/presences/arrivee'))
    .set(auth(a.token))
    .send({ playerId: i.id })
    .expect(200);
});

test('tablette de l’équipe : pot automatique, « pas moi » au nom d’un présent, aucune saisie de part, lancement débité aux présents', async () => {
  for (const p of [a, e, i]) await setPlayerBourses(p.id, 4, 4);
  const s = await issueTeamSession(db, { gameId: ctx.game.id, teamId: gnomes.id });
  const reglages = await request(app).get('/api/gl/spell-cast-settings').set(auth(s.token));
  assert.equal(reglages.status, 200, JSON.stringify(reglages.body));

  // Sans `teamId` : son équipe ; une autre équipe est refusée.
  const ailleurs = await pot(s.token, { spellCode: 'SL043', teamId: ctx.teams[1].id });
  assert.equal(ailleurs.status, 403, JSON.stringify(ailleurs.body));
  // Abri protège une autre équipe : la cible est donnée dès l'ouverture du pot.
  const cree = await pot(s.token, {
    spellCode: 'SL043',
    effectParams: { targetTeamId: ctx.teams[2].id },
  });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const draft = cree.body.draft;
  assert.equal(draft.teamId, Number(gnomes.id));
  assert.equal(draft.createdByActorId, `equipe-${gnomes.id}`);
  assert.equal(sommeCoeurs(draft), 2);

  const saisie = await request(app)
    .put(api(`/spell-casts/drafts/${draft.id}/contributions`))
    .set(auth(s.token))
    .send({ contributions: [{ playerId: a.id, hearts: 2, gems: 0 }] });
  assert.equal(saisie.status, 403, JSON.stringify(saisie.body));
  assert.equal(saisie.body.code, 'CONTRIBUTION_TABLETTE');

  // « Pas moi » sur la ligne de e ; un membre d'une autre équipe n'est pas un « qui agit » valable.
  const intrus = await exclure(s.token, draft.id, { playerId: membres(ctx.teams[1].id)[0].id });
  assert.equal(intrus.status, 403, JSON.stringify(intrus.body));
  assert.equal(intrus.body.code, 'QUI_AGIT_INVALIDE');
  const sansE = await exclure(s.token, draft.id, { playerId: e.id, exclu: true });
  assert.equal(sansE.status, 200, JSON.stringify(sansE.body));
  assert.deepEqual(sansE.body.draft.exclus, [e.id]);
  assert.equal(sommeCoeurs(sansE.body.draft), 2);

  const lance = await request(app)
    .post(api(`/spell-casts/drafts/${draft.id}/launch`))
    .set(auth(s.token));
  assert.equal(lance.status, 200, JSON.stringify(lance.body));
  assert.deepEqual(await readPlayerBourses(e.id), { health: 4, power: 4 }, 'e n’a rien versé');
  const apres = (await readPlayerBourses(a.id)).health + (await readPlayerBourses(i.id)).health;
  assert.equal(apres, 6, 'deux cœurs débités aux deux présents restants');
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);
});

test('sort à limite par élève : refusé depuis la tablette de l’équipe', async () => {
  // Héritage (SL033) engage UN élève ; rattaché au chapitre pour ce test.
  await db.execute(
    'INSERT IGNORE INTO gl_chapter_spells (chapter_id, spell_code, order_index) VALUES (?, ?, 990)',
    [ctx.chapter.id, 'SL033'],
  );
  const s = await issueTeamSession(db, { gameId: ctx.game.id, teamId: gnomes.id });
  const res = await pot(s.token, { spellCode: 'SL033' });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.equal(res.body.code, 'SPELL_COMPTE_ELEVE');
  assert.equal(res.body.error, 'Ce sort se lance depuis ton propre compte.');
  await db.execute('DELETE FROM gl_chapter_spells WHERE chapter_id = ? AND spell_code = ?', [
    ctx.chapter.id,
    'SL033',
  ]);
});

test('compte élève : la saisie de part reste possible, pour l’équipe lanceuse seulement ; le pot ne se lit pas d’une autre équipe', async () => {
  const licornes = ctx.teams[2];
  const [l1, l2] = membres(licornes.id);
  for (const p of [l1, l2]) await setPlayerBourses(p.id, 4, 4);
  // Lanterne (SL037) : licornes, 2 gemmes, fenêtre « jeu avant la fouille ».
  const cree = await pot(l1.token, { spellCode: 'SL037', teamId: licornes.id });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const draft = cree.body.draft;
  const manuelle = await request(app)
    .put(api(`/spell-casts/drafts/${draft.id}/contributions`))
    .set(auth(l1.token))
    .send({
      contributions: [
        { playerId: l1.id, gems: 2, hearts: 0 },
        { playerId: l2.id, gems: 0, hearts: 0 },
      ],
    });
  assert.equal(manuelle.status, 200, JSON.stringify(manuelle.body));
  assert.equal(part(manuelle.body.draft, l1.id).gems, 2);

  const etranger = await request(app)
    .put(api(`/spell-casts/drafts/${draft.id}/contributions`))
    .set(auth(a.token))
    .send({ contributions: [{ playerId: l1.id, gems: 0, hearts: 0 }] });
  assert.equal(etranger.status, 403, JSON.stringify(etranger.body));
  assert.equal(etranger.body.code, 'CONTRIBUTION_AUTRE_EQUIPE');
  const lecture = await request(app)
    .get(api(`/spell-casts/drafts/${draft.id}`))
    .set(auth(a.token));
  assert.equal(lecture.status, 403, 'les bourses d’une autre équipe restent privées');
  const mienne = await request(app)
    .get(api(`/spell-casts/drafts/${draft.id}`))
    .set(auth(l2.token));
  assert.equal(mienne.status, 200);
  await request(app)
    .delete(api(`/spell-casts/drafts/${draft.id}`))
    .set(auth(l1.token))
    .expect(200);
});

test('le serveur rejoue le pot : une autre équipe ne le lance pas ; une absence saisie après coup n’est jamais débitée', async () => {
  const gnomesB = ctx.teams[1];
  const equipe = membres(gnomesB.id);
  const [b1, b2] = equipe;
  assert.ok(equipe.length >= 3, 'trois membres dans Gnomes B');
  for (const p of equipe) await setPlayerBourses(p.id, 4, 4);
  const coeurs = async (liste) => {
    let total = 0;
    for (const p of liste) total += (await readPlayerBourses(p.id)).health;
    return total;
  };
  const cree = await pot(b1.token, {
    spellCode: 'SL043',
    teamId: gnomesB.id,
    effectParams: { targetTeamId: ctx.teams[2].id },
  });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const draft = cree.body.draft;
  const lancer = (token) =>
    request(app)
      .post(api(`/spell-casts/drafts/${draft.id}/launch`))
      .set(auth(token));

  // L'identifiant d'un pot circule dans la salle : il ne suffit pas pour le lancer.
  const parUnEleve = await lancer(a.token);
  assert.equal(parUnEleve.status, 403, JSON.stringify(parUnEleve.body));
  assert.equal(parUnEleve.body.code, 'CONTRIBUTION_AUTRE_EQUIPE');
  const tabletteA = await issueTeamSession(db, { gameId: ctx.game.id, teamId: gnomes.id });
  const parUneTablette = await lancer(tabletteA.token);
  assert.equal(parUneTablette.status, 403, JSON.stringify(parUneTablette.body));
  assert.equal(await coeurs(equipe), equipe.length * 4, 'aucun débit');

  // b2 est noté absent après l'ouverture du pot : sa part ne part pas, on ne la lui redonne pas.
  await request(app)
    .post(api('/tenir/presences'))
    .set(auth(b1.token))
    .send({ absents: [b2.id] })
    .expect(200);
  const auNomDeLAbsent = await request(app)
    .put(api(`/spell-casts/drafts/${draft.id}/contributions`))
    .set(auth(b1.token))
    .send({ contributions: [{ playerId: b2.id, hearts: 1, gems: 0 }] });
  assert.equal(auNomDeLAbsent.status, 409, JSON.stringify(auNomDeLAbsent.body));
  assert.equal(auNomDeLAbsent.body.code, 'CONTRIBUTION_HORS_POT');
  assert.ok(!/retrait/i.test(auNomDeLAbsent.body.error), 'un refus ne parle jamais de retrait');

  const lance = await lancer(b1.token);
  assert.equal(lance.status, 200, JSON.stringify(lance.body));
  assert.deepEqual(await readPlayerBourses(b2.id), { health: 4, power: 4 }, 'l’absent garde tout');
  assert.equal(
    await coeurs(equipe.filter((p) => p.id !== b2.id)),
    (equipe.length - 1) * 4 - 2,
    'les deux cœurs viennent des présents',
  );
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);
  await request(app)
    .post(api('/tenir/presences/arrivee'))
    .set(auth(b1.token))
    .send({ playerId: b2.id })
    .expect(200);
});
