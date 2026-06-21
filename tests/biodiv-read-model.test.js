'use strict';

require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const {
  parsePhRangeText,
  parseTempRangeText,
  resolvePlantTaxonomy,
  resolvePlantPhRange,
  resolvePlantTempRange,
  enrichPlantRow,
} = require('../lib/biodivReadModel');

test('parsePhRangeText — intervalle et valeur unique', () => {
  assert.deepStrictEqual(parsePhRangeText('6,0-7,5'), { min: 6, max: 7.5 });
  assert.deepStrictEqual(parsePhRangeText('6.5'), { min: 6.5, max: 6.5 });
  assert.strictEqual(parsePhRangeText(''), null);
});

test('parseTempRangeText — intervalle et valeur unique', () => {
  assert.deepStrictEqual(parseTempRangeText('15-25 °C'), { min: 15, max: 25 });
  assert.deepStrictEqual(parseTempRangeText('20'), { min: 20, max: 20 });
  assert.strictEqual(parseTempRangeText('abc'), null);
});

test('resolvePlantTaxonomy — taxon_* normalisé', () => {
  const taxonomy = resolvePlantTaxonomy({
    taxon_kingdom: 'Animal',
    taxon_group: 'Arbre',
    taxon_family: 'Rosaceae',
    taxon_genus: 'Malus',
    scientific_name: 'Malus domestica',
    gbif_key: 3001234,
  });
  assert.strictEqual(taxonomy.kingdom, 'Animal');
  assert.strictEqual(taxonomy.group, 'Arbre');
  assert.strictEqual(taxonomy.family, 'Rosaceae');
  assert.strictEqual(taxonomy.genus, 'Malus');
  assert.strictEqual(taxonomy.scientificName, 'Malus domestica');
  assert.strictEqual(taxonomy.gbifKey, 3001234);

  const empty = resolvePlantTaxonomy({});
  assert.strictEqual(empty.kingdom, null);
  assert.strictEqual(empty.group, null);
});

test('resolvePlantPhRange — colonnes numériques uniquement', () => {
  assert.deepStrictEqual(resolvePlantPhRange({ ph_min: 5.5, ph_max: 7.0 }), {
    min: 5.5,
    max: 7,
    source: 'columns',
  });
  assert.strictEqual(resolvePlantPhRange({ optimal_ph: '6,0-7,5' }), null);
});

test('resolvePlantTempRange — colonnes numériques uniquement', () => {
  assert.deepStrictEqual(resolvePlantTempRange({ temp_min_c: 10, temp_max_c: 25 }), {
    min: 10,
    max: 25,
    source: 'columns',
  });
  assert.strictEqual(resolvePlantTempRange({ ideal_temperature_c: '15-20' }), null);
});

test('enrichPlantRow — ajoute taxonomy, phRange et tempRange', () => {
  const enriched = enrichPlantRow({
    id: 1,
    name: 'Menthe',
    taxon_kingdom: 'Plante',
    ph_min: 6,
    ph_max: 7,
    temp_min_c: 12,
    temp_max_c: 22,
  });
  assert.strictEqual(enriched.name, 'Menthe');
  assert.ok(enriched.taxonomy);
  assert.ok(enriched.phRange);
  assert.ok(enriched.tempRange);
});
