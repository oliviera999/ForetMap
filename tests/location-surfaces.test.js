'use strict';

require('./helpers/setup');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  SURFACES,
  parseSurfaceSet,
  serializeSurfaceSet,
  normalizeSurfaceInput,
  searchAliasesToList,
  normalizeSearchAliases,
  isVisibleOnSurface,
  withLocationSurfaceFields,
  readSurfaceQuery,
  SEARCH_ALIASES_MAX_LENGTH,
} = require('../lib/locationSurfaces');
const { createWriteVersionCache } = require('../lib/shared/writeVersionCache');

describe('locationSurfaces — parse / sérialisation', () => {
  it('parseSurfaceSet : chaîne SET, tableau, vide, inconnus, ordre canonique', () => {
    assert.deepEqual(parseSurfaceSet('plan,map'), ['map', 'plan']);
    assert.deepEqual(parseSurfaceSet(['VISIT ', 'plan', 'zzz']), ['visit', 'plan']);
    assert.deepEqual(parseSurfaceSet(''), []);
    assert.deepEqual(parseSurfaceSet(null), []);
    assert.deepEqual(parseSurfaceSet('map,map,visit,plan'), SURFACES);
  });

  it('serializeSurfaceSet → valeur SET', () => {
    assert.equal(serializeSurfaceSet(['plan', 'map']), 'map,plan');
    assert.equal(serializeSurfaceSet([]), '');
    assert.equal(serializeSurfaceSet(undefined), '');
  });

  it('normalizeSurfaceInput : undefined = non fourni, vide = aucune, inconnu = erreur', () => {
    assert.deepEqual(normalizeSurfaceInput(undefined), { ok: true, value: null });
    assert.deepEqual(normalizeSurfaceInput(null), { ok: true, value: [] });
    assert.deepEqual(normalizeSurfaceInput(''), { ok: true, value: [] });
    assert.deepEqual(normalizeSurfaceInput(['plan']), { ok: true, value: ['plan'] });
    assert.deepEqual(normalizeSurfaceInput('visit, map'), { ok: true, value: ['map', 'visit'] });
    assert.equal(normalizeSurfaceInput(['nope']).ok, false);
    assert.equal(normalizeSurfaceInput(42).ok, false);
    assert.match(normalizeSurfaceInput([1], { field: 'hidden_surfaces' }).error, /hidden_surfaces/);
  });

  it('readSurfaceQuery : vide, connu, inconnu', () => {
    assert.deepEqual(readSurfaceQuery(undefined), { ok: true, value: '' });
    assert.deepEqual(readSurfaceQuery(' Plan '), { ok: true, value: 'plan' });
    assert.equal(readSurfaceQuery('carte').ok, false);
  });
});

describe('locationSurfaces — alias de recherche', () => {
  it('searchAliasesToList : « ; » et retours ligne, trim, doublons insensibles à la casse', () => {
    assert.deepEqual(searchAliasesToList('CDI ; bibliothèque;  cdi \n Biblio'), [
      'CDI',
      'bibliothèque',
      'Biblio',
    ]);
    assert.deepEqual(searchAliasesToList(['a', ' a ', 'b']), ['a', 'b']);
    assert.deepEqual(searchAliasesToList(null), []);
  });

  it('normalizeSearchAliases : forme stockée et borne sans troncature au milieu', () => {
    assert.equal(normalizeSearchAliases(' CDI ;bibliothèque '), 'CDI ; bibliothèque');
    assert.equal(normalizeSearchAliases(''), '');
    const long = Array.from({ length: 200 }, (_, i) => `alias-${i}`);
    const stored = normalizeSearchAliases(long);
    assert.ok(stored.length <= SEARCH_ALIASES_MAX_LENGTH);
    assert.ok(stored.endsWith('alias-' + (searchAliasesToList(stored).length - 1)));
  });
});

describe('locationSurfaces — visibilité', () => {
  it('masqué explicitement → invisible, quelle que soit la catégorie', () => {
    const entity = {
      hidden_surfaces: 'plan',
      categories: [{ surfaces: ['map', 'visit', 'plan'] }],
    };
    assert.equal(isVisibleOnSurface(entity, 'plan'), false);
    assert.equal(isVisibleOnSurface(entity, 'map'), true);
  });

  it('sans catégorie → visible partout où il n’est pas masqué', () => {
    assert.equal(isVisibleOnSurface({ hidden_surfaces: '', categories: [] }, 'plan'), true);
    assert.equal(isVisibleOnSurface({}, 'visit'), true);
  });

  it('avec catégories → au moins une doit apparaître sur la surface', () => {
    const onlyMap = { hidden_surfaces: '', categories: [{ surfaces: 'map' }] };
    assert.equal(isVisibleOnSurface(onlyMap, 'plan'), false);
    assert.equal(isVisibleOnSurface(onlyMap, 'map'), true);
    const mixed = { categories: [{ surfaces: 'map' }, { surfaces: 'plan' }] };
    assert.equal(isVisibleOnSurface(mixed, 'plan'), true);
  });

  it('surface inconnue → jamais visible', () => {
    assert.equal(isVisibleOnSurface({}, 'carte'), false);
  });

  it('withLocationSurfaceFields : tableau + chaîne, autres champs intacts', () => {
    assert.deepEqual(
      withLocationSurfaceFields({ id: 1, hidden_surfaces: 'plan', search_aliases: null }),
      {
        id: 1,
        hidden_surfaces: ['plan'],
        search_aliases: '',
      },
    );
    assert.equal(withLocationSurfaceFields(null), null);
  });
});

describe('writeVersionCache (générique, lot 4)', () => {
  it('périme à la première écriture et au TTL, purge au-delà de maxEntries', () => {
    let writes = 1;
    let now = 1000;
    const cache = createWriteVersionCache({
      writeVersion: () => writes,
      now: () => now,
      ttlMs: 100,
      maxEntries: 2,
    });
    cache.set('a', { a: 1 });
    assert.deepEqual(cache.get('a'), { a: 1 });
    writes += 1;
    assert.equal(cache.get('a'), null);
    cache.set('a', { a: 2 });
    now += 100;
    assert.equal(cache.get('a'), null);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    assert.equal(cache.size(), 1);
    assert.throws(() => createWriteVersionCache({}), /writeVersion/);
  });
});
