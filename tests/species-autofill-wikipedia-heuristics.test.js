require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractTraitsFromWikipediaExtract,
  buildWikipediaHeuristicSource,
} = require('../lib/speciesAutofillWikipediaHeuristics');

test('extractTraitsFromWikipediaExtract détecte température et pH', () => {
  const t = 'Culture au potager, idéal 18-24 °C, pH 6,0-7,0, plante annuelle.';
  const { fields, warnings } = extractTraitsFromWikipediaExtract(t);
  assert.match(fields.ideal_temperature_c, /18/);
  assert.match(fields.ideal_temperature_c, /24/);
  assert.match(fields.optimal_ph, /6/);
  assert.match(fields.optimal_ph, /7/);
  assert.equal(fields.longevity, 'Annuelle');
  assert.ok(warnings.length >= 1);
});

test('extractTraitsFromWikipediaExtract détecte taille en cm', () => {
  const { fields } = extractTraitsFromWikipediaExtract('Port buissonnant, 30 à 80 cm de haut.');
  assert.match(fields.size, /30/);
  assert.match(fields.size, /80/);
});

test('buildWikipediaHeuristicSource retourne null si rien à extraire', () => {
  assert.equal(buildWikipediaHeuristicSource('Courte.'), null);
  assert.equal(buildWikipediaHeuristicSource(''), null);
});

test('extractTraitsFromWikipediaExtract détecte récolte et culture', () => {
  const { fields } = extractTraitsFromWikipediaExtract(
    'Les fruits comestibles mûrissent en été. Culture au potager en plein soleil, semis au printemps.',
  );
  assert.ok(fields.harvest_part);
  assert.ok(fields.planting_recommendations);
  assert.equal(fields.agroecosystem_category, 'Culture (indice résumé Wikipedia)');
});
