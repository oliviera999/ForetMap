'use strict';

/**
 * « Tenir à deux », lot 2, étape 2.12 — défi de case : léger et non bloquant. Tirage sans
 * répétition puis remise à zéro, déclenchement à l'arrêt ou au passage, jugement unique du
 * prof, recul du voile appliqué une seule fois, sortie au Seuil, critère jamais servi à un
 * élève ni à la projection. Aucune ressource n'est créée.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const {
  createTenirGame,
  setPlayerBourses,
  readPlayerBourses,
  ouvrirTourEnJeu,
} = require('./helpers/glTenirFixtures');
const { runImports } = require('../scripts/gl-import-tenir');
const { issueTeamSession } = require('../lib/glGuestToken');
const { issueProjectionToken } = require('../lib/glProjection');
const { isDefiMarker, normalizeEventConfig } = require('../lib/shared/glMarkerEventConfigCore');
const { casesDeclenchees, tirerDefiTx } = require('../lib/glDefisCase');
const { listDemandes } = require('../lib/glDemandes');
const { presentJournalEvent } = require('../lib/glJournalPresent');
const { momentForEvent } = require('../lib/glTenirOlu');
const { checkTenirInvariantsFromDb } = require('../lib/glTenirInvariants');
const { getGameplaySettings } = require('../lib/glSettings');
const { findForbiddenString } = require('../lib/shared/glGardeFousCore');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
let ctx;
let caseDefi;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (p) => `/api/gl/games/${ctx.game.id}${p}`;
const team = (i) => ctx.teams[i];
const membres = (i) => ctx.players.filter((p) => Number(p.teamId) === Number(team(i).id));
const jet = (i, faces) =>
  request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'physique', teamId: team(i).id, faces });
const placer = (i, index) =>
  db.execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    ctx.markers[index].id,
    team(i).id,
  ]);
const defisDe = async (token) =>
  (await request(app).get(api('/defis-case')).set(auth(token)).expect(200)).body.defis;
const voile = async () =>
  Number(
    (
      await db.queryOne('SELECT voile_position AS v FROM gl_game_tenir_state WHERE game_id = ?', [
        ctx.game.id,
      ])
    ).v,
  );
const surcharger = (overrides) =>
  db.execute('UPDATE gl_games SET tenir_overrides_json = ? WHERE id = ?', [
    JSON.stringify(overrides),
    ctx.game.id,
  ]);
async function tourSuivant() {
  for (const body of [{ phase: 'souffle', dort: true }, { phase: 'clos' }]) {
    await request(app)
      .post(api('/tenir/tour/phase'))
      .set(auth(ctx.adminToken))
      .send(body)
      .expect(200);
  }
  await ouvrirTourEnJeu(request, app, ctx);
}

before(async () => {
  await db.initSchema();
  // Catalogue d'exemple : deux défis par plateau (le tirage s'épuise vite).
  const [rep] = await runImports(db, { fichier: 'defis-cases', dossier: EXEMPLE });
  assert.deepEqual(rep.errors, []);
  ctx = await createTenirGame({ stamp: Date.now(), plateau: 1 });
  for (const p of ctx.players) await setPlayerBourses(p.id, 0, 0);
  // La case « Étape » (rang 3) du plateau d'exemple devient une case « Défi d'équipe » : la
  // marque est dans sa configuration, pas dans son libellé.
  caseDefi = ctx.markers[3];
  await db.execute('UPDATE gl_chapter_markers SET event_config_json = ? WHERE id = ?', [
    JSON.stringify({ version: 2, tenir: { defi: true } }),
    caseDefi.id,
  ]);
  await surcharger({ surface: 'tablette' });
  await ouvrirTourEnJeu(request, app, ctx);
});

test('marquage par la configuration : `tenir.defi` survit à la normalisation, le libellé ne compte pas', () => {
  assert.equal(
    isDefiMarker({ label: 'Étape', event_config_json: '{"version":2,"tenir":{"defi":true}}' }),
    true,
  );
  assert.equal(isDefiMarker({ label: 'Défi d’équipe', event_config_json: null }), false);
  assert.deepEqual(normalizeEventConfig({ tenir: { defi: true } }), {
    version: 2,
    tenir: { defi: true },
  });
  assert.equal(normalizeEventConfig({ tenir: { defi: false } }), null);
  const markers = [1, 2, 3, 4, 5].map((id) => ({
    id,
    event_config_json: id === 3 ? '{"version":2,"tenir":{"defi":true}}' : null,
  }));
  const m = (id) => markers.find((x) => x.id === id);
  assert.equal(casesDeclenchees({ markers, marker: m(3) }).length, 1, 'arrêt sur la case');
  assert.equal(
    casesDeclenchees({ markers, marker: m(5), fromMarkerId: 1 }).length,
    0,
    'arrêt : franchie ne compte pas',
  );
  assert.equal(
    casesDeclenchees({ markers, marker: m(5), fromMarkerId: 1, declenchement: 'passage' }).length,
    1,
    'passage : la case franchie compte',
  );
  assert.equal(
    casesDeclenchees({ markers, marker: m(5), fromMarkerId: 3, declenchement: 'passage' }).length,
    0,
    'passage : la case de départ ne compte pas',
  );
});

test('réception à l’arrêt : le défi arrive sans bloquer le tour ; le critère n’est servi qu’au prof', async () => {
  await placer(0, 1);
  const j = await jet(0, [1, 1]);
  assert.equal(j.status, 201, JSON.stringify(j.body));
  // Le jet peut rester en suspens (Relance) : « Garder ce jet » applique la case.
  await request(app)
    .post(api('/tenir/arrivee/garder'))
    .set(auth(ctx.adminToken))
    .send({ teamId: team(0).id });
  const prof = await defisDe(ctx.adminToken);
  assert.equal(prof.length, 1);
  assert.deepEqual(
    { teamId: prof[0].teamId, statut: prof[0].statut, markerId: prof[0].markerId },
    { teamId: Number(team(0).id), statut: 'a_preparer', markerId: Number(caseDefi.id) },
  );
  assert.ok(prof[0].critere, 'le prof lit le critère');
  assert.ok(prof[0].consigne && prof[0].preparation && prof[0].dureeS >= 10);

  // Élève de l'équipe, tablette de l'équipe, projection : jamais le critère.
  const eleve = await defisDe(membres(0)[0].token);
  assert.equal(eleve.length, 1);
  assert.equal('critere' in eleve[0], false);
  assert.equal(eleve[0].titre, prof[0].titre);
  const tablette = await issueTeamSession(db, { gameId: ctx.game.id, teamId: team(0).id });
  const vueTablette = await defisDe(tablette.token);
  assert.equal('critere' in vueTablette[0], false);
  const autre = await defisDe(membres(1)[0].token);
  assert.deepEqual(autre, [], 'une équipe ne voit que ses défis');
  const projection = await issueProjectionToken(db, { gameId: ctx.game.id, issuedBy: 1 });
  const vueProjection = await defisDe(projection.token);
  assert.equal(vueProjection.length, 1);
  assert.ok(!JSON.stringify(vueProjection).includes('critere'));
  const brut = JSON.stringify([eleve, vueTablette, vueProjection]);
  assert.ok(!brut.includes(prof[0].critere), 'le texte du critère ne sort nulle part ailleurs');

  // Journal et file du prof : le critère n'entre pas dans l'évènement ; la ligne du prof le porte.
  const evt = await db.queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'defi_case_recu' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.ok(!evt.payload_json.includes(prof[0].critere));
  const file = await request(app).get(api('/tenir/demandes')).set(auth(ctx.adminToken)).expect(200);
  const ligne = file.body.demandes.find((d) => d.kind === 'defi_case');
  assert.equal(Number(ligne.refId), prof[0].id);
  assert.equal(ligne.payload.critere, prof[0].critere);
  assert.equal(momentForEvent('defi_case_recu'), 'defi_case_recu');
  // Le tour continue : l'équipe fouille, une autre joue.
  assert.equal((await jet(1, [1, 1])).status, 201);
});

test('jugement : route refusée à un joueur ; « Relevé » fait reculer le voile une seule fois ; double décision → 409', async () => {
  const [defi] = await defisDe(ctx.adminToken);
  await db.execute('UPDATE gl_game_tenir_state SET voile_position = 6 WHERE game_id = ?', [
    ctx.game.id,
  ]);
  const body = { releve: true };
  const joueur = await request(app)
    .post(api(`/defis-case/${defi.id}/decider`))
    .set(auth(membres(0)[0].token))
    .send(body);
  assert.equal(joueur.status, 403);
  const tablette = await issueTeamSession(db, { gameId: ctx.game.id, teamId: team(0).id });
  const parTablette = await request(app)
    .post(api(`/defis-case/${defi.id}/decider`))
    .set(auth(tablette.token))
    .send(body);
  assert.equal(parTablette.status, 403);
  const sansChoix = await request(app)
    .post(api(`/defis-case/${defi.id}/decider`))
    .set(auth(ctx.adminToken))
    .send({});
  assert.equal(sansChoix.status, 400);

  const releve = await request(app)
    .post(api(`/defis-case/${defi.id}/decider`))
    .set(auth(ctx.adminToken))
    .send(body);
  assert.equal(releve.status, 200, JSON.stringify(releve.body));
  assert.deepEqual(
    { statut: releve.body.statut, recul: releve.body.recul },
    { statut: 'releve', recul: 2 },
  );
  assert.equal(await voile(), 4, 'le voile recule de 2 cases');
  const encore = await request(app)
    .post(api(`/defis-case/${defi.id}/decider`))
    .set(auth(ctx.adminToken))
    .send({ releve: true });
  assert.equal(encore.status, 409, JSON.stringify(encore.body));
  assert.equal(encore.body.code, 'DEFI_DEJA_JUGE');
  assert.equal(await voile(), 4, 'recul appliqué une seule fois');
  assert.equal(
    (await listDemandes(db, ctx.game.id)).filter((d) => d.kind === 'defi_case').length,
    0,
    'la ligne du prof se ferme',
  );
  const evt = await db.queryOne(
    "SELECT team_id, payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'defi_case_releve' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const libelle = presentJournalEvent(
    { eventType: 'defi_case_releve', teamId: team(0).id, payload: JSON.parse(evt.payload_json) },
    {
      teamsById: { [team(0).id]: { id: team(0).id, name: 'Gnomes A' } },
      forPlayer: true,
      tenir: true,
    },
  );
  assert.match(libelle.body, /le voile recule de 2 cases/);
  assert.ok(libelle.body.includes(defi.titre), 'le libellé porte le titre du défi');
  assert.equal(findForbiddenString(`${libelle.title} ${libelle.body}`), null);
});

test('« Pas encore » : rien d’autre qu’un évènement ; aucune ressource créée par un défi', async () => {
  await tourSuivant();
  await placer(1, 1);
  assert.equal((await jet(1, [1, 1])).status, 201);
  await request(app)
    .post(api('/tenir/arrivee/garder'))
    .set(auth(ctx.adminToken))
    .send({ teamId: team(1).id });
  const defi = (await defisDe(ctx.adminToken)).find((d) => d.statut === 'a_preparer');
  assert.ok(defi, 'défi reçu au deuxième tour');
  const avantVoile = await voile();
  const avantLivre = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_resource_ledger WHERE game_id = ?',
    [ctx.game.id],
  );
  const pasEncore = await request(app)
    .post(api(`/defis-case/${defi.id}/decider`))
    .set(auth(ctx.adminToken))
    .send({ releve: false });
  assert.equal(pasEncore.status, 200, JSON.stringify(pasEncore.body));
  assert.deepEqual(
    { statut: pasEncore.body.statut, recul: pasEncore.body.recul },
    { statut: 'pas_encore', recul: 0 },
  );
  assert.equal(await voile(), avantVoile, 'le voile ne bouge pas');
  const apresLivre = await db.queryOne(
    'SELECT COUNT(*) AS n FROM gl_resource_ledger WHERE game_id = ?',
    [ctx.game.id],
  );
  assert.equal(Number(apresLivre.n), Number(avantLivre.n), 'aucune écriture au grand livre');
  const evt = await db.queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'defi_case_pas_encore' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  const libelle = presentJournalEvent(
    {
      eventType: 'defi_case_pas_encore',
      teamId: team(1).id,
      payload: JSON.parse(evt.payload_json),
    },
    {
      teamsById: { [team(1).id]: { id: team(1).id, name: 'Gnomes B' } },
      forPlayer: true,
      tenir: true,
    },
  );
  assert.match(libelle.body, /^Pas encore/);
  assert.match(libelle.body, /Rien n’est retiré/);
  // Aucun défi (reçu, relevé, pas encore) ne donne de cœur ni de gemme à qui que ce soit.
  for (const p of [...membres(0), ...membres(1)]) {
    const b = await readPlayerBourses(p.id);
    assert.ok(b.health + b.power >= 0);
  }
  const causes = await db.queryAll(
    "SELECT DISTINCT cause FROM gl_resource_ledger WHERE game_id = ? AND cause LIKE '%defi%'",
    [ctx.game.id],
  );
  assert.deepEqual(causes, []);
  const inv = await checkTenirInvariantsFromDb(db, ctx.game.id, {
    settings: await getGameplaySettings(),
  });
  assert.deepEqual(inv.violations || [], []);
});

test('tirage sans répétition dans la partie, puis remise à zéro quand la liste est épuisée', async () => {
  // Deux défis au catalogue d'exemple du plateau 1 : les deux premiers tirages les ont pris.
  const tires = (
    await db.queryAll('SELECT defi_code FROM gl_game_defis_case WHERE game_id = ? ORDER BY id', [
      ctx.game.id,
    ])
  ).map((r) => r.defi_code);
  assert.equal(tires.length, 2);
  assert.notEqual(tires[0], tires[1], 'pas de répétition');
  assert.deepEqual([...tires].sort(), ['d-ex-p1-a', 'd-ex-p1-b']);
  // Liste épuisée : le troisième tirage recommence, le quatrième prend l'autre.
  const troisieme = await db.withTransaction((tx) =>
    tirerDefiTx(tx, { gameId: ctx.game.id, plateau: 1 }),
  );
  assert.ok(['d-ex-p1-a', 'd-ex-p1-b'].includes(troisieme.code));
  await db.execute(
    "INSERT INTO gl_game_defis_case (game_id, team_id, marker_id, defi_code, round_number, statut, created_at) VALUES (?, ?, NULL, ?, 0, 'annule', NOW())",
    [ctx.game.id, team(3).id, troisieme.code],
  );
  const quatrieme = await db.withTransaction((tx) =>
    tirerDefiTx(tx, { gameId: ctx.game.id, plateau: 1 }),
  );
  assert.notEqual(quatrieme.code, troisieme.code, 'nouveau cycle : toujours sans répétition');
  // Un plateau sans défi : rien à tirer, rien ne casse.
  assert.equal(
    await db.withTransaction((tx) => tirerDefiTx(tx, { gameId: ctx.game.id, plateau: 9 })),
    null,
  );
});

test('mode `passage` : un défi par équipe et par case, dès que le pion la franchit ; `defis_case: false` éteint tout', async () => {
  await tourSuivant();
  await surcharger({ surface: 'tablette', defi_declenchement: 'passage' });
  const compte = async (i) =>
    Number(
      (
        await db.queryOne(
          'SELECT COUNT(*) AS n FROM gl_game_defis_case WHERE game_id = ? AND team_id = ? AND marker_id = ?',
          [ctx.game.id, team(i).id, caseDefi.id],
        )
      ).n,
    );
  // Licornes A part de la case 1 et avance de 4 : elle franchit la case Défi (rang 3).
  await placer(2, 1);
  assert.equal(await compte(2), 0);
  assert.equal((await jet(2, [2, 2])).status, 201);
  await request(app)
    .post(api('/tenir/arrivee/garder'))
    .set(auth(ctx.adminToken))
    .send({ teamId: team(2).id });
  assert.equal(await compte(2), 1, 'franchie : défi reçu');

  // Au tour suivant, la même équipe refranchit la même case : pas de second défi.
  await tourSuivant();
  await placer(2, 1);
  assert.equal((await jet(2, [2, 2])).status, 201);
  await request(app)
    .post(api('/tenir/arrivee/garder'))
    .set(auth(ctx.adminToken))
    .send({ teamId: team(2).id });
  assert.equal(await compte(2), 1, 'une fois par équipe et par case');

  // Réglage éteint : la case ne confie plus rien.
  await surcharger({ surface: 'tablette', defis_case: false });
  await placer(3, 1);
  assert.equal((await jet(3, [1, 1])).status, 201);
  await request(app)
    .post(api('/tenir/arrivee/garder'))
    .set(auth(ctx.adminToken))
    .send({ teamId: team(3).id });
  assert.equal(await compte(3), 0);
  const vue = await request(app).get(api('/defis-case')).set(auth(ctx.adminToken)).expect(200);
  assert.equal(vue.body.actifs, false);
  await surcharger({ surface: 'tablette' });
});

test('sortie automatique : au Seuil, un défi encore à préparer est annulé, sans effet', async () => {
  const enCours = (await defisDe(ctx.adminToken)).filter((d) => d.statut === 'a_preparer');
  assert.ok(enCours.length >= 1, 'un défi attend encore');
  const avantVoile = await voile();
  for (const body of [{ phase: 'souffle', dort: true }, { phase: 'clos' }]) {
    await request(app)
      .post(api('/tenir/tour/phase'))
      .set(auth(ctx.adminToken))
      .send(body)
      .expect(200);
  }
  const fin = await request(app).post(api('/end')).set(auth(ctx.adminToken));
  assert.ok([200, 201].includes(fin.status), JSON.stringify(fin.body));
  const restants = await db.queryAll(
    "SELECT statut FROM gl_game_defis_case WHERE game_id = ? AND statut = 'a_preparer'",
    [ctx.game.id],
  );
  assert.deepEqual(restants, []);
  const annules = await db.queryOne(
    "SELECT COUNT(*) AS n FROM gl_game_defis_case WHERE game_id = ? AND statut = 'annule' AND decided_by = 'seuil'",
    [ctx.game.id],
  );
  assert.ok(Number(annules.n) >= 1);
  assert.equal(
    (await listDemandes(db, ctx.game.id)).length,
    0,
    'plus aucune demande en attente après le Seuil',
  );
  assert.ok((await voile()) >= -1 && avantVoile >= -1);
});
