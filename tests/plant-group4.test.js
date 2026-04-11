'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  extractGenusFromScientificName,
  applyDerivedGroup4IfEmpty,
} = require('../lib/plantGroup4');

test('extractGenusFromScientificName binôme courant', () => {
  assert.strictEqual(extractGenusFromScientificName('Carassius auratus'), 'Carassius');
  assert.strictEqual(extractGenusFromScientificName('  Ocimum basilicum  '), 'Ocimum');
});

test('extractGenusFromScientificName hybride ×', () => {
  assert.strictEqual(extractGenusFromScientificName('× Dactylorhiza majalis'), 'Dactylorhiza');
});

test('applyDerivedGroup4IfEmpty végétal reprend group_3', () => {
  const p = { group_1: 'Végétal (Chlorobiontes)', group_3: 'Solanacées', group_4: null };
  applyDerivedGroup4IfEmpty(p);
  assert.strictEqual(p.group_4, 'Solanacées');
});

test('applyDerivedGroup4IfEmpty animal reprend genre', () => {
  const p = {
    group_1: 'Animal (Métazoaires)',
    scientific_name: 'Lasius niger',
    group_4: null,
  };
  applyDerivedGroup4IfEmpty(p);
  assert.strictEqual(p.group_4, 'Lasius');
});

test('applyDerivedGroup4IfEmpty ne remplace pas une valeur fournie', () => {
  const p = {
    group_1: 'Végétal (Chlorobiontes)',
    group_3: 'Solanacées',
    group_4: 'Surcouche manuelle',
  };
  applyDerivedGroup4IfEmpty(p);
  assert.strictEqual(p.group_4, 'Surcouche manuelle');
});
