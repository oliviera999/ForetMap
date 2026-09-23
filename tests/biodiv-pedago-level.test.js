'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePedagoLevel,
  minPedagoLevel,
  resolveBiodivPedagoLevel,
  biodivFeatureVisibility,
  canShowBiodivFeature,
  foodWebTypesForPedagoLevel,
  curriculumNiveauxForPedagoLevel,
  COLLEGE_FOODWEB_TYPES,
} = require('../lib/biodivPedagoLevel');

test('normalizePedagoLevel accepte collège / lycée / université (accents)', () => {
  assert.equal(normalizePedagoLevel('Collège'), 'college');
  assert.equal(normalizePedagoLevel('LYCEE'), 'lycee');
  assert.equal(normalizePedagoLevel('université'), 'universite');
  assert.equal(normalizePedagoLevel(''), null);
  assert.equal(normalizePedagoLevel('foo'), null);
});

test('minPedagoLevel retient le plus simple', () => {
  assert.equal(minPedagoLevel(['universite', 'college', 'lycee']), 'college');
  assert.equal(minPedagoLevel([null, 'lycee']), 'lycee');
  assert.equal(minPedagoLevel([]), 'college');
});

test('resolveBiodivPedagoLevel — défaut site Collège si rien n’est fourni', () => {
  assert.equal(resolveBiodivPedagoLevel({}), 'college');
});

test('resolveBiodivPedagoLevel — visite invitée toujours collège', () => {
  assert.equal(
    resolveBiodivPedagoLevel({
      isGuestVisit: true,
      siteDefault: 'universite',
      userPreference: 'universite',
      teacherPreview: 'lycee',
    }),
    'college',
  );
});

test('resolveBiodivPedagoLevel — aperçu prof prioritaire hors visite', () => {
  assert.equal(
    resolveBiodivPedagoLevel({
      teacherPreview: 'college',
      siteDefault: 'universite',
      mapLevel: 'lycee',
    }),
    'college',
  );
});

test('resolveBiodivPedagoLevel — base = min(groupes, carte, site)', () => {
  assert.equal(
    resolveBiodivPedagoLevel({
      siteDefault: 'universite',
      mapLevel: 'lycee',
      groupLevels: ['universite', 'college'],
    }),
    'college',
  );
});

test('resolveBiodivPedagoLevel — préférence ne peut que baisser sauf can_raise', () => {
  assert.equal(
    resolveBiodivPedagoLevel({
      siteDefault: 'lycee',
      userPreference: 'college',
      prefCanRaise: false,
    }),
    'college',
  );
  assert.equal(
    resolveBiodivPedagoLevel({
      siteDefault: 'lycee',
      userPreference: 'universite',
      prefCanRaise: false,
    }),
    'lycee',
  );
  assert.equal(
    resolveBiodivPedagoLevel({
      siteDefault: 'lycee',
      userPreference: 'universite',
      prefCanRaise: true,
    }),
    'universite',
  );
});

test('biodivFeatureVisibility — collège masque clades / individus / foodweb avancé', () => {
  assert.equal(biodivFeatureVisibility('clade_breadcrumb', 'college'), 'hide');
  assert.equal(biodivFeatureVisibility('individuals_tab', 'college'), 'hide');
  assert.equal(biodivFeatureVisibility('foodweb_advanced', 'college'), 'hide');
  assert.equal(biodivFeatureVisibility('accepted_name_gbif_latin', 'college'), 'hide');
  assert.equal(biodivFeatureVisibility('accepted_name_gbif_latin', 'lycee'), 'collapsed');
  assert.equal(biodivFeatureVisibility('accepted_name_gbif_latin', 'universite'), 'open');
  assert.equal(biodivFeatureVisibility('biomass_estimates', 'lycee'), 'collapsed');
  assert.ok(canShowBiodivFeature('nested_groups_tab', 'lycee'));
  assert.ok(!canShowBiodivFeature('nested_groups_tab', 'college'));
});

test('foodWebTypesForPedagoLevel filtre au collège', () => {
  const all = [...COLLEGE_FOODWEB_TYPES, 'mutualisme', 'allelopathie'];
  assert.deepEqual(
    foodWebTypesForPedagoLevel('college', all).sort(),
    [...COLLEGE_FOODWEB_TYPES].sort(),
  );
  assert.deepEqual(foodWebTypesForPedagoLevel('lycee', all), all);
});

test('curriculumNiveauxForPedagoLevel — collège = cycle3/cycle4', () => {
  assert.deepEqual(curriculumNiveauxForPedagoLevel('college'), ['cycle3', 'cycle4']);
  assert.equal(curriculumNiveauxForPedagoLevel('lycee'), null);
});
