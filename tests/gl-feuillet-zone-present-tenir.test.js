'use strict';

/**
 * Audit des bugs G&L du 19/11/2026, P1 — en partie « Tenir à deux », la traversée d'une zone
 * feuillet annonçait le gain de cœurs du catalogue : la route ne lisait pas `tenir_profil`,
 * `isTenirGame` valait donc toujours faux et `gainCoeur` n'était jamais remis à 0
 * (ensemble unifié, M1 : aucun cœur montré ni crédité en « Tenir »).
 */

require('./helpers/setup');
const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute } = require('../database');
const { getFeuilletZoneById } = require('../lib/glFeuilletZonesCatalog');
const { createTenirGame } = require('./helpers/glTenirFixtures');

const ZONE_ID = 'zf-p1-01';
let ctx = null;

before(async () => {
  await initSchema();
  ctx = await createTenirGame({ plateau: 1, playerCount: 4 });
});

test('le catalogue annonce bien un gain de cœurs pour cette zone (sinon le test ne prouve rien)', () => {
  assert.ok(Number(getFeuilletZoneById(ZONE_ID).gain_coeur) > 0);
});

test('P1 — partie « Tenir » : la traversée d’une zone feuillet n’annonce aucun cœur', async () => {
  const joueur = ctx.players[0];
  const [cx, cy] = getFeuilletZoneById(ZONE_ID).centre;
  await execute(
    'UPDATE gl_teams SET position_x_pct = ?, position_y_pct = ?, position_marker_id = NULL WHERE id = ?',
    [cx * 100, cy * 100, joueur.teamId],
  );

  const res = await request(app)
    .post(`/api/gl/games/${ctx.game.id}/feuillet-zones/${ZONE_ID}/present`)
    .set('Authorization', `Bearer ${joueur.token}`)
    .send({})
    .expect(200);
  assert.strictEqual(res.body?.zone?.zoneId, ZONE_ID);
  assert.strictEqual(res.body.zone.gainCoeur, 0);
});
