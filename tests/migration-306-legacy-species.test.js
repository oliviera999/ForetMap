'use strict';

// Migration 306 : les anciens noms mono-espèce (`map_markers.plant_name`,
// `zones.current_plant`) rejoignent les jonctions d'espèces avant que le code cesse de les lire
// (piste C, audit du 25/09/2026, § 3.5). Tests BDD partagée : exécution séquentielle.
// La migration est rejouée par `pool.query` (protocole texte), avec le découpage du runner.

require('./helpers/setup');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initSchema, execute, queryAll, pool, splitSqlStatements } = require('../database');
const fx = require('./helpers/fmFixtures');

const MIGRATION_306 = path.join(
  __dirname,
  '..',
  'migrations',
  '306_legacy_single_species_to_junctions.sql',
);

async function runMigration306() {
  const sql = fs.readFileSync(MIGRATION_306, 'utf8');
  for (const stmt of splitSqlStatements(sql)) await pool.query(stmt);
}

const stamp = Date.now().toString(36);
const names = {
  unique: `Achillée carac ${stamp}`,
  duplicate: `Doublon carac ${stamp}`,
  accent: `Mûre carac ${stamp}`,
};
const plants = {};
const markers = {};
let zoneId;

async function insertMarker(plantName) {
  const marker = await fx.createMarker({ label: `Repère 306 ${plantName || 'vide'}` });
  await execute('UPDATE map_markers SET plant_name = ? WHERE id = ?', [plantName, marker.id]);
  return marker.id;
}

async function markerSpecies(markerId) {
  const rows = await queryAll(
    'SELECT plant_id FROM marker_species WHERE marker_id = ? ORDER BY plant_id',
    [markerId],
  );
  return rows.map((row) => Number(row.plant_id));
}

before(async () => {
  await initSchema();
  plants.unique = await fx.createPlant({ name: names.unique });
  plants.duplicateA = await fx.createPlant({ name: names.duplicate });
  plants.duplicateB = await fx.createPlant({ name: names.duplicate.toUpperCase() });
  plants.accent = await fx.createPlant({ name: names.accent });
  // Espaces et casse différents du nom de fiche : rattaché.
  markers.normalized = await insertMarker(`  ${names.unique.toUpperCase().replace(/ /g, '   ')} `);
  // Nom porté par deux fiches (après normalisation) : ambigu, laissé de côté.
  markers.ambiguous = await insertMarker(names.duplicate);
  // Accent manquant : ne correspond pas (comparaison binaire après normalisation).
  markers.accentless = await insertMarker(names.accent.replace('û', 'u'));
  // Nom inconnu du catalogue.
  markers.unknown = await insertMarker(`Espèce inconnue ${stamp}`);
  // Déjà rattaché : aucun doublon.
  markers.alreadyLinked = await insertMarker(names.unique);
  await execute('INSERT INTO marker_species (marker_id, plant_id) VALUES (?, ?)', [
    markers.alreadyLinked,
    plants.unique.id,
  ]);
  const zone = await fx.createZone({ name: `Zone 306 ${stamp}` });
  zoneId = zone.id;
  await execute('UPDATE zones SET current_plant = ? WHERE id = ?', [
    names.unique.toLowerCase(),
    zoneId,
  ]);
});

after(async () => {
  await execute(
    `DELETE FROM map_markers WHERE id IN (${Object.values(markers)
      .map(() => '?')
      .join(', ')})`,
    Object.values(markers),
  );
  await execute('DELETE FROM zones WHERE id = ?', [zoneId]);
  await execute(
    `DELETE FROM plants WHERE id IN (${Object.values(plants)
      .map(() => '?')
      .join(', ')})`,
    Object.values(plants).map((p) => p.id),
  );
});

test('306 : un nom hérité identifiable sans ambiguïté rejoint la jonction', async () => {
  await runMigration306();
  assert.deepEqual(await markerSpecies(markers.normalized), [plants.unique.id]);
  const zoneRows = await queryAll('SELECT plant_id FROM zone_species WHERE zone_id = ?', [zoneId]);
  assert.deepEqual(
    zoneRows.map((row) => Number(row.plant_id)),
    [plants.unique.id],
  );
});

test('306 : nom ambigu, sans accent ou inconnu → aucun rattachement', async () => {
  await runMigration306();
  assert.deepEqual(await markerSpecies(markers.ambiguous), []);
  assert.deepEqual(await markerSpecies(markers.accentless), []);
  assert.deepEqual(await markerSpecies(markers.unknown), []);
});

test('306 : idempotente, et rien n’est effacé', async () => {
  await runMigration306();
  await runMigration306();
  assert.deepEqual(await markerSpecies(markers.alreadyLinked), [plants.unique.id]);
  assert.deepEqual(await markerSpecies(markers.normalized), [plants.unique.id]);
  const kept = await queryAll('SELECT plant_name FROM map_markers WHERE id = ?', [
    markers.normalized,
  ]);
  assert.match(kept[0].plant_name, /ACHILLÉE/);
  const zone = await queryAll('SELECT current_plant FROM zones WHERE id = ?', [zoneId]);
  assert.equal(zone[0].current_plant, names.unique.toLowerCase());
});
