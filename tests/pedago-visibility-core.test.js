'use strict';

// Table de visibilité pédagogique (`src/shared/pedagoVisibilityCore.js`, miroir
// `lib/shared/pedagoVisibilityCore.js`) — socle du chantier collège.
//
// Ce que ce fichier protège :
// - chaque clé (brique d'affichage ou règle de palier) a une valeur pour chaque profil ;
// - les huit clés historiques reproduisent exactement l'ancien `switch` de
//   `biodivFeatureVisibility` (caractérisation figée ci-dessous) ;
// - état S0 : les clés nouvelles ne changent rien (`show`, `code`, `null`, `[]`) — le flux C1
//   met à jour les attentes de ce fichier quand il remplit le profil collège ;
// - une classe de 6e et une classe de 3e ont la même visibilité (hors règles de palier) ;
// - parité ESM ↔ CJS du noyau et de `biodivFeatureVisibility` (front ↔ serveur).

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const core = require('../lib/shared/pedagoVisibilityCore');
const serverLevel = require('../lib/biodivPedagoLevel');

const PROFILES = ['college', 'lycee', 'universite'];
const LEARNER_6E = Object.freeze({ niveau: 'cycle3', etape: 'college', maxPalier: 1 });
const LEARNER_3E = Object.freeze({ niveau: 'cycle4', etape: 'college', maxPalier: 2 });
const LEARNER_2DE = Object.freeze({ niveau: 'seconde', etape: 'lycee', maxPalier: 3 });
const GUEST = Object.freeze({ niveau: null, etape: 'college', maxPalier: 2 });

/** Ancien `switch` de biodivFeatureVisibility, figé (comportement d'avant le chantier). */
function legacySwitch(feature, lv) {
  switch (feature) {
    case 'accepted_name_gbif_latin':
    case 'biomass_estimates':
      if (lv === 'college') return 'hide';
      if (lv === 'lycee') return 'collapsed';
      return 'open';
    case 'clade_breadcrumb':
    case 'nested_groups_tab':
    case 'foodweb_advanced':
    case 'pollination_efficacy':
    case 'individuals_tab':
    case 'curriculum_notions_lycee_plus':
      return lv === 'college' ? 'hide' : 'show';
    default:
      return 'show';
  }
}

const LEGACY_KEYS = [
  'accepted_name_gbif_latin',
  'clade_breadcrumb',
  'nested_groups_tab',
  'foodweb_advanced',
  'pollination_efficacy',
  'individuals_tab',
  'biomass_estimates',
  'curriculum_notions_lycee_plus',
];

const NEW_KEYS = [
  'taxonomy_line',
  'meta_sections',
  'range_gauges',
  'nutrition_badge',
  'iucn_code',
  'visit_tile_scientific_name',
  'usage_label',
  'description_college',
  'foodweb_offmap_species',
  'foodweb_full_by_default',
  'nested_groups_full_tree',
  'catalog_grouped',
  'featured_first',
  'zone_tiles_cap',
];

let esmCore;
let frontLevel;

before(async () => {
  esmCore = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'shared', 'pedagoVisibilityCore.js')).href
  );
  frontLevel = await import(
    pathToFileURL(path.join(__dirname, '..', 'src', 'utils', 'biodivPedagoLevel.js')).href
  );
});

test('inventaire : clés historiques + clés du chantier, trois règles de palier', () => {
  assert.deepEqual([...core.PEDAGO_VISIBILITY_FEATURES], [...LEGACY_KEYS, ...NEW_KEYS]);
  assert.deepEqual(
    [...core.PEDAGO_PALIER_RULES],
    ['glossary_depth_max', 'quiz_entry_palier_max', 'foodweb_types_cycle4_only'],
  );
  for (const feature of core.PEDAGO_VISIBILITY_FEATURES) {
    for (const profile of PROFILES) {
      assert.ok(
        Object.hasOwn(core.VISIBILITY_TABLE[feature], profile),
        `${feature} sans valeur pour ${profile}`,
      );
    }
  }
  for (const rule of core.PEDAGO_PALIER_RULES) {
    for (const profile of core.PALIER_PROFILES) {
      assert.ok(Object.hasOwn(core.PALIER_RULES_TABLE[rule], profile), `${rule} / ${profile}`);
    }
  }
});

test('clés historiques : identiques à l’ancien switch, pour chaque profil', () => {
  for (const feature of LEGACY_KEYS) {
    for (const profile of PROFILES) {
      assert.equal(core.visibilityFor(feature, profile), legacySwitch(feature, profile), feature);
      assert.equal(
        core.visibilityFor(feature, { etape: profile }),
        legacySwitch(feature, profile),
        `${feature} (learner)`,
      );
    }
  }
  // Clé inconnue et profil inconnu : comportement historique (`show`, profil collège).
  assert.equal(core.visibilityFor('cle_inconnue', 'lycee'), 'show');
  assert.equal(core.visibilityFor('clade_breadcrumb', 'maternelle'), 'hide');
  assert.equal(core.visibilityFor('clade_breadcrumb', null), 'hide');
});

test('état S0 : les clés nouvelles ne changent rien', () => {
  for (const feature of NEW_KEYS) {
    for (const profile of PROFILES) {
      const value = core.visibilityFor(feature, profile);
      if (feature === 'iucn_code') assert.equal(value, 'code');
      else if (feature === 'zone_tiles_cap') assert.equal(value, null);
      else assert.equal(value, 'show', `${feature} / ${profile}`);
      assert.equal(core.canShowFor(feature, profile), true);
    }
  }
  for (const learner of [LEARNER_6E, LEARNER_3E, LEARNER_2DE, GUEST, null]) {
    assert.equal(core.palierRuleFor('glossary_depth_max', learner), null);
    assert.equal(core.palierRuleFor('quiz_entry_palier_max', learner), null);
    assert.deepEqual([...core.palierRuleFor('foodweb_types_cycle4_only', learner)], []);
  }
  assert.equal(core.palierRuleFor('regle_inconnue', LEARNER_3E), null);
});

test('profils : collège de la 6e à la 3e et Visite ; palier d’après la classe', () => {
  assert.equal(core.visibilityProfileFor(LEARNER_6E), 'college');
  assert.equal(core.visibilityProfileFor(LEARNER_3E), 'college');
  assert.equal(core.visibilityProfileFor(GUEST), 'college');
  assert.equal(core.visibilityProfileFor(LEARNER_2DE), 'lycee');
  assert.equal(core.visibilityProfileFor('Lycée'), 'lycee');
  assert.equal(core.palierProfileFor(LEARNER_6E), 'cycle3');
  assert.equal(core.palierProfileFor(LEARNER_3E), 'cycle4');
  assert.equal(core.palierProfileFor(LEARNER_2DE), 'lycee');
  assert.equal(core.palierProfileFor({ etape: 'universite', maxPalier: null }), 'universite');
  // Collège sans classe connue : cycle 3.
  assert.equal(core.palierProfileFor({ etape: 'college', maxPalier: null }), 'cycle3');
  assert.equal(core.palierProfileFor('college'), 'cycle3');
});

test('6e et 3e : même visibilité sur toutes les briques d’affichage', () => {
  for (const feature of core.PEDAGO_VISIBILITY_FEATURES) {
    assert.deepEqual(
      core.visibilityFor(feature, LEARNER_6E),
      core.visibilityFor(feature, LEARNER_3E),
      feature,
    );
  }
});

test('types réservés au cycle 4 : sous-ensemble des types du collège', () => {
  const {
    CYCLE4_ONLY_INTERACTION_TYPE_ENUM,
    COLLEGE_INTERACTION_TYPE_ENUM,
  } = require('../lib/shared/biodivEnums');
  assert.deepEqual([...CYCLE4_ONLY_INTERACTION_TYPE_ENUM.values].sort(), [
    'competition',
    'symbiose',
  ]);
  for (const type of CYCLE4_ONLY_INTERACTION_TYPE_ENUM.values) {
    assert.ok(COLLEGE_INTERACTION_TYPE_ENUM.values.includes(type), type);
  }
});

test('parité ESM ↔ CJS du noyau', () => {
  assert.deepEqual(Object.keys(esmCore).sort(), Object.keys(core).sort());
  assert.deepEqual(esmCore.VISIBILITY_TABLE, core.VISIBILITY_TABLE);
  assert.deepEqual(esmCore.PALIER_RULES_TABLE, core.PALIER_RULES_TABLE);
});

test('parité front ↔ serveur de biodivFeatureVisibility (étape ou apprenant)', () => {
  const inputs = [...PROFILES, null, LEARNER_6E, LEARNER_3E, LEARNER_2DE, GUEST];
  for (const feature of [...core.PEDAGO_VISIBILITY_FEATURES, 'cle_inconnue']) {
    for (const input of inputs) {
      assert.deepEqual(
        frontLevel.biodivFeatureVisibility(feature, input),
        serverLevel.biodivFeatureVisibility(feature, input),
        `${feature} / ${JSON.stringify(input)}`,
      );
      assert.equal(
        frontLevel.canShowBiodivFeature(feature, input),
        serverLevel.canShowBiodivFeature(feature, input),
      );
    }
  }
});
