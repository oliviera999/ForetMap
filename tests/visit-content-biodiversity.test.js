require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { initDatabase, initSchema, execute, queryOne } = require('../database');
const { app } = require('../server');
const request = require('supertest');

/**
 * Biodiversité des lieux dans le contenu **public** de visite.
 *
 * Jusqu'ici le volet « Biodiversité » du panneau de visite se reconstruisait côté client
 * depuis `GET /api/zones` + `GET /api/markers` (routes authentifiées) : un visiteur invité
 * n'avait donc aucune espèce, alors que la visite est justement le mode grand public.
 * `GET /api/visit/content` publie désormais `species`, `species_ids` et
 * `living_beings_list` par zone et par repère, plus `is_infrastructure` sur les zones
 * (le volet biodiversité ignore les lieux d'infrastructure, comme sur la carte).
 */

const MAP_ID = 'foret';
const suffix = crypto.randomUUID().slice(0, 8);
const ZONE_ID = `vbio-zone-${suffix}`;
const INFRA_ZONE_ID = `vbio-infra-${suffix}`;
const MARKER_ID = `vbio-marker-${suffix}`;
const CATEGORY_ID = `vbio-cat-${suffix}`;
const PLANT_NAME = `Consoude de test ${suffix}`;
const MARKER_PLANT_NAME = `Ortie de test ${suffix}`;

let plantId = 0;
let markerPlantId = 0;

async function insertPlant(name, emoji) {
  const res = await execute('INSERT INTO plants (name, emoji, description) VALUES (?, ?, ?)', [
    name,
    emoji,
    'Espèce créée par les tests de biodiversité de visite.',
  ]);
  return res.insertId;
}

test.before(async () => {
  await initSchema();
  await initDatabase();

  plantId = await insertPlant(PLANT_NAME, '🌿');
  markerPlantId = await insertPlant(MARKER_PLANT_NAME, '🍃');

  // Zone de carte + son pendant visite (même identifiant : c'est ce que fait l'import visite).
  for (const [zoneId, zoneName] of [
    [ZONE_ID, `Zone biodiv ${suffix}`],
    [INFRA_ZONE_ID, `Local technique ${suffix}`],
  ]) {
    await execute('INSERT INTO zones (id, map_id, name, shape, points) VALUES (?, ?, ?, ?, ?)', [
      zoneId,
      MAP_ID,
      zoneName,
      'poly',
      JSON.stringify([
        { xp: 10, yp: 10 },
        { xp: 20, yp: 10 },
        { xp: 20, yp: 20 },
      ]),
    ]);
    await execute(
      `INSERT INTO visit_zones (id, map_id, name, points, short_description, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        zoneId,
        MAP_ID,
        zoneName,
        JSON.stringify([
          { xp: 10, yp: 10 },
          { xp: 20, yp: 10 },
          { xp: 20, yp: 20 },
        ]),
        'Texte de visite.',
      ],
    );
    await execute('INSERT INTO zone_species (zone_id, plant_id) VALUES (?, ?)', [zoneId, plantId]);
  }

  // Catégorie d'infrastructure affectée à la seconde zone.
  await execute(
    `INSERT INTO location_categories (id, map_id, slug, label, applies_to, is_infrastructure, is_active)
     VALUES (?, NULL, ?, ?, 'both', 1, 1)`,
    [CATEGORY_ID, `vbio-infra-${suffix}`, 'Infrastructure de test'],
  );
  await execute('INSERT INTO zone_categories (zone_id, category_id) VALUES (?, ?)', [
    INFRA_ZONE_ID,
    CATEGORY_ID,
  ]);

  // Repère de carte + son pendant visite, espèce portée par la seule jonction.
  await execute(
    'INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, emoji) VALUES (?, ?, ?, ?, ?, ?)',
    [MARKER_ID, MAP_ID, 42, 42, `Repère biodiv ${suffix}`, '🌳'],
  );
  await execute(
    `INSERT INTO visit_markers (id, map_id, x_pct, y_pct, label, short_description, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [MARKER_ID, MAP_ID, 42, 42, `Repère biodiv ${suffix}`, 'Texte de visite du repère.'],
  );
  await execute('INSERT INTO marker_species (marker_id, plant_id) VALUES (?, ?)', [
    MARKER_ID,
    markerPlantId,
  ]);
});

test.after(async () => {
  await execute('DELETE FROM visit_markers WHERE id = ?', [MARKER_ID]);
  await execute('DELETE FROM map_markers WHERE id = ?', [MARKER_ID]);
  await execute('DELETE FROM visit_zones WHERE id IN (?, ?)', [ZONE_ID, INFRA_ZONE_ID]);
  await execute('DELETE FROM zones WHERE id IN (?, ?)', [ZONE_ID, INFRA_ZONE_ID]);
  await execute('DELETE FROM location_categories WHERE id = ?', [CATEGORY_ID]);
  await execute('DELETE FROM plants WHERE id IN (?, ?)', [plantId, markerPlantId]);
});

test('GET /api/visit/content — espèces de la zone exposées sans authentification', async () => {
  const res = await request(app).get(`/api/visit/content?map_id=${MAP_ID}`).expect(200);
  const zone = (res.body.zones || []).find((z) => z.id === ZONE_ID);
  assert.ok(zone, 'zone de visite attendue dans le contenu public');
  assert.deepStrictEqual(zone.living_beings_list, [PLANT_NAME]);
  assert.deepStrictEqual(zone.species_ids, [plantId]);
  assert.deepStrictEqual(zone.species, [{ id: plantId, name: PLANT_NAME, emoji: '🌿' }]);
  assert.strictEqual(zone.is_infrastructure, false);
});

test('GET /api/visit/content — espèces du repère exposées sans authentification', async () => {
  const res = await request(app).get(`/api/visit/content?map_id=${MAP_ID}`).expect(200);
  const marker = (res.body.markers || []).find((m) => m.id === MARKER_ID);
  assert.ok(marker, 'repère de visite attendu dans le contenu public');
  assert.deepStrictEqual(marker.living_beings_list, [MARKER_PLANT_NAME]);
  assert.deepStrictEqual(marker.species_ids, [markerPlantId]);
  assert.deepStrictEqual(marker.species, [
    { id: markerPlantId, name: MARKER_PLANT_NAME, emoji: '🍃' },
  ]);
});

test('GET /api/visit/content — zone d’infrastructure signalée (volet biodiversité masqué côté client)', async () => {
  const res = await request(app).get(`/api/visit/content?map_id=${MAP_ID}`).expect(200);
  const infraZone = (res.body.zones || []).find((z) => z.id === INFRA_ZONE_ID);
  assert.ok(infraZone, 'zone d’infrastructure attendue dans le contenu public');
  assert.strictEqual(infraZone.is_infrastructure, true);
});

test('GET /api/visit/content — aucun champ legacy mono-espèce republié', async () => {
  // `zones.current_plant` / `map_markers.plant_name` ne servent que de repli : la charge
  // publique n'expose que la liste normalisée.
  await execute('UPDATE zones SET current_plant = ? WHERE id = ?', ['Nom legacy', ZONE_ID]);
  const res = await request(app).get(`/api/visit/content?map_id=${MAP_ID}`).expect(200);
  const zone = (res.body.zones || []).find((z) => z.id === ZONE_ID);
  assert.ok(zone);
  assert.ok(!('current_plant' in zone), 'current_plant ne doit pas être republié');
  assert.ok(!('living_beings' in zone), 'la colonne JSON legacy n’existe plus');
  const marker = (res.body.markers || []).find((m) => m.id === MARKER_ID);
  assert.ok(!('plant_name' in marker), 'plant_name ne doit pas être republié');
});

test('GET /api/visit/content — repli sur le nom legacy quand la jonction est vide', async () => {
  await execute('DELETE FROM zone_species WHERE zone_id = ?', [ZONE_ID]);
  await execute('UPDATE zones SET current_plant = ? WHERE id = ?', [PLANT_NAME, ZONE_ID]);
  const res = await request(app).get(`/api/visit/content?map_id=${MAP_ID}`).expect(200);
  const zone = (res.body.zones || []).find((z) => z.id === ZONE_ID);
  assert.deepStrictEqual(zone.living_beings_list, [PLANT_NAME]);
  assert.deepStrictEqual(zone.species, []);
  // Remise en état pour les autres fichiers de test (la zone est supprimée en after).
  const stillThere = await queryOne('SELECT id FROM zones WHERE id = ? LIMIT 1', [ZONE_ID]);
  assert.ok(stillThere);
});
