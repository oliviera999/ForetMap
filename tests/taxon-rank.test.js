'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { TAXON_RANK_VALUES, TAXON_RANK_ALIASES, normalizeTaxonRank } = require('../lib/taxonRank');

test('TAXON_RANK_VALUES inclut breed', () => {
  assert.deepStrictEqual([...TAXON_RANK_VALUES], ['species', 'genus', 'family', 'clade', 'breed']);
});

test('normalizeTaxonRank accepte les clés canoniques', () => {
  assert.strictEqual(normalizeTaxonRank('species'), 'species');
  assert.strictEqual(normalizeTaxonRank('Genus'), 'genus');
  assert.strictEqual(normalizeTaxonRank(' FAMILY '), 'family');
  assert.strictEqual(normalizeTaxonRank('clade'), 'clade');
  assert.strictEqual(normalizeTaxonRank('breed'), 'breed');
});

test('normalizeTaxonRank mappe les alias race / races → breed', () => {
  assert.strictEqual(normalizeTaxonRank('race'), 'breed');
  assert.strictEqual(normalizeTaxonRank('Race'), 'breed');
  assert.strictEqual(normalizeTaxonRank('races'), 'breed');
  assert.strictEqual(TAXON_RANK_ALIASES.race, 'breed');
  assert.strictEqual(TAXON_RANK_ALIASES.races, 'breed');
});

test('normalizeTaxonRank rejette le vide et l’inconnu', () => {
  assert.strictEqual(normalizeTaxonRank(null), null);
  assert.strictEqual(normalizeTaxonRank(''), null);
  assert.strictEqual(normalizeTaxonRank('  '), null);
  assert.strictEqual(normalizeTaxonRank('subspecies'), null);
  assert.strictEqual(normalizeTaxonRank('variété'), null);
});
