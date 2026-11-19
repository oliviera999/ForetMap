'use strict';

/**
 * Audit des bugs G&L du 19/11/2026, lot 5 — pots de sorts.
 *
 * - **S1** : un pot en collecte ne se reprend que si l'équipe, la partenaire et l'élève sont ceux
 *   de la demande ; sinon il est annulé (rien n'a été débité) et un pot neuf s'ouvre.
 * - **S2** : deux « pas moi » simultanés sont gardés tous les deux.
 * - **S12** : un pot repris dans le même tour se recalcule quand une part dépasse un solde ou
 *   que le total ne correspond plus au reste dû (réserve de la caravane qui a bougé).
 *
 * Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { createTenirGame, setPlayerBourses, ouvrirTourEnJeu } = require('./helpers/glTenirFixtures');
const { creditReserveTx } = require('../lib/glBourses');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
// Équipes : 0 Gnomes A, 1 Gnomes B, 2 Licornes A, 3 Licornes B.
const team = (i) => ctx.teams[i];
const membres = (i) => ctx.players.filter((p) => Number(p.teamId) === Number(team(i).id));
const pot = (token, body) =>
  request(app).post(api('/spell-casts/drafts')).set(auth(token)).send(body);
const exclure = (token, draftId, body) =>
  request(app)
    .post(api(`/spell-casts/drafts/${draftId}/exclure`))
    .set(auth(token))
    .send(body);
const fermer = (token, draftId) =>
  request(app)
    .delete(api(`/spell-casts/drafts/${draftId}`))
    .set(auth(token));
const ligne = (draftId) =>
  db.queryOne(
    'SELECT status, team_id, partner_team_id, player_id FROM gl_spell_cast_drafts WHERE id = ?',
    [draftId],
  );
const part = (draft, playerId) =>
  (draft.contributions || []).find((c) => Number(c.playerId) === Number(playerId))?.gems || 0;
const sommeGemmes = (draft) => (draft.contributions || []).reduce((s, c) => s + c.gems, 0);

before(async () => {
  await db.initSchema();
  // Plateau 3 : tous les sorts du lot y sont ouverts (Lanterne, Bourrasque, Sentier, Abri,
  // Cordée, Lettre).
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 3 });
  for (const p of ctx.players) await setPlayerBourses(p.id, 5, 5);
  // Un sort personnel se prépare hors de la phase « jeu » : le tour reste d'abord en ouverture.
  await ouvrirTourEnJeu(request, app, ctx, { phase: 'ouverture' });
});

test('S1, scénario B — sort personnel : le pot ouvert puis laissé par un élève n’est pas repris par son coéquipier', async () => {
  const [x, y] = membres(0);
  const deX = await pot(x.token, { spellCode: 'SL048', teamId: team(0).id });
  assert.equal(deX.status, 201, JSON.stringify(deX.body));
  assert.equal(Number((await ligne(deX.body.draft.id)).player_id), x.id);
  // X ferme l'assistant : la main revient à l'équipe, le pot reste en collecte.
  await request(app).post(api('/tenir/main/rendre')).set(auth(x.token)).expect(200);
  assert.equal((await ligne(deX.body.draft.id)).status, 'collecting');

  const deY = await pot(y.token, { spellCode: 'SL048', teamId: team(0).id });
  assert.equal(deY.status, 201, JSON.stringify(deY.body));
  assert.notEqual(deY.body.draft.id, deX.body.draft.id, 'un pot neuf pour le second élève');
  assert.equal(Number((await ligne(deY.body.draft.id)).player_id), y.id, 'le pot engage Y');
  assert.equal((await ligne(deX.body.draft.id)).status, 'cancelled', 'le pot de X est annulé');

  // Le même élève qui rouvre son sort retrouve son pot.
  const encoreY = await pot(y.token, { spellCode: 'SL048', teamId: team(0).id });
  assert.equal(encoreY.status, 201, JSON.stringify(encoreY.body));
  assert.equal(encoreY.body.draft.id, deY.body.draft.id);
  await fermer(y.token, deY.body.draft.id).expect(200);
});

test('passage en phase « jeu »', async () => {
  await request(app)
    .post(api('/tenir/tour/phase'))
    .set(auth(ctx.adminToken))
    .send({ phase: 'jeu' })
    .expect(200);
});

for (const [code, nom, i, j] of [
  ['SL037', 'Lanterne', 2, 3],
  ['SL039', 'Bourrasque', 2, 3],
  ['SL042', 'Sentier', 0, 1],
]) {
  test(`S1, scénario A — ${nom} : le prof demande une autre équipe, il reçoit un pot de cette équipe`, async () => {
    const pourA = await pot(ctx.adminToken, { spellCode: code, teamId: team(i).id });
    assert.equal(pourA.status, 201, JSON.stringify(pourA.body));
    assert.equal(pourA.body.draft.teamId, Number(team(i).id));

    const pourB = await pot(ctx.adminToken, { spellCode: code, teamId: team(j).id });
    assert.equal(pourB.status, 201, JSON.stringify(pourB.body));
    assert.notEqual(pourB.body.draft.id, pourA.body.draft.id, 'un pot neuf pour l’autre équipe');
    assert.equal(pourB.body.draft.teamId, Number(team(j).id));
    const payeurs = (pourB.body.draft.contributions || []).map((c) => Number(c.playerId));
    const deB = membres(j).map((p) => p.id);
    assert.ok(payeurs.length > 0, 'des parts suggérées');
    assert.ok(
      payeurs.every((id) => deB.includes(id)),
      'seuls les membres de l’équipe demandée paient',
    );
    assert.equal((await ligne(pourA.body.draft.id)).status, 'cancelled', 'l’ancien pot est annulé');

    // La même demande reprend bien le même pot.
    const encoreB = await pot(ctx.adminToken, { spellCode: code, teamId: team(j).id });
    assert.equal(encoreB.status, 201, JSON.stringify(encoreB.body));
    assert.equal(encoreB.body.draft.id, pourB.body.draft.id);
    await fermer(ctx.adminToken, pourB.body.draft.id).expect(200);
  });
}

test('S1, scénario C — Cordée : rouverte avec une autre partenaire, le pot porte la nouvelle', async () => {
  const lanceur = membres(2)[0];
  const avecC = await pot(lanceur.token, {
    spellCode: 'SL045',
    teamId: team(2).id,
    partnerTeamId: team(0).id,
  });
  assert.equal(avecC.status, 201, JSON.stringify(avecC.body));
  assert.equal(Number((await ligne(avecC.body.draft.id)).partner_team_id), Number(team(0).id));

  const avecD = await pot(lanceur.token, {
    spellCode: 'SL045',
    teamId: team(2).id,
    partnerTeamId: team(1).id,
  });
  assert.equal(avecD.status, 201, JSON.stringify(avecD.body));
  assert.notEqual(avecD.body.draft.id, avecC.body.draft.id, 'un pot neuf pour la nouvelle cordée');
  assert.equal(Number((await ligne(avecD.body.draft.id)).partner_team_id), Number(team(1).id));
  assert.equal((await ligne(avecC.body.draft.id)).status, 'cancelled');
  await fermer(lanceur.token, avecD.body.draft.id).expect(200);
});

test('S2 — deux « pas moi » au même instant : les deux sont gardés', async () => {
  const [a, e, i] = membres(0);
  assert.ok(a && e && i, 'trois membres chez les Gnomes A');
  // Abri (SL043) : 2 gemmes, fenêtre « jeu ».
  const cree = await pot(a.token, { spellCode: 'SL043', teamId: team(0).id });
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const draftId = cree.body.draft.id;

  for (let essai = 0; essai < 4; essai += 1) {
    const [ra, re] = await Promise.all([
      exclure(a.token, draftId, { playerId: a.id, exclu: true }),
      exclure(e.token, draftId, { playerId: e.id, exclu: true }),
    ]);
    assert.equal(ra.status, 200, JSON.stringify(ra.body));
    assert.equal(re.status, 200, JSON.stringify(re.body));
    const lu = await request(app)
      .get(api(`/spell-casts/drafts/${draftId}`))
      .set(auth(i.token))
      .expect(200);
    assert.deepEqual(
      [...lu.body.draft.exclus].sort((p, q) => p - q),
      [a.id, e.id].sort((p, q) => p - q),
      `essai ${essai} : les deux exclusions sont gardées`,
    );
    assert.equal(part(lu.body.draft, a.id), 0);
    assert.equal(part(lu.body.draft, e.id), 0);
    assert.equal(part(lu.body.draft, i.id), 2, 'le dernier présent porte le pot');
    // Retour au pot complet pour l'essai suivant.
    await exclure(a.token, draftId, { playerId: a.id, exclu: false }).expect(200);
    await exclure(e.token, draftId, { playerId: e.id, exclu: false }).expect(200);
  }
  await fermer(a.token, draftId).expect(200);
});

test('S12 — pot repris dans le même tour : il suit la réserve et les soldes, et se lance', async () => {
  const [a, e, i] = membres(0);
  // Abri vise une autre équipe.
  const abri = {
    spellCode: 'SL043',
    teamId: team(0).id,
    effectParams: { targetTeamId: team(2).id },
  };
  const cree = await pot(a.token, abri);
  assert.equal(cree.status, 201, JSON.stringify(cree.body));
  const draftId = cree.body.draft.id;
  assert.equal(sommeGemmes(cree.body.draft), 2);
  assert.equal(cree.body.draft.ready, true);

  // La réserve de la caravane reçoit une gemme : elle paie en premier, le pot ne doit plus qu'une.
  await db.withTransaction((tx) =>
    creditReserveTx(tx, {
      gameId: ctx.game.id,
      teamId: team(0).id,
      dh: 0,
      dg: 1,
      cause: 'reserve_entree',
    }),
  );
  const apresReserve = await pot(a.token, abri);
  assert.equal(apresReserve.status, 201, JSON.stringify(apresReserve.body));
  assert.equal(apresReserve.body.draft.id, draftId, 'le même pot');
  assert.equal(sommeGemmes(apresReserve.body.draft), 1, 'le pot ne couvre que le reste dû');
  assert.equal(apresReserve.body.draft.ready, true);

  // Les élèves qui portaient une part n'ont plus de gemmes : la part passe à qui peut payer.
  const payeurs = [a, e, i].filter((p) => part(apresReserve.body.draft, p.id) > 0);
  assert.ok(payeurs.length > 0);
  for (const p of payeurs) await setPlayerBourses(p.id, 5, 0);
  const apresSolde = await pot(a.token, abri);
  assert.equal(apresSolde.status, 201, JSON.stringify(apresSolde.body));
  assert.equal(apresSolde.body.draft.id, draftId, 'le même pot');
  for (const p of payeurs) assert.equal(part(apresSolde.body.draft, p.id), 0, 'plus de part');
  assert.equal(sommeGemmes(apresSolde.body.draft), 1);
  assert.equal(apresSolde.body.draft.ready, true);

  const lance = await request(app)
    .post(api(`/spell-casts/drafts/${draftId}/launch`))
    .set(auth(a.token));
  assert.equal(lance.status, 200, JSON.stringify(lance.body));
});
