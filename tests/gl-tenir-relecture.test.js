'use strict';

/**
 * « Tenir à deux » v2 — non-régressions issues de la relecture de code (passe 2) :
 * diffusion temps réel expurgée, jeton de lecture vérifié avant écriture, permissions de
 * lecture et de Marché rejouées par surface, mode de dés borné, « on passe » validé, motif
 * libre privé, profil remis à null, état tenir lu sans écriture, titres groupés, CSV sans
 * formule, parure à la ressource du catalogue, voyageur hors expédition, Trame sans `effects`.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne } = db;
const {
  createTenirGame,
  importExempleChasse,
  ouvrirTourEnJeu,
  readPlayerBourses,
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');
const { redactPrivateEventPayload } = require('../lib/realtime');
const { csvCell } = require('../lib/glTenirExports');
const { buildSpellState, VOYAGEUR_SPELLS } = require('../lib/glVoyageur');
const { resolveTenirMarkerDeltas } = require('../lib/glMarkerVitalityEffects');
const { titreMajoritaire, titresMajoritairesParEquipe } = require('../lib/glHonneurs');
const { loadTenirState } = require('../lib/glTenir');

let ctx;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
const gnomeA = () => ctx.players[0];
const licorneA = () => ctx.players[2];

async function zoneId(zoneKey) {
  return Number(
    (await queryOne('SELECT id FROM gl_chasse_zones WHERE zone_key = ?', [zoneKey])).id,
  );
}

async function setSurface(surface, overrides = {}) {
  await execute('UPDATE gl_games SET tenir_surface = ?, tenir_overrides_json = ? WHERE id = ?', [
    surface,
    JSON.stringify({ surface, ...overrides }),
    ctx.game.id,
  ]);
}

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  await ouvrirTourEnJeu(request, app, ctx);
});

test('temps réel : un payload privé ne sort de la socket qu’avec ses clés publiques', () => {
  const evt = {
    eventType: 'chapardeur',
    payload: {
      roundNumber: 3,
      playerId: 42,
      ressource: 'power',
      private: true,
      publicKeys: ['roundNumber'],
    },
  };
  assert.deepEqual(redactPrivateEventPayload(evt).payload, { roundNumber: 3, redacted: true });
  const open = { eventType: 'fouille', payload: { verdict: 'chaud' } };
  assert.equal(redactPrivateEventPayload(open), open);
});

test('CSV : une cellule qui commence par = + - @ ne devient jamais une formule', () => {
  assert.equal(csvCell('=HYPERLINK("http://x";"y")'), '"\'=HYPERLINK(""http://x"";""y"")"');
  assert.equal(csvCell('+33'), '"\'+33"');
  assert.equal(csvCell('-1'), '"\'-1"');
  assert.equal(csvCell('@x'), '"\'@x"');
  assert.equal(csvCell('joueur-a'), 'joueur-a');
  assert.equal(csvCell(3), '3');
});

test('voyageur : sans traversée en cours, l’état porte horsExpedition', () => {
  const spell = VOYAGEUR_SPELLS.find((s) => s.levelRequired === 1);
  assert.equal(buildSpellState(spell, { level: 3, points: 10, useRow: null }).horsExpedition, true);
  assert.equal(
    buildSpellState(spell, { level: 3, points: 10, useRow: null, currentGameId: 7 }).horsExpedition,
    false,
  );
});

test('Trame : +1 ressource du peuple même sans bloc `effects` sur la case', () => {
  const marker = { event_type: 'trame' };
  assert.equal(resolveTenirMarkerDeltas(marker, 'unicorn', null).powerDelta, 1);
  assert.equal(resolveTenirMarkerDeltas(marker, 'gnome', null).healthDelta, 1);
  assert.equal(resolveTenirMarkerDeltas(marker, 'gnome', null).moveDelta, 0);
});

test('mode de dés : un élève ne force pas `physique` sur une surface `serveur` ; le prof peut', async () => {
  await setSurface('tablette', { des_mode: 'serveur', des_physiques_validation: 'auto' });
  const forced = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(gnomeA().token))
    .send({ mode: 'physique', faces: [6, 6] });
  assert.equal(forced.status, 403, JSON.stringify(forced.body));
  assert.equal(forced.body.code, 'TENIR_DES_MODE');
});

test('« on passe » : partie invalide 400, équipe d’une autre partie 404, joueur → sa propre équipe', async () => {
  const bad = await request(app)
    .post('/api/gl/games/abc/tenir/peripetie/passer')
    .set(auth(ctx.adminToken))
    .send({ id: 'p1' });
  assert.equal(bad.status, 400);
  const foreign = await request(app)
    .post(api('/tenir/peripetie/passer'))
    .set(auth(ctx.adminToken))
    .send({ id: 'p1', teamId: 999999 });
  assert.equal(foreign.status, 404);
  const ok = await request(app)
    .post(api('/tenir/peripetie/passer'))
    .set(auth(licorneA().token))
    .send({ id: 'p1', teamId: gnomeA().teamId });
  assert.equal(ok.status, 200);
  const evt = await queryOne(
    "SELECT team_id FROM gl_game_events WHERE game_id = ? AND event_type = 'peripetie_passee' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(Number(evt.team_id), licorneA().teamId, 'le teamId du corps est ignoré');
});

test('avance libre : le motif du prof reste privé (journal élève et projection expurgés)', async () => {
  const res = await request(app)
    .post(api('/tenir/lancer'))
    .set(auth(ctx.adminToken))
    .send({ mode: 'libre', cases: 1, motif: 'motif confidentiel', teamId: gnomeA().teamId });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const state = await request(app).get(api('')).set(auth(licorneA().token));
  const evt = state.body.events.filter((e) => e.eventType === 'avance_libre').pop();
  assert.ok(evt, 'évènement visible');
  assert.equal(evt.payload.redacted, true);
  assert.equal(evt.payload.motif, undefined);
  assert.equal(evt.payload.cases, 1);
  const mj = await request(app).get(api('')).set(auth(ctx.adminToken));
  const full = mj.body.events.filter((e) => e.eventType === 'avance_libre').pop();
  assert.equal(full.payload.motif, 'motif confidentiel');
});

test('lecture en `tableau` : un élève ne lit pas (403 TENIR_LIRE_SURFACE), le prof si', async () => {
  await setSurface('tableau');
  const refused = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(licorneA().token))
    .send({});
  assert.equal(refused.status, 403, JSON.stringify(refused.body));
  assert.equal(refused.body.code, 'TENIR_LIRE_SURFACE');
  const mj = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(ctx.adminToken))
    .send({ teamId: licorneA().teamId });
  assert.notEqual(mj.status, 403);
  await setSurface('tablette');
});

test('tenir : un jeton d’une autre page est refusé AVANT toute écriture (400 JETON_AUTRE_PAGE)', async () => {
  await execute(
    `UPDATE gl_game_chasse_pages SET etat = 'trouvee', trouvee_par_team_id = ?, trouvee_at = NOW() WHERE game_id = ? AND zone_id = ?`,
    [gnomeA().teamId, ctx.game.id, await zoneId('cz-p1-01')],
  );
  await setPlayerBourses(licorneA().id, 2, 2);
  const ouvert = await request(app)
    .post(api('/chasse/pages/cz-p1-01/ouvrir'))
    .set(auth(licorneA().token))
    .send({});
  assert.equal(ouvert.status, 200, JSON.stringify(ouvert.body));
  const q = ouvert.body.question;
  assert.ok(q?.presentationToken);
  const right = q.choices.find((c) => c.text === 'Que la forêt respire');
  const wrongPage = await request(app)
    .post(api('/chasse/pages/cz-p1-02/tenir'))
    .set(auth(licorneA().token))
    .send({
      presentationToken: q.presentationToken,
      questionCode: q.questionCode,
      choiceId: right.id,
    });
  assert.equal(wrongPage.status, 400, JSON.stringify(wrongPage.body));
  assert.equal(wrongPage.body.code, 'JETON_AUTRE_PAGE');
  const page = await queryOne(
    'SELECT etat FROM gl_game_chasse_pages WHERE game_id = ? AND zone_id = ?',
    [ctx.game.id, await zoneId('cz-p1-01')],
  );
  assert.equal(page.etat, 'trouvee', 'rien n’a été tenu');
  assert.deepEqual(await readPlayerBourses(licorneA().id), { health: 2, power: 2 });
});

test('Marché : en `tableau` pendant la phase `jeu`, les actions attendent la veillée (403 MARCHE_PHASE)', async () => {
  await setSurface('tableau');
  const read = await request(app).get('/api/gl/market/annonces').set(auth(gnomeA().token));
  assert.equal(read.status, 200);
  const write = await request(app)
    .post('/api/gl/market/annonces')
    .set(auth(gnomeA().token))
    .send({ type: 'cherche', cherche: { gemmes: 1 } });
  assert.equal(write.status, 403, JSON.stringify(write.body));
  assert.equal(write.body.code, 'MARCHE_PHASE');
  await setSurface('tablette');
  const ok = await request(app)
    .post('/api/gl/market/annonces')
    .set(auth(gnomeA().token))
    .send({ type: 'cherche', cherche: { gemmes: 1 } });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
});

test('parure : la ressource du catalogue prime sur celle du corps (sauf `choix`)', async () => {
  const parure = await queryOne(
    'SELECT code FROM gl_tenir_parures WHERE actif = 1 AND asset IS NOT NULL ORDER BY prix ASC, code ASC LIMIT 1',
  );
  assert.ok(parure, 'une parure achetable');
  await execute("UPDATE gl_tenir_parures SET ressource = 'gemmes', prix = 1 WHERE code = ?", [
    parure.code,
  ]);
  await setPlayerBourses(gnomeA().id, 3, 3);
  try {
    const bought = await request(app)
      .post(`/api/gl/market/parures/${parure.code}/acheter`)
      .set(auth(gnomeA().token))
      .send({ ressource: 'coeurs' });
    assert.equal(bought.status, 201, JSON.stringify(bought.body));
    assert.equal(bought.body.ressource, 'gemmes');
    assert.deepEqual(await readPlayerBourses(gnomeA().id), { health: 3, power: 2 });
  } finally {
    await execute("UPDATE gl_tenir_parures SET ressource = 'choix' WHERE code = ?", [parure.code]);
  }
});

test('titres groupés : même résultat que le calcul par équipe', async () => {
  const grouped = await titresMajoritairesParEquipe(db, ctx.game.id);
  for (const team of ctx.teams) {
    assert.equal(grouped.get(Number(team.id)), await titreMajoritaire(db, ctx.game.id, team.id));
  }
});

test('profil `null` : la partie revient aux règles classiques, puis `complet` la rétablit', async () => {
  const off = await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({ profil: null });
  assert.equal(off.status, 200, JSON.stringify(off.body));
  const row = await queryOne('SELECT tenir_profil FROM gl_games WHERE id = ?', [ctx.game.id]);
  assert.equal(row.tenir_profil, null);
  const state = await request(app).get(api('')).set(auth(ctx.adminToken));
  assert.equal(state.body.tenir.enabled, false);
  const on = await request(app)
    .put(api('/tenir/profil'))
    .set(auth(ctx.adminToken))
    .send({ profil: 'complet' });
  assert.equal(on.status, 200);
});

test('brouillon consulté : aucun état tenir n’est créé par la lecture', async () => {
  const draft = await createTenirGame({ stamp: Date.now() + 5, status: 'draft' });
  const state = await request(app)
    .get(`/api/gl/games/${draft.game.id}`)
    .set(auth(draft.adminToken));
  assert.equal(state.status, 200);
  assert.equal(state.body.tenir.enabled, true);
  assert.equal(state.body.tenir.state.voilePosition, -1);
  assert.equal(await loadTenirState(db, draft.game.id), null);
});
