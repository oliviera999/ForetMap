'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { extractGenusFromScientificName, applyDerivedGroup4IfEmpty } = require('../lib/plantGroup4');

test('extractGenusFromScientificName binôme courant', () => {
  assert.strictEqual(extractGenusFromScientificName('Carassius auratus'), 'Carassius');
  assert.strictEqual(extractGenusFromScientificName('  Ocimum basilicum  '), 'Ocimum');
});

test('extractGenusFromScientificName hybride ×', () => {
  assert.strictEqual(extractGenusFromScientificName('× Dactylorhiza majalis'), 'Dactylorhiza');
});

test('applyDerivedGroup4IfEmpty végétal reprend taxon_family', () => {
  const p = {
    taxon_kingdom: 'Végétal (Chlorobiontes)',
    taxon_family: 'Solanacées',
    taxon_genus: null,
  };
  applyDerivedGroup4IfEmpty(p);
  assert.strictEqual(p.taxon_genus, 'Solanacées');
});

test('applyDerivedGroup4IfEmpty animal reprend genre', () => {
  const p = {
    taxon_kingdom: 'Animal (Métazoaires)',
    scientific_name: 'Lasius niger',
    taxon_genus: null,
  };
  applyDerivedGroup4IfEmpty(p);
  assert.strictEqual(p.taxon_genus, 'Lasius');
});

test('applyDerivedGroup4IfEmpty ne remplace pas une valeur fournie', () => {
  const p = {
    taxon_kingdom: 'Végétal (Chlorobiontes)',
    taxon_family: 'Solanacées',
    taxon_genus: 'Surcouche manuelle',
  };
  applyDerivedGroup4IfEmpty(p);
  assert.strictEqual(p.taxon_genus, 'Surcouche manuelle');
});
