'use strict';

/**
 * Helpers purs des catégories réglées par carte (`src/utils/mapCategoryIds.js`) - sans BDD.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let mod;

before(async () => {
  mod = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'mapCategoryIds.js')).href
  );
});

describe('mapCategoryIdList', () => {
  it('accepte un tableau ou une chaîne, dédoublonne', () => {
    assert.deepEqual(mod.mapCategoryIdList(['a', 'b', 'a', '', null]), ['a', 'b']);
    assert.deepEqual(mod.mapCategoryIdList('a;b, a'), ['a', 'b']);
    assert.deepEqual(mod.mapCategoryIdList(undefined), []);
  });
});

describe('mapDefaultCategoryIds', () => {
  it('retire les catégories cachées des catégories cochées d’office', () => {
    assert.deepEqual(
      mod.mapDefaultCategoryIds({ default_category_ids: ['a', 'b'], hidden_category_ids: ['b'] }),
      ['a'],
    );
    assert.deepEqual(mod.mapDefaultCategoryIds(null), []);
  });
});

describe('filterPlacesByHiddenCategories', () => {
  const maps = [
    { id: 'foret', hidden_category_ids: ['h'] },
    { id: 'n3', hidden_category_ids: [] },
  ];
  const hidden = () => mod.hiddenCategoryIdsByMap(maps);

  it('ne garde que les cartes qui cachent quelque chose', () => {
    const byMap = hidden();
    assert.equal(byMap.size, 1);
    assert.ok(byMap.get('foret').has('h'));
  });

  it('sémantique du Plan : sans catégorie gardé, uniquement cachées retiré', () => {
    const places = [
      { id: 1, map_id: 'foret', category_ids: [] },
      { id: 2, map_id: 'foret', category_ids: ['h'] },
      { id: 3, map_id: 'foret', category_ids: ['h', 'x'] },
      { id: 4, map_id: 'n3', category_ids: ['h'] },
      { id: 5, map_id: 'foret', categories: [{ id: 'h' }] },
    ];
    const kept = mod.filterPlacesByHiddenCategories(places, hidden()).map((p) => p.id);
    assert.deepEqual(kept, [1, 3, 4]);
  });

  it('sans masquage : renvoie la même liste (identité conservée)', () => {
    const places = [{ id: 1, map_id: 'foret', category_ids: ['h'] }];
    assert.equal(mod.filterPlacesByHiddenCategories(places, new Map()), places);
  });
});
