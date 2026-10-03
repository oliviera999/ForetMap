require('./helpers/setup');
const test = require('node:test');
const assert = require('node:assert');
const {
  GL_BIOME_REGISTRY,
  resolveBiome,
  normalizeLoreBiomeSlug,
  normalizeSousBiomeSlug,
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

test('plateau du registre = plateau de jeu réel (année en 4 plateaux)', () => {
  const plateauOf = Object.fromEntries(GL_BIOME_REGISTRY.map((b) => [b.slugCanonique, b.plateau]));
  assert.deepStrictEqual(plateauOf, {
    sahara: 2,
    jungle_afc: 1,
    mangrove: null,
    savane: 1,
    foret_mediterraneenne: 2,
    landes: 3,
    foret_caducifoliee: 3,
    prairie_steppe: null,
    taiga: 4,
    toundra: 4,
    desert_froid: null,
  });
  for (const biome of GL_BIOME_REGISTRY) {
    if (biome.plateau == null) {
      assert.strictEqual(biome.assets.board, null, `${biome.slugCanonique} hors trajet`);
    } else {
      assert.ok(
        biome.assets.board.startsWith(`plateau-${biome.plateau}_`),
        `${biome.slugCanonique} : fond ${biome.assets.board}`,
      );
    }
  }
  assert.strictEqual(biomeAssetSlug('taiga', 'board'), 'plateau-4_fond');
  assert.strictEqual(biomeAssetSlug('toundra', 'board'), 'plateau-4_fond');
});

test('normalizeSousBiomeSlug : saison conservée, transition reconnue, inconnu rejeté', () => {
  assert.strictEqual(normalizeSousBiomeSlug('toundra_ete'), 'toundra_ete');
  assert.strictEqual(normalizeSousBiomeSlug('Toundra-Hiver'), 'toundra_hiver');
  assert.strictEqual(normalizeSousBiomeSlug('toundra'), 'toundra');
  assert.strictEqual(normalizeSousBiomeSlug('jungle'), 'jungle_afc');
  assert.strictEqual(normalizeSousBiomeSlug('taiga'), 'taiga');
  assert.strictEqual(normalizeSousBiomeSlug('transition'), 'transition');
  assert.strictEqual(normalizeSousBiomeSlug('Transition'), 'transition');
  assert.strictEqual(normalizeSousBiomeSlug('banquise-imaginaire'), null);
  assert.strictEqual(normalizeSousBiomeSlug(''), null);
});
