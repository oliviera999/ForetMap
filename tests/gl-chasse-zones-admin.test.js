'use strict';

require('./helpers/setup');
const path = require('node:path');
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const db = require('../database');
const { initSchema, queryOne } = db;
const { runImports } = require('../scripts/gl-import-tenir');
const { createTenirGame } = require('./helpers/glTenirFixtures');

const EXEMPLE = path.join(__dirname, '..', 'data', 'gl', 'tenir', 'exemple');
let adminToken = '';
let playerToken = '';

before(async () => {
  await initSchema();
  const ctx = await createTenirGame({ stamp: Date.now() });
  adminToken = ctx.adminToken;
  playerToken = ctx.players[0].token;
  const reports = await runImports(db, { fichier: 'chasse-zones', dossier: EXEMPLE });
  assert.deepEqual(reports[0].errors, []);
});

test('GET /api/gl/admin/chasse-zones?plateau=1 sert les zones avec leur géométrie au prof seul', async () => {
  const res = await request(app)
    .get('/api/gl/admin/chasse-zones?plateau=1')
    .set('Authorization', `Bearer ${adminToken}`);
  assert.equal(res.status, 200);
  assert.ok(res.body.items.length >= 2);
  const zone = res.body.items.find((z) => z.zoneKey === 'cz-p1-01');
  assert.ok(Array.isArray(zone.polygone));
  assert.equal(zone.geometriePrete, true);
  assert.ok(zone.titrePrive);
  const forbidden = await request(app)
    .get('/api/gl/admin/chasse-zones?plateau=1')
    .set('Authorization', `Bearer ${playerToken}`);
  assert.equal(forbidden.status, 403);
});

test('PUT /chasse-zones/:zoneKey/polygone valide, calcule centroïde et rang, pose geometrie_prete', async () => {
  const bad = await request(app)
    .put('/api/gl/admin/chasse-zones/cz-p1-02/polygone')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      polygone: [
        [0.1, 0.1],
        [0.2, 0.2],
      ],
    });
  assert.equal(bad.status, 400);

  const cleared = await request(app)
    .put('/api/gl/admin/chasse-zones/cz-p1-02/polygone')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ polygone: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.geometriePrete, false);
  assert.equal(cleared.body.rangCase, null);

  const drawn = await request(app)
    .put('/api/gl/admin/chasse-zones/cz-p1-02/polygone')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      polygone: [
        [0.8, 0.2],
        [0.95, 0.2],
        [0.95, 0.4],
        [0.8, 0.4],
      ],
    });
  assert.equal(drawn.status, 200, JSON.stringify(drawn.body));
  assert.equal(drawn.body.geometriePrete, true);
  assert.ok(Math.abs(drawn.body.centre.x - 0.875) < 1e-6);
  assert.ok(Number.isInteger(drawn.body.rangCase));
  const row = await queryOne(
    'SELECT geometrie_prete, rang_case FROM gl_chasse_zones WHERE zone_key = ?',
    ['cz-p1-02'],
  );
  assert.equal(Number(row.geometrie_prete), 1);
  assert.equal(Number(row.rang_case), drawn.body.rangCase);

  const unknown = await request(app)
    .put('/api/gl/admin/chasse-zones/cz-p9-99/polygone')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      polygone: [
        [0.1, 0.1],
        [0.2, 0.1],
        [0.2, 0.2],
      ],
    });
  assert.equal(unknown.status, 404);
});
