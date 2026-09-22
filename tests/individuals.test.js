'use strict';

// Suivi d'individus arbres et mesures (lot 7, migration 276).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  diameterFromCircumference,
  estimateBiomassCarbon,
  DEFAULT_WOOD_DENSITY,
  DISCLAIMER,
} = require('../lib/individualBiomass');

const stamp = Date.now();
let token = '';
let plantId = 0;
let individualId = 0;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  // Carte de seed `foret` attendue par db:init
  const plant = await execute(
    `INSERT INTO plants (name, emoji, description) VALUES (?, '🌳', 'indiv test')`,
    [`Indiv Plant ${stamp}`],
  );
  plantId = plant.insertId;
});

after(async () => {
  if (individualId) {
    await execute('DELETE FROM tracked_individuals WHERE id = ?', [individualId]).catch(() => {});
  }
  if (plantId) await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
});

test('formules biomasse Chave 2014 (ordre de grandeur)', () => {
  const d = diameterFromCircumference(Math.PI * 20);
  assert.ok(Math.abs(d - 20) < 1e-9);
  const est = estimateBiomassCarbon({
    circumferenceCm: Math.PI * 20,
    heightM: 10,
    woodDensity: DEFAULT_WOOD_DENSITY,
  });
  assert.equal(est.computable, true);
  assert.ok(est.biomass_kg > 0);
  assert.ok(est.carbon_kg > 0);
  assert.ok(est.co2_kg > est.carbon_kg);
  assert.match(est.disclaimer, /ordre de grandeur/i);
  assert.equal(DISCLAIMER, est.disclaimer);

  const incomplete = estimateBiomassCarbon({ circumferenceCm: 30 });
  assert.equal(incomplete.computable, false);
});

test('CRUD individu + mesure avec estimations', async () => {
  const created = await request(app)
    .post('/api/individuals')
    .set(auth())
    .send({
      plant_id: plantId,
      map_id: 'foret',
      label: `Grenadier n°test ${stamp}`,
      wood_density: 0.6,
    })
    .expect(201);
  individualId = created.body.id;
  assert.equal(created.body.plant_id, plantId);

  const meas = await request(app)
    .post(`/api/individuals/${individualId}/measurements`)
    .set(auth())
    .send({
      measured_at: '2026-09-22',
      circumference_cm: 62.8,
      height_m: 4.5,
    })
    .expect(201);
  assert.equal(meas.body.estimate.computable, true);
  assert.match(meas.body.estimate.disclaimer, /ordre de grandeur/i);

  const detail = await request(app).get(`/api/individuals/${individualId}`).expect(200);
  assert.equal(detail.body.measurements.length, 1);
  assert.match(detail.body.disclaimer, /ordre de grandeur/i);

  const list = await request(app).get('/api/individuals?mapId=foret').expect(200);
  assert.ok((list.body.items || []).some((i) => i.id === individualId));
});

test('création sans auth refusée ; mesure sans auth refusée', async () => {
  await request(app)
    .post('/api/individuals')
    .send({ plant_id: plantId, map_id: 'foret', label: 'X' })
    .expect(401);
  await request(app)
    .post(`/api/individuals/${individualId || 1}/measurements`)
    .send({ measured_at: '2026-09-22', height_m: 1 })
    .expect(401);
});

test('tables gl_* inchangées par la migration 276', async () => {
  const gl = await queryOne(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'gl_%'`,
  );
  assert.ok(Number(gl.c) > 0);
});
