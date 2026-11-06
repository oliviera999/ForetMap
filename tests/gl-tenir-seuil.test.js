'use strict';

require('./helpers/setup');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne, queryAll } = db;
const { runImports } = require('../scripts/gl-import-tenir');
const { createTenirGame, setPlayerBourses } = require('./helpers/glTenirFixtures');
const { MOTIF_CARAVANE } = require('../lib/glSeuil');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
const auth = (t) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  await initSchema();
  await runImports(db, { fichier: 'parures', dossier: EXEMPLE });
});

test('clôture forcée : la caravane porte les retardataires, parures rendues, annonces expirées, retraits clos, une seule fois', async () => {
  const ctx = await createTenirGame({ stamp: Date.now() });
  const camp = ctx.markers[ctx.markers.length - 1];
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id = ?', [
    camp.id,
    ctx.teams[0].id,
  ]);
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE id IN (?, ?, ?)', [
    ctx.markers[3].id,
    ctx.teams[1].id,
    ctx.teams[2].id,
    ctx.teams[3].id,
  ]);
  await execute('UPDATE gl_game_tenir_state SET premiere_arrivee_team_id = ? WHERE game_id = ?', [
    ctx.teams[0].id,
    ctx.game.id,
  ]).catch(() => {});
  await execute(
    'INSERT INTO gl_game_tenir_state (game_id, premiere_arrivee_team_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE premiere_arrivee_team_id = VALUES(premiere_arrivee_team_id)',
    [ctx.game.id, ctx.teams[0].id],
  );
  // Une parure portée, une annonce ouverte, un retrait ouvert.
  const a = ctx.players[0];
  await setPlayerBourses(a.id, 3, 5);
  const parure = await queryOne(
    'SELECT code FROM gl_tenir_parures WHERE asset IS NOT NULL AND actif = 1 LIMIT 1',
  );
  const bought = await request(app)
    .post(`/api/gl/market/parures/${parure.code}/acheter`)
    .set(auth(a.token))
    .send({ ressource: 'gemmes' });
  assert.equal(bought.status, 201, JSON.stringify(bought.body));
  const annonce = await request(app)
    .post('/api/gl/market/annonces')
    .set(auth(a.token))
    .send({ type: 'cherche', cherche: { gemmes: 1 } });
  assert.equal(annonce.status, 201);
  await execute(
    'INSERT INTO gl_game_retraits (game_id, player_id, entree_at) VALUES (?, ?, NOW())',
    [ctx.game.id, ctx.players[1].id],
  );
  await request(app)
    .post(`/api/gl/games/${ctx.game.id}/tenir/tour/ouvrir`)
    .set(auth(ctx.adminToken));

  const end = await request(app).post(`/api/gl/games/${ctx.game.id}/end`).set(auth(ctx.adminToken));
  assert.equal(end.status, 200, JSON.stringify(end.body));
  for (const team of ctx.teams) {
    const row = await queryOne('SELECT position_marker_id FROM gl_teams WHERE id = ?', [team.id]);
    assert.equal(
      Number(row.position_marker_id),
      Number(camp.id),
      `équipe ${team.name} portée au camp`,
    );
  }
  const caravane = await queryAll(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'avance_libre'",
    [ctx.game.id],
  );
  assert.equal(caravane.length, 3);
  assert.ok(caravane.every((e) => JSON.parse(e.payload_json).motif === MOTIF_CARAVANE));
  const worn = await queryOne('SELECT rendue_at FROM gl_game_parures WHERE id = ?', [
    bought.body.id,
  ]);
  assert.ok(worn.rendue_at, 'parure rendue au comptoir');
  const ann = await queryOne('SELECT statut FROM gl_market_annonces WHERE id = ?', [
    annonce.body.id,
  ]);
  assert.equal(ann.statut, 'expiree');
  const retrait = await queryOne(
    'SELECT sortie_at FROM gl_game_retraits WHERE game_id = ? AND player_id = ?',
    [ctx.game.id, ctx.players[1].id],
  );
  assert.ok(retrait.sortie_at);
  const round = await queryOne(
    'SELECT phase FROM gl_game_rounds WHERE game_id = ? ORDER BY round_number DESC LIMIT 1',
    [ctx.game.id],
  );
  assert.equal(round.phase, 'clos');
  const seuil = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'seuil_clos'",
    [ctx.game.id],
  );
  assert.equal(seuil.length, 1);
  const proj = await queryOne('SELECT projection_token_hash FROM gl_games WHERE id = ?', [
    ctx.game.id,
  ]);
  assert.equal(proj.projection_token_hash, null);
});

test('clôture avec les 4 équipes au camp : aucune avance libre', async () => {
  const ctx = await createTenirGame({ stamp: Date.now() + 1 });
  const camp = ctx.markers[ctx.markers.length - 1];
  await execute('UPDATE gl_teams SET position_marker_id = ? WHERE game_id = ?', [
    camp.id,
    ctx.game.id,
  ]);
  const end = await request(app).post(`/api/gl/games/${ctx.game.id}/end`).set(auth(ctx.adminToken));
  assert.equal(end.status, 200, JSON.stringify(end.body));
  const caravane = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'avance_libre'",
    [ctx.game.id],
  );
  assert.equal(caravane.length, 0);
  const seuil = await queryAll(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'seuil_clos'",
    [ctx.game.id],
  );
  assert.equal(seuil.length, 1);
});
