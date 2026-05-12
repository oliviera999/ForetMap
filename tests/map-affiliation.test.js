'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let allowedMapIdsFromAffiliation;
let mapsForAffiliationScope;

describe('mapAffiliation', () => {
  before(async () => {
    const mod = await import(pathToFileURL(join(__dirname, '../src/utils/mapAffiliation.js')).href);
    allowedMapIdsFromAffiliation = mod.allowedMapIdsFromAffiliation;
    mapsForAffiliationScope = mod.mapsForAffiliationScope;
  });

  it('borne une affiliation personnalisée à son identifiant de carte', () => {
    assert.deepEqual(allowedMapIdsFromAffiliation('potager'), ['potager']);
    assert.deepEqual(allowedMapIdsFromAffiliation('N3'), ['n3']);
    assert.equal(allowedMapIdsFromAffiliation('both'), null);
  });

  it('ne retombe pas sur toutes les cartes actives quand la carte affiliée est inactive', () => {
    const maps = [
      { id: 'foret', label: 'Forêt', is_active: true },
      { id: 'n3', label: 'N3', is_active: true },
      { id: 'potager', label: 'Potager', is_active: false },
    ];

    const scoped = mapsForAffiliationScope(maps, ['potager']);

    assert.deepEqual(scoped.map((m) => m.id), ['potager']);
  });

  it('retourne les cartes actives pour une affiliation both', () => {
    const maps = [
      { id: 'foret', label: 'Forêt', is_active: true },
      { id: 'n3', label: 'N3', is_active: false },
      { id: 'potager', label: 'Potager', is_active: true },
    ];

    const visible = mapsForAffiliationScope(maps, null);

    assert.deepEqual(visible.map((m) => m.id), ['foret', 'potager']);
  });
});
