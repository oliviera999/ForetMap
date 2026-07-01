'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { chapterPaysFromBiomes, buildChapterPoolClause } = require('../lib/glFeuilletChapterPool');
const {
  normalizeAcquisitionChannels,
  DEFAULT_ACQUISITION_CHANNELS,
} = require('../lib/glFeuilletAcquisitionChannels');

test('chapterPaysFromBiomes : mappe les biomes vers leurs pays (dédupliqué)', () => {
  // jungle_afc + savane => pays 1 ; toundra => pays 5.
  assert.deepStrictEqual(chapterPaysFromBiomes(['jungle_afc', 'savane']).sort(), [1]);
  assert.deepStrictEqual(chapterPaysFromBiomes(['toundra']).sort(), [5]);
  assert.deepStrictEqual(chapterPaysFromBiomes(['savane', 'toundra']).sort(), [1, 5]);
  assert.deepStrictEqual(chapterPaysFromBiomes(['inconnu']), []);
  assert.deepStrictEqual(chapterPaysFromBiomes([]), []);
});

test('buildChapterPoolClause : combine biomes / plateau / pays en OR', () => {
  const built = buildChapterPoolClause({ plateau: 2, biomeSlugs: ['savane'], pays: [1] });
  assert.ok(built);
  assert.match(built.clause, /f\.biome_slug IN/);
  assert.match(built.clause, /f\.plateau_number = \?/);
  assert.match(built.clause, /f\.lien_pays IN/);
  assert.deepStrictEqual(built.params, ['savane', 2, 1]);
});

test('buildChapterPoolClause : null si aucun critère (pool vide garanti)', () => {
  assert.strictEqual(buildChapterPoolClause({ plateau: null, biomeSlugs: [], pays: [] }), null);
});

test('buildChapterPoolClause : biomes seuls', () => {
  const built = buildChapterPoolClause({
    plateau: null,
    biomeSlugs: ['savane', 'toundra'],
    pays: [],
  });
  assert.deepStrictEqual(built.params, ['savane', 'toundra']);
  assert.doesNotMatch(built.clause, /plateau_number/);
  assert.doesNotMatch(built.clause, /lien_pays/);
});

test('normalizeAcquisitionChannels : défaut si absent, filtre inconnus, déduplique', () => {
  assert.deepStrictEqual(normalizeAcquisitionChannels(undefined), [
    ...DEFAULT_ACQUISITION_CHANNELS,
  ]);
  assert.deepStrictEqual(
    normalizeAcquisitionChannels(['species', 'bidon', 'species', 'ecosystem']),
    ['species', 'ecosystem'],
  );
  assert.deepStrictEqual(normalizeAcquisitionChannels([]), []);
  // 'feuillet' n'est pas un canal (on n'acquiert pas un feuillet en consultant un feuillet).
  assert.deepStrictEqual(normalizeAcquisitionChannels(['feuillet']), []);
});
