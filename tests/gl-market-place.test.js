'use strict';

require('./helpers/setup');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, queryOne, execute } = db;
const { runImports } = require('../scripts/gl-import-tenir');
const { upsertPlayerFeuilletState } = require('../lib/glLoreFeuillets');
const {
  createTenirGame,
  readPlayerBourses,
  setPlayerBourses,
} = require('./helpers/glTenirFixtures');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
let ctx;
let a;
let b;
let c;
const auth = (p) => ({ Authorization: `Bearer ${p.token}` });

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ stamp: Date.now() });
  await runImports(db, { fichier: 'parures', dossier: EXEMPLE });
  // a et b dans des équipes différentes, c coéquipier de a.
  a = ctx.players[0];
  b = ctx.players[1];
  c = ctx.players[4];
  assert.equal(a.teamId, c.teamId);
  assert.notEqual(a.teamId, b.teamId);
  for (const p of [a, b, c]) await setPlayerBourses(p.id, 3, 3);
});

test('/classmates : aucune bourse d’une autre équipe, celles de l’équipe visibles', async () => {
  const res = await request(app).get('/api/gl/market/classmates').set(auth(a));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const rowB = res.body.items.find((m) => m.id === b.id);
  const rowC = res.body.items.find((m) => m.id === c.id);
  assert.ok(rowB && !('healthPoints' in rowB) && !('powerPoints' in rowB));
  assert.ok(rowC && rowC.healthPoints === 3 && rowC.powerPoints === 3);
  assert.ok(rowB.teamName);
});

test('annonce → réponse → échange pré-rempli → double acceptation ferme l’annonce (cœurs échangeables)', async () => {
  const created = await request(app)
    .post('/api/gl/market/annonces')
    .set(auth(a))
    .send({ type: 'propose', offre: { gemmes: 1 }, cherche: { coeurs: 1 } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const annonceId = created.body.id;
  const empty = await request(app)
    .post('/api/gl/market/annonces')
    .set(auth(a))
    .send({ type: 'cherche', cherche: {} });
  assert.equal(empty.status, 400);
  const list = await request(app).get('/api/gl/market/annonces').set(auth(b));
  assert.ok(list.body.items.some((x) => x.id === annonceId && x.pseudo === a.pseudo));
  const own = await request(app).post(`/api/gl/market/annonces/${annonceId}/repondre`).set(auth(a));
  assert.equal(own.status, 409);

  const trade = await request(app)
    .post(`/api/gl/market/annonces/${annonceId}/repondre`)
    .set(auth(b));
  assert.equal(trade.status, 201, JSON.stringify(trade.body));
  const sideA = trade.body.sides.find((s) => s.playerId === a.id);
  const sideB = trade.body.sides.find((s) => s.playerId === b.id);
  assert.equal(sideA.offerPower, 1, 'offre de l’auteur pré-remplie');
  assert.equal(sideB.offerHealth, 1, 'côté du répondant pré-rempli');
  const linked = await queryOne('SELECT trade_id, statut FROM gl_market_annonces WHERE id = ?', [
    annonceId,
  ]);
  assert.equal(Number(linked.trade_id), trade.body.id);

  const accA = await request(app)
    .patch(`/api/gl/market/trades/${trade.body.id}/accept`)
    .set(auth(a))
    .send({ accepted: true });
  assert.equal(accA.status, 200, JSON.stringify(accA.body));
  const accB = await request(app)
    .patch(`/api/gl/market/trades/${trade.body.id}/accept`)
    .set(auth(b))
    .send({ accepted: true });
  assert.equal(accB.status, 200, JSON.stringify(accB.body));
  assert.deepEqual(await readPlayerBourses(a.id), { health: 4, power: 2 });
  assert.deepEqual(await readPlayerBourses(b.id), { health: 2, power: 4 });
  const closed = await queryOne('SELECT statut FROM gl_market_annonces WHERE id = ?', [annonceId]);
  assert.equal(closed.statut, 'conclue');
});

test('don : une ressource à la fois, plafond du receveur, surplus au donneur, événement `don`', async () => {
  await setPlayerBourses(a.id, 3, 5);
  await setPlayerBourses(b.id, 3, 7);
  const both = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(a))
    .send({ receveurId: b.id, gemmes: 1, coeurs: 1 });
  assert.equal(both.status, 400);
  const don = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(a))
    .send({ receveurId: b.id, gemmes: 3 });
  assert.equal(don.status, 201, JSON.stringify(don.body));
  assert.equal(don.body.transferred, 1);
  assert.equal(don.body.surplus, 2);
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 4 });
  assert.deepEqual(await readPlayerBourses(b.id), { health: 3, power: 8 });
  const full = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(a))
    .send({ receveurId: b.id, gemmes: 1 });
  assert.equal(full.status, 409);
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'don' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(JSON.parse(evt.payload_json).gemmes, 1);
  const row = await queryOne(
    'SELECT gemmes, coeurs FROM gl_market_dons WHERE donneur_id = ? ORDER BY id DESC LIMIT 1',
    [a.id],
  );
  assert.equal(Number(row.gemmes), 1);
});

test('don d’une page : copie à l’équipe du receveur, le découvreur garde son nom', async () => {
  await upsertPlayerFeuilletState(db, {
    playerId: a.id,
    feuilletCode: 'tenir-ex-p1-1',
    status: 'discovered',
    discoveredByName: 'Équipe A',
  });
  const don = await request(app)
    .post('/api/gl/market/dons')
    .set(auth(a))
    .send({ receveurId: b.id, feuilletCode: 'tenir-ex-p1-1' });
  assert.equal(don.status, 201, JSON.stringify(don.body));
  const teamState = await queryOne(
    'SELECT status, discovered_by_name FROM gl_game_feuillet_states WHERE game_id = ? AND team_id = ? AND feuillet_code = ?',
    [ctx.game.id, b.teamId, 'tenir-ex-p1-1'],
  );
  assert.ok(teamState);
  assert.equal(teamState.discovered_by_name, 'Équipe A');
  const personal = await queryOne(
    'SELECT status FROM gl_player_feuillet_states WHERE player_id = ? AND feuillet_code = ?',
    [b.id, 'tenir-ex-p1-1'],
  );
  assert.ok(personal);
});

test('parure : débite le membre et habille son équipe ; asset null = achetable en pastille (C10)', async () => {
  await setPlayerBourses(a.id, 3, 3);
  const list = await request(app).get('/api/gl/market/parures').set(auth(a));
  assert.equal(list.status, 200, JSON.stringify(list.body));
  const buyable = list.body.catalogue.find((p) => p.disponible);
  const sansImage = list.body.catalogue.find((p) => !p.asset);
  assert.ok(buyable && sansImage);
  assert.equal(sansImage.achetable, true, 'une parure sans image reste achetable');
  assert.equal(sansImage.typeEffectif, 'pastille');
  assert.ok(sansImage.pastille?.texte, 'pastille texte (initiale) tant que l’asset est nul');
  const bought = await request(app)
    .post(`/api/gl/market/parures/${buyable.code}/acheter`)
    .set(auth(a))
    .send({ ressource: 'gemmes' });
  assert.equal(bought.status, 201, JSON.stringify(bought.body));
  assert.equal(bought.body.teamId, a.teamId);
  assert.deepEqual(await readPlayerBourses(a.id), { health: 3, power: 3 - buyable.prix });
  const worn = await request(app).get('/api/gl/market/parures').set(auth(c));
  assert.ok(
    worn.body.portees.some((p) => p.code === buyable.code),
    'portée par l’équipe de a (vue de c)',
  );
  const other = await request(app).get('/api/gl/market/parures').set(auth(b));
  assert.ok(!other.body.portees.some((p) => p.code === buyable.code));
  const poor = await request(app)
    .post(`/api/gl/market/parures/${buyable.code}/acheter`)
    .set(auth(a))
    .send({ ressource: 'coeurs' });
  assert.equal(poor.status, buyable.prix > 3 ? 409 : 201);
});

test('retrait → 403 MARCHE_RETRAIT sur toute route du Marché', async () => {
  await execute(
    'INSERT INTO gl_game_retraits (game_id, player_id, motif, entree_at) VALUES (?, ?, NULL, NOW())',
    [ctx.game.id, c.id],
  );
  const res = await request(app).get('/api/gl/market/annonces').set(auth(c));
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'MARCHE_RETRAIT');
  await execute('UPDATE gl_game_retraits SET sortie_at = NOW() WHERE player_id = ?', [c.id]);
});

test('profil prologue : Marché fermé (403 MARCHE_FERME)', async () => {
  await execute("UPDATE gl_games SET tenir_profil = 'prologue' WHERE id = ?", [ctx.game.id]);
  const res = await request(app).get('/api/gl/market/annonces').set(auth(a));
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'MARCHE_FERME');
  await execute("UPDATE gl_games SET tenir_profil = 'complet' WHERE id = ?", [ctx.game.id]);
});
