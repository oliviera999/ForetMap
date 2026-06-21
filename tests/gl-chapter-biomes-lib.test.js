'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeBiomeSlugList,
  parseBiomeSlugsFromBody,
  parseBiomeSlugsFromQuery,
} = require('../lib/glChapterBiomes');

test('normalizeBiomeSlugList dédoublonne en conservant l’ordre', () => {
  assert.deepStrictEqual(normalizeBiomeSlugList(['sahara', '  ', 'sahara', 'toundra']), [
    'sahara',
    'toundra',
  ]);
});

test('parseBiomeSlugsFromBody lit biomeSlugs ou biomeSlug legacy', () => {
  assert.deepStrictEqual(parseBiomeSlugsFromBody({ biomeSlugs: ['a', 'b'] }), ['a', 'b']);
  assert.deepStrictEqual(parseBiomeSlugsFromBody({ biomeSlug: 'sahara' }), ['sahara']);
  assert.deepStrictEqual(parseBiomeSlugsFromBody({ biomeSlug: '' }), []);
  assert.strictEqual(parseBiomeSlugsFromBody({ title: 'x' }), null);
});

test('parseBiomeSlugsFromQuery lit biomeSlugs csv ou biomeSlug simple', () => {
  assert.deepStrictEqual(parseBiomeSlugsFromQuery({ biomeSlugs: 'sahara,toundra' }), [
    'sahara',
    'toundra',
  ]);
  assert.deepStrictEqual(parseBiomeSlugsFromQuery({ biomeSlug: 'jungle_afc' }), ['jungle_afc']);
  assert.deepStrictEqual(parseBiomeSlugsFromQuery({}), []);
});
