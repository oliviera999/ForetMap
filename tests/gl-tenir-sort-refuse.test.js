'use strict';

/**
 * « Tenir à deux », lot 2, étape 2.7 — sorts du prof : refuser rembourse. Un sort d'exécution
 * `prof` est débité au lancement et entre en file ; « Refuser et rembourser » rend exactement
 * ce qui a été payé (bourses et réserve), et le sort redevient lançable dans la séance.
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
const { creditReserveTx, loadReserve } = require('../lib/glBourses');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');
const { presentJournalEvent } = require('../lib/glJournalPresent');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const team = (i) => ctx.teams[i];
const membres = (i) => ctx.players.filter((p) => Number(p.teamId) === Number(team(i).id));
const bourses = async (i) => {
  const out = [];
  for (const p of membres(i)) out.push(await readPlayerBourses(p.id));
  return out;
};
async function lancerPause(i) {
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(membres(i)[0].token))
    .send({ spellCode: 'SL046', teamId: team(i).id });
  if (d.status !== 201) return d;
  return request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(membres(i)[0].token));
}
const file = async () =>
  (await request(app).get(api('/spell-casts/awaiting-effect')).set(auth(ctx.adminToken))).body
    .drafts;

before(async () => {
  await db.initSchema();
  // Plateau 2 : « Pause » (activité, exécution du prof, 3 dans la ressource du peuple) y est ouverte.
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 2 });
  for (const p of ctx.players) await setPlayerBourses(p.id, 4, 4);
  // Un cœur dans la réserve des Gnomes A : elle paie en premier.
  await db.withTransaction((tx) =>
    creditReserveTx(tx, {
      gameId: ctx.game.id,
      teamId: team(0).id,
      dh: 1,
      dg: 0,
      cause: 'reserve_entree',
    }),
  );
  await ouvrirTourEnJeu(request, app, ctx);
});

test('Pause refusée : bourses et réserve à l’identique, livre équilibré, Pause relançable dans la séance', async () => {
  const avant = await bourses(0);
  const reserveAvant = await loadReserve(db, ctx.game.id, team(0).id);
  const lance = await lancerPause(0);
  assert.equal(lance.status, 200, JSON.stringify(lance.body));
  const draftId = lance.body.draft.id;
  assert.notDeepEqual(await bourses(0), avant, 'le sort est débité au lancement');
  assert.equal((await loadReserve(db, ctx.game.id, team(0).id)).health, 0, 'la réserve a payé');
  assert.ok(
    (await file()).some((d) => d.id === draftId),
    'le sort attend dans la file du prof',
  );

  // Dans la séance, Pause n'est lançable qu'une fois par équipe…
  const deuxieme = await lancerPause(0);
  assert.equal(deuxieme.status, 409, JSON.stringify(deuxieme.body));
  assert.equal(deuxieme.body.code, 'SPELL_LIMITE');

  // Un élève ne refuse pas un sort.
  const eleve = await request(app)
    .post(api(`/spell-casts/drafts/${draftId}/refuser`))
    .set(auth(membres(0)[0].token))
    .send({});
  assert.equal(eleve.status, 403);

  const refus = await request(app)
    .post(api(`/spell-casts/drafts/${draftId}/refuser`))
    .set(auth(ctx.adminToken))
    .send({ mot: '  Pas pendant le contrôle :   on la garde pour jeudi.  ' });
  assert.equal(refus.status, 200, JSON.stringify(refus.body));
  assert.deepEqual(await bourses(0), avant, 'bourses à l’identique');
  assert.deepEqual(await loadReserve(db, ctx.game.id, team(0).id), reserveAvant, 'réserve aussi');
  assert.ok(!(await file()).some((d) => d.id === draftId), 'la ligne a quitté la file');
  const draft = await db.queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [
    draftId,
  ]);
  assert.equal(draft.status, 'rembourse');
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);

  // Journal : le mot du prof est visible de l'équipe, sans mot qui punit.
  const evt = await db.queryOne(
    "SELECT team_id, actor_type, payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'spell_refuse' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const payload = JSON.parse(evt.payload_json);
  assert.equal(evt.actor_type, 'mj');
  assert.equal(payload.mot, 'Pas pendant le contrôle : on la garde pour jeudi.');
  assert.notEqual(payload.private, true, 'visible de l’équipe');
  const libelle = presentJournalEvent(
    { eventType: 'spell_refuse', teamId: team(0).id, payload },
    {
      teamsById: { [team(0).id]: { id: team(0).id, name: 'Gnomes A' } },
      forPlayer: true,
      tenir: true,
    },
  );
  assert.match(libelle.body, /rien n’est retiré/);
  assert.match(libelle.body, /on la garde pour jeudi/);
  assert.equal(findForbiddenString(`${libelle.title} ${libelle.body}`), null);

  // … et le sort rendu ne compte plus : Pause est relançable.
  const encore = await lancerPause(0);
  assert.equal(encore.status, 200, JSON.stringify(encore.body));

  // Une seule décision : déjà rendu → 409 ; effet déjà appliqué → 409.
  const double = await request(app)
    .post(api(`/spell-casts/drafts/${draftId}/refuser`))
    .set(auth(ctx.adminToken))
    .send({});
  assert.equal(double.status, 409, JSON.stringify(double.body));
  await request(app)
    .post(api(`/spell-casts/drafts/${encore.body.draft.id}/effect-applied`))
    .set(auth(ctx.adminToken))
    .send({})
    .expect(200);
  const tropTard = await request(app)
    .post(api(`/spell-casts/drafts/${encore.body.draft.id}/refuser`))
    .set(auth(ctx.adminToken))
    .send({});
  assert.equal(tropTard.status, 409, JSON.stringify(tropTard.body));
});
