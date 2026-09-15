'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const assert = require('node:assert');
const {
  parseSpeciesWorkbook,
  buildSpeciesPayload,
  validateSpeciesPayload,
  parseBiomeStatsRows,
  buildSpeciesUpsertParams,
} = require('../lib/glSpeciesImport');

const XLSX_PATH = path.join(
  __dirname,
  '..',
  'data',
  'gl',
  'especes-biomes-gnomes-et-licornes.xlsx',
);

test('parseSpeciesWorkbook lit le fichier de référence', async () => {
  const buffer = fs.readFileSync(XLSX_PATH);
  const { speciesRows, biomeRows } = await parseSpeciesWorkbook(buffer);
  assert.ok(speciesRows.length >= 250);
  assert.ok(biomeRows.length >= 11);
  const first = buildSpeciesPayload(speciesRows[0]);
  assert.ok(first.species_code);
  assert.ok(first.biome_slug);
  assert.ok(['faune', 'flore'].includes(first.type));
  assert.ok(first.nom_commun);
});

test('parseBiomeStatsRows ignore la ligne TOTAL', () => {
  const rows = parseBiomeStatsRows([
    { biome_slug: 'sahara', biome_nom: 'Désert' },
    { biome_slug: '', biome_nom: 'TOTAL' },
  ]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].slug, 'sahara');
});

test('validateSpeciesPayload signale les champs manquants', () => {
  const errors = validateSpeciesPayload(buildSpeciesPayload({}), 2);
  assert.ok(errors.some((e) => e.field === 'species_code'));
  assert.ok(errors.some((e) => e.field === 'nom_commun'));
});

test('buildSpeciesUpsertParams aligne 31 paramètres', () => {
  const payload = buildSpeciesPayload({
    id: 'SP9999',
    biome_slug: 'sahara',
    type: 'faune',
    nom_commun: 'Test',
    taxon_rank: 'genus',
  });
  const params = buildSpeciesUpsertParams(payload);
  assert.strictEqual(params.length, 31);
  assert.strictEqual(params[0], 'SP9999');
  assert.strictEqual(params[5], 'genus');
});

test('buildSpeciesPayload normalise taxon_rank breed et alias race', () => {
  const breed = buildSpeciesPayload({
    id: 'SP9001',
    biome_slug: 'mediterranee',
    type: 'faune',
    nom_commun: 'Mouton Sardi',
    taxon_rank: 'breed',
  });
  assert.strictEqual(breed.taxon_rank, 'breed');

  const fromRace = buildSpeciesPayload({
    id: 'SP9002',
    biome_slug: 'mediterranee',
    type: 'faune',
    nom_commun: 'Mouton Sardi',
    taxon_rank: 'race',
  });
  assert.strictEqual(fromRace.taxon_rank, 'breed');

  const fromRaces = buildSpeciesPayload({
    id: 'SP9003',
    biome_slug: 'mediterranee',
    type: 'faune',
    nom_commun: 'Mouton Sardi',
    taxon_rank: 'Races',
  });
  assert.strictEqual(fromRaces.taxon_rank, 'breed');

  const unknown = buildSpeciesPayload({
    id: 'SP9004',
    biome_slug: 'mediterranee',
    type: 'faune',
    nom_commun: 'Test',
    taxon_rank: 'subspecies',
  });
  assert.strictEqual(unknown.taxon_rank, null);
});
