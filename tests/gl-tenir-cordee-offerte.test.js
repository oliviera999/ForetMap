'use strict';

/**
 * « Tenir à deux », lot 2, étape 2.6 — Cordée offerte : l'équipe lanceuse paie seule, la
 * partenaire de l'autre peuple ne paie rien et n'a rien à accepter ; la fenêtre se rejoue sous
 * verrou des deux équipes ; si l'une des deux ne jette pas, le sort est rendu au souffle et le
 * voile avance normalement.
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
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
// Équipes : 0 Gnomes A, 1 Gnomes B, 2 Licornes A, 3 Licornes B.
const team = (i) => ctx.teams[i];
const membres = (i) => ctx.players.filter((p) => Number(p.teamId) === Number(team(i).id));
const jet = (i, faces) =>
  request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'physique', teamId: team(i).id, faces });
const sommeEquipe = async (i) => {
  let health = 0;
  let power = 0;
  for (const p of membres(i)) {
    const b = await readPlayerBourses(p.id);
    health += b.health;
    power += b.power;
  }
  return { health, power };
};
const phase = (body) =>
  request(app).post(api('/tenir/tour/phase')).set(auth(ctx.adminToken)).send(body);
async function tourSuivant() {
  await phase({ phase: 'clos' }).expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
}
const invariants = async () =>
  (await checkTenirInvariantsFromDb(db, ctx.game.id, { settings: await getGameplaySettings() }))
    .violations || [];
const cordees = () =>
  db.queryAll(
    "SELECT kind, team_id, source_team_id FROM gl_game_tenir_effets WHERE game_id = ? AND kind LIKE 'cordee%' ORDER BY id ASC",
    [ctx.game.id],
  );

before(async () => {
  await db.initSchema();
  // Plateau 3 : la Cordée y est ouverte.
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 3 });
  for (const p of ctx.players) await setPlayerBourses(p.id, 5, 5);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('catalogue : la Cordée se paie dans la ressource du peuple lanceur ; texte visible sans mot interdit', async () => {
  const row = await db.queryOne(
    "SELECT ressource, cout, peuple, effet_court FROM gl_spells WHERE spell_code = 'SL045'",
  );
  assert.equal(row.ressource, 'peuple');
  assert.equal(Number(row.cout), 4);
  assert.equal(row.peuple, 'pacte', 'toujours offerte à une équipe de l’autre peuple');
  assert.match(row.effet_court, /^Vous offrez la Cordée à une équipe de l'autre peuple/);
  assert.equal(findForbiddenString(row.effet_court), null);
});

test('lancement : seule la lanceuse est débitée ; la partenaire est prévenue ; les deux jettent → le meilleur vaut pour les deux, rien n’est rendu', async () => {
  const avantL = await sommeEquipe(2);
  const avantG = await sommeEquipe(0);
  // Les Licornes A offrent la Cordée aux Gnomes A.
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(membres(2)[0].token))
    .send({ spellCode: 'SL045', teamId: team(2).id, partnerTeamId: team(0).id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  assert.deepEqual(d.body.draft.required, { gems: 4, hearts: 0 });
  assert.ok(d.body.draft.presents.every((id) => membres(2).some((m) => m.id === id)));
  // La partenaire ne paie rien : elle ne lit pas ce pot (bourses de la lanceuse), ne le règle
  // pas et ne le lance pas.
  const partenaire = membres(0)[0];
  const lecture = await request(app)
    .get(api(`/spell-casts/drafts/${d.body.draft.id}`))
    .set(auth(partenaire.token));
  assert.equal(lecture.status, 403, JSON.stringify(lecture.body));
  const reglage = await request(app)
    .put(api(`/spell-casts/drafts/${d.body.draft.id}/contributions`))
    .set(auth(partenaire.token))
    .send({ contributions: [{ playerId: membres(2)[0].id, gems: 4, hearts: 0 }] });
  assert.equal(reglage.status, 403, JSON.stringify(reglage.body));
  assert.equal(reglage.body.code, 'CONTRIBUTION_AUTRE_EQUIPE');
  const lancement = await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(partenaire.token));
  assert.equal(lancement.status, 403, JSON.stringify(lancement.body));
  const l = await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(membres(2)[0].token));
  assert.equal(l.status, 200, JSON.stringify(l.body));
  assert.deepEqual(await sommeEquipe(2), { health: avantL.health, power: avantL.power - 4 });
  assert.deepEqual(await sommeEquipe(0), avantG, 'la partenaire ne paie rien');

  // L'écran de la partenaire sait qui l'encorde (effet du tour, sans aucune bourse).
  const vue = await request(app)
    .get(api('/tenir/tour'))
    .set(auth(membres(0)[0].token));
  const effet = vue.body.round.effets.find((e) => e.kind === 'cordee');
  assert.equal(effet.teamId, Number(team(2).id));
  assert.equal(effet.sourceTeamId, Number(team(0).id));

  assert.equal((await jet(2, [1, 1])).status, 201);
  assert.equal((await jet(0, [3, 3])).status, 201);
  const positions = await db.queryAll(
    'SELECT id, position_marker_id FROM gl_teams WHERE id IN (?, ?)',
    [team(0).id, team(2).id],
  );
  assert.equal(positions[0].position_marker_id, positions[1].position_marker_id, 'même case');

  const souffle = await phase({ phase: 'souffle', dort: true });
  assert.equal(souffle.status, 200, JSON.stringify(souffle.body));
  assert.deepEqual(
    (await cordees()).map((c) => c.kind),
    ['cordee'],
    'cordée faite : rien n’est rendu',
  );
  const draft = await db.queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [
    d.body.draft.id,
  ]);
  assert.equal(draft.status, 'cast');
  const rendu = await db.queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'spell_rembourse' LIMIT 1",
    [ctx.game.id],
  );
  assert.ok(!rendu, 'aucun sort rendu');
  assert.deepEqual(await invariants(), []);
  await tourSuivant();
});

test('la partenaire jette pendant le lancement : refus propre, rien n’est débité', async () => {
  const avant = await sommeEquipe(1);
  // Les Gnomes B ouvrent le pot ; les Licornes B jettent avant le lancement.
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(membres(1)[0].token))
    .send({ spellCode: 'SL045', teamId: team(1).id, partnerTeamId: team(3).id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  assert.deepEqual(d.body.draft.required, { gems: 0, hearts: 4 });
  assert.equal((await jet(3, [1, 2])).status, 201);
  const l = await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(membres(1)[0].token));
  assert.equal(l.status, 409, JSON.stringify(l.body));
  assert.equal(l.body.code, 'SPELL_FENETRE');
  assert.match(l.body.error, /avant les jets des deux équipes/);
  assert.deepEqual(await sommeEquipe(1), avant, 'aucun débit');
  const draft = await db.queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [
    d.body.draft.id,
  ]);
  assert.equal(draft.status, 'collecting');
  await request(app)
    .delete(api(`/spell-casts/drafts/${d.body.draft.id}`))
    .set(auth(membres(1)[0].token))
    .expect(200);
  await phase({ phase: 'souffle', dort: true }).expect(200);
  assert.deepEqual(await invariants(), []);
  await tourSuivant();
});

test('la partenaire ne jette pas : au souffle, remboursement intégral, voile normal, livre équilibré', async () => {
  const avant = await sommeEquipe(0);
  const d = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(membres(0)[0].token))
    .send({ spellCode: 'SL045', teamId: team(0).id, partnerTeamId: team(2).id });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  await request(app)
    .post(api(`/spell-casts/drafts/${d.body.draft.id}/launch`))
    .set(auth(membres(0)[0].token))
    .expect(200);
  assert.deepEqual(await sommeEquipe(0), { health: avant.health - 4, power: avant.power });
  // Seule la lanceuse jette.
  assert.equal((await jet(0, [1, 1])).status, 201);

  const { hasCordeeForTests } = require('../lib/glVoile');
  const tour = Number(
    (
      await db.queryOne('SELECT current_round_number AS r FROM gl_games WHERE id = ?', [
        ctx.game.id,
      ])
    ).r,
  );
  assert.equal(await hasCordeeForTests(db, ctx.game.id, tour, team(0).id), true);

  const souffle = await phase({ phase: 'souffle', faces: [1] });
  assert.equal(souffle.status, 200, JSON.stringify(souffle.body));
  assert.deepEqual(await sommeEquipe(0), avant, 'remboursement intégral');
  const draft = await db.queryOne('SELECT status FROM gl_spell_cast_drafts WHERE id = ?', [
    d.body.draft.id,
  ]);
  assert.equal(draft.status, 'rembourse');
  assert.equal(
    await hasCordeeForTests(db, ctx.game.id, tour, team(0).id),
    false,
    'plus de protection contre le voile',
  );
  const evt = await db.queryOne(
    "SELECT team_id, payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'spell_rembourse' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(Number(evt.team_id), Number(team(0).id));
  assert.equal(JSON.parse(evt.payload_json).motif, 'cordee');
  // Le voile a avancé (dé gris joué) : le remboursement précède son avance, il ne l'empêche pas.
  const voile = await db.queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'voile_avance' AND id > ? LIMIT 1",
    [ctx.game.id, 0],
  );
  assert.ok(voile, 'le voile avance normalement');
  assert.deepEqual(await invariants(), []);

  // Le sort rendu ne compte plus dans la limite : relançable au tour suivant.
  await tourSuivant();
  const encore = await request(app)
    .post(api('/spell-casts/drafts'))
    .set(auth(membres(0)[0].token))
    .send({ spellCode: 'SL045', teamId: team(0).id, partnerTeamId: team(2).id });
  assert.equal(encore.status, 201, JSON.stringify(encore.body));
});
