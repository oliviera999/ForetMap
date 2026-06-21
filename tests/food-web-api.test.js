'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { initSchema, execute, queryOne } = require('../database');
const { app } = require('../server');

const stamp = Date.now();
let plantFromId = 0;
let plantToId = 0;
let interactionId = 0;
let glossaryCode = '';

test.before(async () => {
  await initSchema();

  const fromRes = await execute('INSERT INTO plants (name, emoji) VALUES (?, ?)', [
    `FW From ${stamp}`,
    '🌿',
  ]);
  const toRes = await execute('INSERT INTO plants (name, emoji) VALUES (?, ?)', [
    `FW To ${stamp}`,
    '🐝',
  ]);
  plantFromId = fromRes.insertId;
  plantToId = toRes.insertId;

  const interRes = await execute(
    `INSERT INTO species_interactions (from_plant_id, to_plant_id, interaction_type, description)
     VALUES (?, ?, 'pollinisation', ?)`,
    [plantFromId, plantToId, 'Test pollinisation'],
  );
  interactionId = interRes.insertId;

  glossaryCode = `FW${String(stamp).slice(-4)}`;
  await execute(
    `INSERT INTO glossary_terms (
      glossary_code, terme, variantes, categorie, niveau, definition_courte, statut, created_at, updated_at
    ) VALUES (?, 'Pollinisation test', '', 'ecologie', 'base', 'Transport du pollen', 'actif', NOW(), NOW())`,
    [glossaryCode],
  );
  await execute(
    'INSERT INTO glossary_term_interactions (glossary_code, interaction_id) VALUES (?, ?)',
    [glossaryCode, interactionId],
  );
});

test('GET /api/food-web — liste publique', async () => {
  const res = await request(app).get('/api/food-web').expect(200);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.some((row) => Number(row.id) === interactionId));
  const row = res.body.items.find((item) => Number(item.id) === interactionId);
  assert.strictEqual(row.interaction_type, 'pollinisation');
  assert.strictEqual(Number(row.from_id), plantFromId);
  assert.strictEqual(Number(row.to_id), plantToId);
});

test('GET /api/food-web?zoneId= — zone inconnue 404', async () => {
  await request(app).get('/api/food-web?zoneId=zone-inexistante').expect(404);
});

test('GET /api/food-web/interactions/:id/glossary — termes liés', async () => {
  const res = await request(app)
    .get(`/api/food-web/interactions/${interactionId}/glossary`)
    .expect(200);
  assert.strictEqual(res.body.interactionId, interactionId);
  assert.ok(Array.isArray(res.body.terms));
  assert.ok(res.body.terms.some((t) => t.glossary_code === glossaryCode));
});

test('GET /api/food-web/interactions/:id/glossary — interaction inconnue 404', async () => {
  await request(app).get('/api/food-web/interactions/999999999/glossary').expect(404);
});

test('GET /api/food-web?zoneId= — filtre par zone avec junction', async () => {
  const zoneId = `fw-zone-${stamp}`;
  await execute(
    `INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color)
     VALUES (?, 'foret', ?, 0, 0, 0, 0, '', 'empty', 0, 'rect', ?, '#86efac80')`,
    [
      zoneId,
      `Zone FW ${stamp}`,
      JSON.stringify([
        { xp: 10, yp: 10 },
        { xp: 20, yp: 10 },
        { xp: 15, yp: 20 },
      ]),
    ],
  );
  await execute('INSERT INTO zone_species (zone_id, plant_id) VALUES (?, ?), (?, ?)', [
    zoneId,
    plantFromId,
    zoneId,
    plantToId,
  ]);

  const res = await request(app)
    .get(`/api/food-web?zoneId=${encodeURIComponent(zoneId)}`)
    .expect(200);
  assert.strictEqual(res.body.zoneId, zoneId);
  assert.ok(Array.isArray(res.body.items));
  assert.ok(res.body.items.some((row) => Number(row.id) === interactionId));

  const zone = await queryOne('SELECT id FROM zones WHERE id = ?', [zoneId]);
  assert.ok(zone);
});
