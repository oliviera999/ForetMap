'use strict';

/**
 * « Tenir à deux » v2 — pistes de veillée (spec § 5) : étudier la fiche d'une espèce liée à une
 * page endormie révèle la zone (contour visible) ; une piste par élève et par semaine.
 * Fixtures anonymes.
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, execute, queryOne } = db;
const { createTenirGame, importExempleChasse } = require('./helpers/glTenirFixtures');

let ctx;
let stamp;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const api = (path) => `/api/gl/games/${ctx.game.id}${path}`;
const species = (n) => `SPTEN${String(stamp).slice(-5)}${n}`;

before(async () => {
  await initSchema();
  stamp = Date.now();
  ctx = await createTenirGame({ stamp });
  await importExempleChasse(db, { game: ctx.game });
  await request(app).get(api('/tenir')).set(auth(ctx.adminToken)).expect(200);
  for (const [n, feuillet] of [
    ['A', 'tenir-ex-p1-1'],
    ['B', 'tenir-ex-p1-2'],
  ]) {
    await execute(
      `INSERT INTO gl_species (species_code, biome_slug, type, nom_commun, statut, created_at, updated_at)
       VALUES (?, 'jungle_afc', 'faune', ?, 'actif', NOW(), NOW())
       ON DUPLICATE KEY UPDATE statut = 'actif', updated_at = NOW()`,
      [species(n), `Espèce piste ${n}`],
    );
    await execute(
      "UPDATE gl_lore_feuillets SET lien_canal = 'espece', lien_ref = ? WHERE feuillet_code = ?",
      [species(n), feuillet],
    );
  }
});

test('étudier une espèce liée à une page endormie révèle la zone ; piste inscrite ; une par semaine', async () => {
  const player = ctx.players[0];
  const res = await request(app)
    .post(`/api/gl/learning/species/${species('A')}`)
    .set(auth(player.token))
    .send({ confirm: true, gameId: ctx.game.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.piste?.zoneKey, 'cz-p1-01');
  assert.equal(res.body.piste.limite, false);
  const page = await queryOne(
    'SELECT p.etat FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id WHERE p.game_id = ? AND z.zone_key = ?',
    [ctx.game.id, 'cz-p1-01'],
  );
  assert.equal(page.etat, 'revelee');
  const piste = await queryOne(
    'SELECT id FROM gl_game_chasse_pistes WHERE game_id = ? AND player_id = ?',
    [ctx.game.id, player.id],
  );
  assert.ok(piste);
  const evt = await queryOne(
    "SELECT payload_json FROM gl_game_events WHERE game_id = ? AND event_type = 'piste' ORDER BY id DESC LIMIT 1",
    [ctx.game.id],
  );
  assert.equal(JSON.parse(evt.payload_json).zoneKey, 'cz-p1-01');

  // Deuxième espèce la même semaine : limite atteinte, la zone reste endormie.
  const second = await request(app)
    .post(`/api/gl/learning/species/${species('B')}`)
    .set(auth(player.token))
    .send({ confirm: true, gameId: ctx.game.id });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(second.body.piste?.zoneKey, 'cz-p1-02');
  assert.equal(second.body.piste.limite, true);
  const page2 = await queryOne(
    'SELECT p.etat FROM gl_game_chasse_pages p INNER JOIN gl_chasse_zones z ON z.id = p.zone_id WHERE p.game_id = ? AND z.zone_key = ?',
    [ctx.game.id, 'cz-p1-02'],
  );
  assert.equal(page2.etat, 'endormie');

  // Un autre élève peut, lui, ouvrir sa propre piste.
  const other = await request(app)
    .post(`/api/gl/learning/species/${species('B')}`)
    .set(auth(ctx.players[1].token))
    .send({ confirm: true, gameId: ctx.game.id });
  assert.equal(other.status, 200, JSON.stringify(other.body));
  assert.equal(other.body.piste?.limite, false);
  const carnet = await request(app).get(api('/chasse')).set(auth(ctx.players[3].token));
  assert.equal(carnet.body.pages.find((p) => p.zoneKey === 'cz-p1-02').etat, 'revelee');
});
