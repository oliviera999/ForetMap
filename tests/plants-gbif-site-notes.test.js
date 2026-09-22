'use strict';

require('./helpers/setup');
const { test } = require('node:test');
const assert = require('node:assert');
const { initSchema, queryOne, execute } = require('../database');
const { matchGbifSpeciesProposal } = require('../lib/gbifMatch');

test('migration 270 — colonnes GBIF et map_species.site_notes', async () => {
  await initSchema();
  const plantCols = await queryOne(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'plants'
        AND column_name IN (
          'accepted_scientific_name','gbif_accepted_key','taxon_phylum',
          'taxon_class','taxon_order','taxon_family_latin','gbif_checked_at'
        )`,
  );
  assert.strictEqual(Number(plantCols.c), 7);

  const msCols = await queryOne(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'map_species'
        AND column_name = 'site_notes'`,
  );
  assert.strictEqual(Number(msCols.c), 1);
});

test('gbifMatch — mappe une réponse match factice', async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({
      matchType: 'EXACT',
      confidence: 98,
      scientificName: 'Quercus ilex L.',
      canonicalName: 'Quercus ilex',
      kingdom: 'Plantae',
      phylum: 'Tracheophyta',
      class: 'Magnoliopsida',
      order: 'Fagales',
      family: 'Fagaceae',
      genus: 'Quercus',
      usageKey: 2878688,
      acceptedUsageKey: 2878688,
    }),
  });
  const out = await matchGbifSpeciesProposal('Quercus ilex', {
    fetchImpl: fakeFetch,
    timeoutMs: 2000,
  });
  assert.strictEqual(out.matchType, 'EXACT');
  assert.strictEqual(out.proposal.taxon_family_latin, 'Fagaceae');
  assert.strictEqual(out.proposal.gbif_key, 2878688);
  assert.ok(out.gbif_page.includes('2878688'));
});

test('syncPlantMaps préserve site_notes', async () => {
  await initSchema();
  const { syncPlantMaps, upsertMapSpeciesSiteNotes } = require('../lib/speciesJunction');
  const { queryAll, execute: exec, withTransaction } = require('../database');
  const db = {
    queryAll,
    queryOne,
    execute: exec,
    withTransaction,
  };

  await exec(`INSERT INTO plants (name, emoji, description) VALUES ('Test GBIF lot3', '🌱', 'x')`);
  const plant = await queryOne(`SELECT id FROM plants WHERE name = 'Test GBIF lot3' LIMIT 1`);
  const plantId = plant.id;

  const maps = await queryAll('SELECT id FROM maps LIMIT 1');
  if (!maps.length) {
    await exec(
      `INSERT INTO maps (id, label, sort_order) VALUES ('foret', 'Forêt', 0)
       ON DUPLICATE KEY UPDATE label = VALUES(label)`,
    );
  }
  const mapId = String((await queryOne('SELECT id FROM maps LIMIT 1')).id);

  await upsertMapSpeciesSiteNotes(db, plantId, mapId, 'Note de test lot 3');
  await syncPlantMaps(db, plantId, [mapId]);
  const row = await queryOne(
    'SELECT site_notes FROM map_species WHERE plant_id = ? AND map_id = ?',
    [plantId, mapId],
  );
  assert.strictEqual(String(row.site_notes), 'Note de test lot 3');
  await exec('DELETE FROM map_species WHERE plant_id = ?', [plantId]);
  await exec('DELETE FROM plants WHERE id = ?', [plantId]);
});
