'use strict';

/**
 * Outil de domaine `foretmap_observations` (lot D3) : file d'examen nominative (refusée sans
 * bypass), effet métier de la validation (présence confirmée au registre de la carte,
 * interaction prouvée qui passe à « observé sur le site »), refus sans effet, statistiques
 * agrégées, individus suivis, domaine désactivé.
 */

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fx = require('./helpers/mcpFixtures');
const fm = require('./helpers/fmFixtures');
const { initSchema, queryOne, execute } = require('../database');

fx.enableMcpEnv();

const { app } = require('../server');

const U = crypto.randomUUID().slice(0, 8);
let token;
let mapId;
let plant;
let prey;
let student;

const call = (name, args) => fx.callTool(app, token, name, args);

function ok(r) {
  assert.equal(r.isError, false, r.text);
  return r.data;
}

async function submitObservation(plantId) {
  const res = await execute(
    `INSERT INTO species_observations (observer_user_id, map_id, plant_id, observed_at, body, status)
     VALUES (?, ?, ?, CURRENT_DATE, 'Vu près de la mare', 'soumise')`,
    [student.id, mapId, plantId],
  );
  return res.insertId;
}

test.before(async () => {
  await initSchema();
  const admin = await fx.createAccount('admin');
  token = (await fx.obtainTokens(app, admin)).access_token;
  student = await fx.createAccount('eleve_novice', { userType: 'student' });
  mapId = (await fm.createMap({ id: `ob${U}` })).id;
  plant = await fm.createPlant({ name: `Héron ${U}` });
  prey = await fm.createPlant({ name: `Grenouille ${U}` });
});

test.after(async () => {
  await execute('DELETE FROM species_observations WHERE map_id = ?', [mapId]);
  await execute('DELETE FROM plants WHERE id IN (?, ?)', [plant.id, prey.id]);
  await execute('DELETE FROM maps WHERE id = ?', [mapId]);
  await fx.cleanupAccounts();
});

test.beforeEach(() => fx.enableMcpEnv());

test('file d’examen nominative, validation : registre confirmé et interaction prouvée', async () => {
  const obsId = await submitObservation(plant.id);
  const queue = ok(await call('foretmap_observations', { action: 'queue', map_id: mapId }));
  const item = queue.items.find((o) => o.id === obsId);
  assert.ok(item, 'observation dans la file');
  assert.ok(item.observer_name, 'file nominative : observateur présent');
  assert.equal(queue.counts.soumise >= 1, true);
  const one = ok(await call('foretmap_observations', { action: 'get', observation_id: obsId }));
  assert.equal(one.observation.text, 'Vu près de la mare');

  // Interaction du réseau dont l'observation devient la preuve.
  const inter = ok(
    await call('foretmap_food_web', {
      action: 'create',
      from_id: plant.id,
      to_id: prey.id,
      interaction_type: 'predation',
      evidence_level: 'bibliographie',
    }),
  );
  const cand = ok(
    await call('foretmap_observations', { action: 'evidence', observation_id: obsId }),
  );
  assert.ok(cand.items.some((c) => c.id === inter.id && c.attached === false));
  ok(
    await call('foretmap_observations', {
      action: 'evidence_write',
      observation_id: obsId,
      interaction_id: inter.id,
      op: 'attach',
    }),
  );

  const v = ok(
    await call('foretmap_observations', {
      action: 'validate',
      observation_id: obsId,
      note: 'Bien vu',
    }),
  );
  assert.equal(v.observation.status, 'validee');
  assert.equal(v.observation.observer_name, undefined, 'réponse sans identité');
  assert.equal(v.observation.observer_user_id, undefined);
  // Effet métier : présence confirmée sur le site et interaction observée.
  const reg = await queryOne(
    'SELECT validation_status, first_record_at FROM map_species WHERE map_id = ? AND plant_id = ?',
    [mapId, plant.id],
  );
  assert.equal(reg.validation_status, 'confirme_site');
  assert.ok(reg.first_record_at);
  const si = await queryOne('SELECT evidence_level FROM species_interactions WHERE id = ?', [
    inter.id,
  ]);
  assert.equal(si.evidence_level, 'observe_site');

  // Refus : le registre n'est pas touché.
  const other = await submitObservation(prey.id);
  const r = ok(
    await call('foretmap_observations', {
      action: 'reject',
      observation_id: other,
      note: 'Photo floue',
    }),
  );
  assert.equal(r.observation.status, 'refusee');
  assert.equal(
    await queryOne('SELECT 1 AS x FROM map_species WHERE map_id = ? AND plant_id = ?', [
      mapId,
      prey.id,
    ]),
    undefined,
  );

  const stats = ok(await call('foretmap_observations', { action: 'stats', map_id: mapId }));
  assert.equal(stats.total, 2);
  assert.equal(stats.validation_rate_percent, 50);
  assert.equal(stats.distinct_observers, '< 5', 'effectif faible masqué');
  assert.ok(stats.top_species.some((s) => s.plant_id === plant.id && s.validated === 1));
  await execute('DELETE FROM species_interactions WHERE id = ?', [inter.id]);
});

test('nominatif refusé sans bypass ; validation possible sans bypass', async () => {
  const obsId = await submitObservation(plant.id);
  process.env.MCP_PRIVACY_BYPASS = 'false';
  const q = await call('foretmap_observations', { action: 'queue', map_id: mapId });
  assert.equal(q.isError, true);
  assert.match(q.text, /bypass/);
  const g = await call('foretmap_observations', { action: 'get', observation_id: obsId });
  assert.equal(g.isError, true);
  const v = await call('foretmap_observations', { action: 'reject', observation_id: obsId });
  assert.equal(v.isError, false, v.text);
});

test('individus suivis : créer, lister, fiche, modifier, supprimer', async () => {
  const c = ok(
    await call('foretmap_observations', {
      action: 'individual_write',
      op: 'create',
      data: { plant_id: plant.id, map_id: mapId, label: `Chêne n°1 ${U}` },
    }),
  );
  const id = c.id ?? c.individual?.id;
  assert.ok(id, JSON.stringify(c));
  const list = ok(await call('foretmap_observations', { action: 'individuals', map_id: mapId }));
  assert.ok(list.items.some((i) => i.id === id));
  const up = ok(
    await call('foretmap_observations', {
      action: 'individual_write',
      op: 'update',
      individual_id: id,
      data: { label: `Chêne remarquable ${U}` },
    }),
  );
  assert.ok(up);
  const one = ok(await call('foretmap_observations', { action: 'individuals', individual_id: id }));
  assert.equal(one.label, `Chêne remarquable ${U}`);
  assert.ok(Array.isArray(one.measurements));
  ok(
    await call('foretmap_observations', {
      action: 'individual_write',
      op: 'delete',
      individual_id: id,
    }),
  );
  assert.equal(await queryOne('SELECT id FROM tracked_individuals WHERE id = ?', [id]), undefined);
});

test('domaine désactivé : outil absent et appel refusé', async () => {
  process.env.MCP_DOMAINS_DISABLED = 'observations';
  const tools = await fx.listTools(app, token);
  assert.ok(!tools.includes('foretmap_observations'));
  const r = await call('foretmap_observations', { action: 'stats' });
  assert.equal(r.isError, true);
});
