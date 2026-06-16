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

test('buildSpeciesUpsertParams aligne 28 paramètres', () => {
  const payload = buildSpeciesPayload({
    id: 'SP9999',
    biome_slug: 'sahara',
    type: 'faune',
    nom_commun: 'Test',
  });
  const params = buildSpeciesUpsertParams(payload);
  assert.strictEqual(params.length, 28);
  assert.strictEqual(params[0], 'SP9999');
});
