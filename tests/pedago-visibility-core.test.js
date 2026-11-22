'use strict';

// Table de visibilité pédagogique (`src/shared/pedagoVisibilityCore.js`, miroir
// `lib/shared/pedagoVisibilityCore.js`) — socle du chantier collège.
//
// Ce que ce fichier protège :
// - chaque clé (brique d'affichage ou règle de palier) a une valeur pour chaque profil ;
// - lycée et université : les huit clés historiques reproduisent exactement l'ancien `switch`
//   de `biodivFeatureVisibility` (caractérisation figée ci-dessous), et les clés du chantier ne
//   changent rien (« Lycée et universitaire : inchangés ») ;
// - profil collège (flux C1) : une assertion par clé (`COLLEGE_EXPECTED`), seules
//   `clade_breadcrumb` et `nested_groups_tab` s'écartent de l'ancien `switch` (montrées : l'arbre
//   est réduit par C4) ;
// - règles de palier : une assertion par règle et par profil de palier ;
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

/** Profil collège attendu, une valeur par brique (décisions du 21/11/2026, prompt C1 § 1). */
const COLLEGE_EXPECTED = Object.freeze({
  accepted_name_gbif_latin: 'hide',
  clade_breadcrumb: 'show',
  nested_groups_tab: 'show',
  foodweb_advanced: 'hide',
  pollination_efficacy: 'hide',
  individuals_tab: 'hide',
  biomass_estimates: 'hide',
  curriculum_notions_lycee_plus: 'hide',
  taxonomy_line: 'hide',
  meta_sections: 'hide',
  range_gauges: 'hide',
  nutrition_badge: 'hide',
  iucn_code: 'mots',
  visit_tile_scientific_name: 'hide',
  usage_label: 'show',
  description_college: 'show',
  foodweb_offmap_species: 'hide',
  foodweb_full_by_default: 'hide',
  nested_groups_full_tree: 'hide',
  catalog_grouped: 'show',
  featured_first: 'show',
  zone_tiles_cap: 12,
});

/** Clés du chantier propres au collège : masquées au lycée et à l'université. */
const COLLEGE_ONLY_KEYS = [
  'usage_label',
  'description_college',
  'catalog_grouped',
  'featured_first',
];

/** Règles de palier attendues, par profil de palier. */
const PALIER_EXPECTED = Object.freeze({
  glossary_depth_max: {
    cycle3: 'base',
    cycle4: 'approfondissement',
    lycee: 'avance',
    universite: null,
  },
  quiz_entry_palier_max: { cycle3: 1, cycle4: 2, lycee: null, universite: null },
  foodweb_types_cycle4_only: {
    cycle3: ['competition', 'symbiose'],
    cycle4: [],
    lycee: [],
    universite: [],
  },
});

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

test('lycée et université : clés historiques identiques à l’ancien switch', () => {
  for (const feature of LEGACY_KEYS) {
    for (const profile of ['lycee', 'universite']) {
      assert.equal(core.visibilityFor(feature, profile), legacySwitch(feature, profile), feature);
      assert.equal(
        core.visibilityFor(feature, { etape: profile }),
        legacySwitch(feature, profile),
        `${feature} (learner)`,
      );
    }
  }
  // Clé inconnue : comportement historique (`show`).
  assert.equal(core.visibilityFor('cle_inconnue', 'lycee'), 'show');
  assert.equal(core.visibilityFor('cle_inconnue', 'college'), 'show');
});

test('collège : clés historiques identiques à l’ancien switch, sauf fil et onglet des groupes', () => {
  for (const feature of LEGACY_KEYS) {
    const expected = ['clade_breadcrumb', 'nested_groups_tab'].includes(feature)
      ? 'show'
      : legacySwitch(feature, 'college');
    assert.equal(core.visibilityFor(feature, 'college'), expected, feature);
  }
});

test('lycée et université : les clés du chantier ne changent rien', () => {
  for (const feature of NEW_KEYS) {
    for (const profile of ['lycee', 'universite']) {
      const value = core.visibilityFor(feature, profile);
      if (feature === 'iucn_code') assert.equal(value, 'code');
      else if (feature === 'zone_tiles_cap') assert.equal(value, null);
      else if (COLLEGE_ONLY_KEYS.includes(feature)) assert.equal(value, 'hide', feature);
      else assert.equal(value, 'show', `${feature} / ${profile}`);
    }
  }
});

for (const feature of [...LEGACY_KEYS, ...NEW_KEYS]) {
  test(`profil collège : ${feature}`, () => {
    assert.ok(Object.hasOwn(COLLEGE_EXPECTED, feature), `attente manquante pour ${feature}`);
    const expected = COLLEGE_EXPECTED[feature];
    for (const learner of ['college', LEARNER_6E, LEARNER_3E, GUEST, null, 'maternelle']) {
      assert.deepEqual(core.visibilityFor(feature, learner), expected, JSON.stringify(learner));
    }
    assert.equal(core.canShowFor(feature, 'college'), expected !== 'hide');
  });
}

for (const rule of Object.keys(PALIER_EXPECTED)) {
  test(`règle de palier : ${rule}`, () => {
    for (const profile of core.PALIER_PROFILES) {
      const value = core.PALIER_RULES_TABLE[rule][profile];
      const expected = PALIER_EXPECTED[rule][profile];
      if (Array.isArray(expected)) assert.deepEqual([...value].sort(), expected, profile);
      else assert.equal(value, expected, profile);
    }
    const cases = [
      [LEARNER_6E, 'cycle3'],
      [LEARNER_3E, 'cycle4'],
      [LEARNER_2DE, 'lycee'],
      [GUEST, 'cycle3'],
      [null, 'cycle3'],
      [{ etape: 'universite', niveau: 'universite', maxPalier: null }, 'universite'],
    ];
    for (const [learner, profile] of cases) {
      assert.deepEqual(
        core.palierRuleFor(rule, learner),
        core.PALIER_RULES_TABLE[rule][profile],
        `${rule} / ${JSON.stringify(learner)}`,
      );
    }
  });
}

test('règle inconnue : null', () => {
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
  // Collège sans classe connue (Visite, élève sans classe, repli) : cycle 3, même si le
  // palier maximal de repli de l'étape vaut 2.
  assert.equal(core.palierProfileFor(GUEST), 'cycle3');
  assert.equal(core.palierProfileFor({ etape: 'college', maxPalier: null }), 'cycle3');
  assert.equal(core.palierProfileFor('college'), 'cycle3');
  // Lycéen qui a choisi l'affichage collège : palier de sa classe (≥ cycle 4).
  assert.equal(
    core.palierProfileFor({ etape: 'college', niveau: 'seconde', maxPalier: 3 }),
    'cycle4',
  );
  // Forme réduite sans `niveau` : lue sur `maxPalier`.
  assert.equal(core.palierProfileFor({ etape: 'college', maxPalier: 2 }), 'cycle4');
});

test('6e et 3e : même visibilité sur toutes les briques d’affichage', () => {
  // Classes réelles résolues par le résolveur de l'apprenant (pas seulement des objets à la main).
  const { resolveLearnerLevel } = require('../lib/pedago/learnerLevel');
  const sixieme = resolveLearnerLevel({ classNiveaux: ['cycle3'] });
  const troisieme = resolveLearnerLevel({ classNiveaux: ['cycle4'] });
  assert.equal(core.palierProfileFor(sixieme), 'cycle3');
  assert.equal(core.palierProfileFor(troisieme), 'cycle4');
  for (const feature of core.PEDAGO_VISIBILITY_FEATURES) {
    assert.deepEqual(
      core.visibilityFor(feature, sixieme),
      core.visibilityFor(feature, troisieme),
      `${feature} (résolveur)`,
    );
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
