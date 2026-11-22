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

test('resolveBiodivPedagoLevel — base = min des niveaux explicites (groupes, carte)', () => {
  assert.equal(
    resolveBiodivPedagoLevel({
      siteDefault: 'universite',
      mapLevel: 'lycee',
      groupLevels: ['universite', 'college'],
    }),
    'college',
  );
});

test('resolveBiodivPedagoLevel — défaut Collège n’annule pas une carte ou un groupe plus élevé', () => {
  assert.equal(
    resolveBiodivPedagoLevel({
      siteDefault: 'college',
      mapLevel: 'lycee',
    }),
    'lycee',
  );
  assert.equal(
    resolveBiodivPedagoLevel({
      siteDefault: 'college',
      groupLevels: ['lycee'],
    }),
    'lycee',
  );
  assert.equal(
    resolveBiodivPedagoLevel({
      siteDefault: 'college',
      mapLevel: 'universite',
      groupLevels: ['lycee'],
    }),
    'lycee',
  );
  // Groupe Collège sur une carte Lycée : le plus simple des niveaux explicites reste.
  assert.equal(
    resolveBiodivPedagoLevel({
      siteDefault: 'universite',
      mapLevel: 'lycee',
      groupLevels: ['college'],
    }),
    'college',
  );
  // Préférence : ne peut toujours pas remonter au-dessus de ce socle.
  assert.equal(
    resolveBiodivPedagoLevel({
      siteDefault: 'college',
      mapLevel: 'lycee',
      userPreference: 'universite',
      prefCanRaise: false,
    }),
    'lycee',
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

test('biodivFeatureVisibility — collège masque individus / foodweb avancé, montre les groupes', () => {
  // Chantier collège (C1) : fil et onglet des groupes montrés, l'arbre y est réduit (C4).
  assert.equal(biodivFeatureVisibility('clade_breadcrumb', 'college'), 'show');
  assert.equal(biodivFeatureVisibility('individuals_tab', 'college'), 'hide');
  assert.equal(biodivFeatureVisibility('foodweb_advanced', 'college'), 'hide');
  assert.equal(biodivFeatureVisibility('accepted_name_gbif_latin', 'college'), 'hide');
  assert.equal(biodivFeatureVisibility('accepted_name_gbif_latin', 'lycee'), 'collapsed');
  assert.equal(biodivFeatureVisibility('accepted_name_gbif_latin', 'universite'), 'open');
  assert.equal(biodivFeatureVisibility('biomass_estimates', 'lycee'), 'collapsed');
  assert.ok(canShowBiodivFeature('nested_groups_tab', 'lycee'));
  assert.ok(canShowBiodivFeature('nested_groups_tab', 'college'));
  assert.ok(!canShowBiodivFeature('nested_groups_full_tree', 'college'));
});

test('foodWebTypesForPedagoLevel filtre au collège', () => {
  const all = [...COLLEGE_FOODWEB_TYPES, 'mutualisme', 'allelopathie'];
  // Étape seule = collège sans classe : types scolaires moins ceux du cycle 4.
  assert.deepEqual(
    foodWebTypesForPedagoLevel('college', all).sort(),
    [...COLLEGE_FOODWEB_TYPES].filter((t) => !['symbiose', 'competition'].includes(t)).sort(),
  );
  assert.deepEqual(foodWebTypesForPedagoLevel('lycee', all), all);
});

test('foodWebTypesForPedagoLevel : symbiose et compétition réservées au cycle 4', () => {
  const all = [...COLLEGE_FOODWEB_TYPES, 'mutualisme'];
  const cycle4Only = ['symbiose', 'competition'];
  const sixieme = { etape: 'college', niveau: 'cycle3', maxPalier: 1 };
  const troisieme = { etape: 'college', niveau: 'cycle4', maxPalier: 2 };
  const invite = { etape: 'college', niveau: null, maxPalier: 2 };
  const without = [...COLLEGE_FOODWEB_TYPES].filter((t) => !cycle4Only.includes(t)).sort();
  assert.deepEqual(foodWebTypesForPedagoLevel(sixieme, all).sort(), without);
  assert.deepEqual(foodWebTypesForPedagoLevel(invite, all).sort(), without);
  // Étape seule (`'college'`, sans classe connue) : règle du cycle 3.
  assert.deepEqual(foodWebTypesForPedagoLevel('college', all).sort(), without);
  assert.deepEqual(
    foodWebTypesForPedagoLevel(troisieme, all).sort(),
    [...COLLEGE_FOODWEB_TYPES].sort(),
  );
  assert.deepEqual(
    foodWebTypesForPedagoLevel({ etape: 'lycee', niveau: 'seconde', maxPalier: 3 }, all),
    all,
  );
});

test('collège : la détritivorie est un type scolaire, miroir ESM compris (migration 295)', async () => {
  // Sans elle, un élève de collège voyait la pastille « Détritivore » d'un ver de terre
  // mais aucune flèche vers ce qu'il mange.
  assert.ok(COLLEGE_FOODWEB_TYPES.includes('detritivorie'));
  assert.deepEqual(foodWebTypesForPedagoLevel('college', ['detritivorie', 'frugivorie']), [
    'detritivorie',
  ]);
  const path = require('node:path');
  const { pathToFileURL } = require('node:url');
  const esm = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'biodivPedagoLevel.js')).href
  );
  assert.deepEqual([...esm.COLLEGE_FOODWEB_TYPES], [...COLLEGE_FOODWEB_TYPES]);
});

test('curriculumNiveauxForPedagoLevel — collège = cycle3/cycle4', () => {
  assert.deepEqual(curriculumNiveauxForPedagoLevel('college'), ['cycle3', 'cycle4']);
  assert.equal(curriculumNiveauxForPedagoLevel('lycee'), null);
});
