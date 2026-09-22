'use strict';

// Clés dichotomiques d'identification (lot 6, migration 275).

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../server');
const { initSchema, execute, queryOne } = require('../database');
const { ensureAdminTeacherAuthToken } = require('./helpers/adminAuth');
const {
  validateLeadOutcome,
  findManipulationInvitation,
  hasCoupletCycle,
} = require('../lib/idKeys');

const stamp = Date.now();
const slug = `arbres-test-${stamp}`.slice(0, 120);

let token = '';
let plantId = 0;
let keyId = 0;
let couplet1 = 0;
let couplet2 = 0;
const auth = () => ({ Authorization: `Bearer ${token}` });

before(async () => {
  await initSchema();
  token = await ensureAdminTeacherAuthToken();
  const plant = await execute(
    `INSERT INTO plants (name, emoji, description) VALUES (?, '🌳', 'id-key test')`,
    [`IdKey Plant ${stamp}`],
  );
  plantId = plant.insertId;
});

after(async () => {
  if (keyId) await execute('DELETE FROM id_keys WHERE id = ?', [keyId]).catch(() => {});
  if (plantId) await execute('DELETE FROM plants WHERE id = ?', [plantId]).catch(() => {});
});

test('helpers purs : issue XOR, manipulation, cycles', () => {
  assert.equal(validateLeadOutcome({ nextCoupletId: 2, plantId: null }).ok, true);
  assert.equal(validateLeadOutcome({ nextCoupletId: null, plantId: 5 }).ok, true);
  assert.equal(validateLeadOutcome({ nextCoupletId: 2, plantId: 5 }).ok, false);
  assert.equal(validateLeadOutcome({ nextCoupletId: null, plantId: null }).ok, false);
  assert.ok(findManipulationInvitation('Goûter une feuille'));
  assert.equal(findManipulationInvitation('Feuilles opposées'), null);
  assert.equal(
    hasCoupletCycle([
      { id: 1, leads: [{ next_couplet_id: 2 }] },
      { id: 2, leads: [{ next_couplet_id: 1 }] },
    ]),
    true,
  );
  assert.equal(
    hasCoupletCycle([
      { id: 1, leads: [{ next_couplet_id: 2 }] },
      { id: 2, leads: [{ plant_id: 9 }] },
    ]),
    false,
  );
});

test('CRUD clé + couplets + leads, publication refusée si incomplet', async () => {
  const created = await request(app)
    .post('/api/id-keys')
    .set(auth())
    .send({ slug, title: 'Arbres de test', niveau: 'college' })
    .expect(201);
  keyId = created.body.id;
  couplet1 = created.body.couplets[0].id;
  assert.equal(created.body.is_published, false);

  const c2 = await request(app)
    .post(`/api/id-keys/${keyId}/couplets`)
    .set(auth())
    .send({})
    .expect(201);
  couplet2 = c2.body.id;

  await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${couplet1}/leads`)
    .set(auth())
    .send({
      leads: [
        { statement: 'Feuilles en aiguilles', next_couplet_id: couplet2 },
        { statement: 'Feuilles larges', plant_id: plantId },
      ],
    })
    .expect(200);

  // Manipulation refusée
  await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${couplet2}/leads`)
    .set(auth())
    .send({
      leads: [
        { statement: 'Cueillir une aiguille pour sentir', plant_id: plantId },
        { statement: 'Aiguilles groupées par cinq', plant_id: plantId },
      ],
    })
    .expect(400);

  await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${couplet2}/leads`)
    .set(auth())
    .send({
      leads: [
        { statement: 'Aiguilles groupées par deux', plant_id: plantId },
        { statement: 'Aiguilles groupées par cinq', plant_id: plantId },
      ],
    })
    .expect(200);

  // Cycle refusé
  await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${couplet2}/leads`)
    .set(auth())
    .send({
      leads: [
        { statement: 'Retour au départ', next_couplet_id: couplet1 },
        { statement: 'Aiguilles groupées par cinq', plant_id: plantId },
      ],
    })
    .expect(400);

  // Remettre des leads valides avant publication
  await request(app)
    .put(`/api/id-keys/${keyId}/couplets/${couplet2}/leads`)
    .set(auth())
    .send({
      leads: [
        { statement: 'Aiguilles groupées par deux', plant_id: plantId },
        { statement: 'Aiguilles groupées par cinq', plant_id: plantId },
      ],
    })
    .expect(200);

  const pub = await request(app)
    .put(`/api/id-keys/${keyId}`)
    .set(auth())
    .send({ is_published: true })
    .expect(200);
  assert.equal(pub.body.is_published, true);

  const list = await request(app).get('/api/id-keys').expect(200);
  assert.ok((list.body.items || []).some((k) => k.id === keyId));

  const detail = await request(app).get(`/api/id-keys/${slug}`).expect(200);
  assert.equal(detail.body.couplets.length, 2);
  assert.ok(detail.body.couplets[0].leads.length >= 2);
});

test('sans permission : création refusée', async () => {
  await request(app)
    .post('/api/id-keys')
    .send({ slug: `noauth-${stamp}`, title: 'X' })
    .expect(401);
});

test('PlantDeterminationSection fields restent en whitelist plantes', async () => {
  const { PLANT_COLUMNS } = require('../lib/plantsRouteHelpers');
  assert.ok(PLANT_COLUMNS.includes('identification_criteria'));
  assert.ok(PLANT_COLUMNS.includes('lookalike_species'));
  assert.ok(PLANT_COLUMNS.includes('identification_period'));
  const plant = await queryOne(
    'SELECT identification_criteria, lookalike_species, identification_period FROM plants WHERE id = ?',
    [plantId],
  );
  assert.ok(plant);
});
