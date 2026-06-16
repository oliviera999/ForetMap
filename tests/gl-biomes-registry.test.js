require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const {
  resolveBiome,
  normalizeLoreBiomeSlug,
  biomeAssetSlug,
  listCanonicalBiomeSlugs,
} = require('../lib/glBiomesRegistry');

test('resolveBiome replie alias narratifs et tirets', () => {
  assert.strictEqual(resolveBiome('jungle')?.slugCanonique, 'jungle_afc');
  assert.strictEqual(resolveBiome('caduc')?.slugCanonique, 'foret_caducifoliee');
  assert.strictEqual(resolveBiome('foret-caducifoliee')?.slugCanonique, 'foret_caducifoliee');
  assert.strictEqual(resolveBiome('toundra-hiver')?.slugCanonique, 'toundra');
});

test('normalizeLoreBiomeSlug aligné registre', () => {
  assert.strictEqual(normalizeLoreBiomeSlug('jungle'), 'jungle_afc');
  assert.strictEqual(normalizeLoreBiomeSlug('toundra (été / hiver polaire)'), 'toundra');
});

test('biomeAssetSlug expose slugs conventionnels (prod)', () => {
  assert.strictEqual(biomeAssetSlug('savane', 'biocenose'), 'biocenose_savane');
  assert.strictEqual(biomeAssetSlug('jungle', 'biome'), 'biome_jungle');
  assert.strictEqual(biomeAssetSlug('toundra', 'biome', 'hiver'), 'biome-realiste_toundra-hiver');
  assert.strictEqual(
    biomeAssetSlug('toundra', 'biocenose', 'ete'),
    'biocenose_toundra-ete_legendee',
  );
});

test('11 biomes canoniques', () => {
  assert.strictEqual(listCanonicalBiomeSlugs().length, 11);
});
