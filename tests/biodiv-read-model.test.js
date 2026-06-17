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

test('resolvePlantTaxonomy — taxon_* avec repli group_*', () => {
  const taxonomy = resolvePlantTaxonomy({
    taxon_kingdom: 'Animal',
    group_1: 'Plante',
    group_2: 'Arbre',
    group_3: 'Rosaceae',
    group_4: 'Malus',
    scientific_name: 'Malus domestica',
    gbif_key: 3001234,
  });
  assert.strictEqual(taxonomy.kingdom, 'Animal');
  assert.strictEqual(taxonomy.group, 'Arbre');
  assert.strictEqual(taxonomy.family, 'Rosaceae');
  assert.strictEqual(taxonomy.genus, 'Malus');
  assert.strictEqual(taxonomy.scientificName, 'Malus domestica');
  assert.strictEqual(taxonomy.gbifKey, 3001234);

  const fallback = resolvePlantTaxonomy({
    group_1: 'Plante',
    group_2: 'Arbre',
    group_3: 'Rosaceae',
    group_4: 'Malus',
  });
  assert.strictEqual(fallback.kingdom, 'Plante');
  assert.strictEqual(fallback.group, 'Arbre');
});

test('resolvePlantPhRange — colonnes puis optimal_ph', () => {
  assert.deepStrictEqual(resolvePlantPhRange({ ph_min: 5.5, ph_max: 7.0 }), {
    min: 5.5,
    max: 7,
    source: 'columns',
  });
  assert.deepStrictEqual(resolvePlantPhRange({ optimal_ph: '6,0-7,5' }), {
    min: 6,
    max: 7.5,
    source: 'optimal_ph',
  });
});

test('resolvePlantTempRange — colonnes puis ideal_temperature_c', () => {
  assert.deepStrictEqual(resolvePlantTempRange({ temp_min_c: 10, temp_max_c: 25 }), {
    min: 10,
    max: 25,
    source: 'columns',
  });
  assert.deepStrictEqual(resolvePlantTempRange({ ideal_temperature_c: '15-20' }), {
    min: 15,
    max: 20,
    source: 'ideal_temperature_c',
  });
});

test('enrichPlantRow — ajoute taxonomy, phRange et tempRange', () => {
  const enriched = enrichPlantRow({
    id: 1,
    name: 'Menthe',
    group_1: 'Plante',
    optimal_ph: '6-7',
    ideal_temperature_c: '12-22',
  });
  assert.strictEqual(enriched.name, 'Menthe');
  assert.ok(enriched.taxonomy);
  assert.ok(enriched.phRange);
  assert.ok(enriched.tempRange);
});
