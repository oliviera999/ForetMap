/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/pedagoVisibilityCore.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Table de visibilité pédagogique — **source unique** de « qui voit quoi » selon le profil de
 * l'apprenant (chantier collège de novembre 2026).
 *
 * Deux familles de clés :
 *
 * 1. Les **briques d'affichage** (`PEDAGO_VISIBILITY_FEATURES`) : une valeur par profil
 *    d'affichage (`college`, `lycee`, `universite`, référentiel `PEDAGO_ETAPE_ENUM`).
 *    Valeurs : `'hide'` | `'show'` | `'collapsed'` | `'open'`, ou, pour les clés à paramètre,
 *    une valeur propre (`iucn_code` : `'code'` ou `'mots'` ; `zone_tiles_cap` : `null` = pas de
 *    plafond, ou un entier). Le profil `college` vaut de la 6e à la 3e et pour la Visite sans
 *    compte (décision 1 du 21/11/2026).
 *
 * 2. Les **règles de palier** (`PEDAGO_PALIER_RULES`) : les seules différences entre la 6e et
 *    la 3e (vocabulaire, éligibilité des questions, types d'interaction symbiose et
 *    compétition). Une valeur par profil de palier : `cycle3`, `cycle4`, `lycee`, `universite`.
 *    Au collège sans classe connue, la règle de palier vaut `cycle3`.
 *
 * État S0 (socle) : toutes les valeurs reproduisent le comportement d'avant le chantier ; les
 * clés nouvelles sont à `'show'` (ou « sans effet ») partout. Le flux C1 remplit le profil
 * collège ; les autres flux appellent `visibilityFor` / `palierRuleFor` (ou `canShow` /
 * `visibility` / `palierRule` du contexte `BiodivPedagoContext`) avec ces clés sans attendre C1.
 *
 * Aucune I/O, aucun import hors référentiels partagés. Miroir CJS : `lib/shared/pedagoVisibilityCore.js`
 * (généré par `npm run sync:shared-cores`, ne pas éditer).
 */

const { PEDAGO_ETAPE_ENUM } = require('./pedagoEnums');

const [ETAPE_COLLEGE, ETAPE_LYCEE, ETAPE_UNIVERSITE] = PEDAGO_ETAPE_ENUM.values;

/** Profil d'affichage par défaut (établissement sans réglage, apprenant inconnu). */
const DEFAULT_VISIBILITY_PROFILE = ETAPE_COLLEGE;

/** Valeurs possibles d'une brique d'affichage (hors clés à paramètre). */
const VISIBILITY_VALUES = Object.freeze(['hide', 'show', 'collapsed', 'open']);

/** Profils de palier, du plus simple au plus avancé. */
const PALIER_PROFILES = Object.freeze(['cycle3', 'cycle4', ETAPE_LYCEE, ETAPE_UNIVERSITE]);

/** Palier (échelle `CURRICULUM_PALIERS` de `pedagoScales`) à partir duquel un collégien est en cycle 4. */
const CYCLE4_PALIER = 2;

function byProfile(college, lycee, universite) {
  return Object.freeze({
    [ETAPE_COLLEGE]: college,
    [ETAPE_LYCEE]: lycee,
    [ETAPE_UNIVERSITE]: universite,
  });
}

const SAME_EVERYWHERE_SHOW = byProfile('show', 'show', 'show');

/**
 * Briques d'affichage. Les huit premières existaient avant le chantier (ancien `switch` de
 * `biodivFeatureVisibility`) ; les suivantes sont les clés du chantier collège.
 */
const VISIBILITY_TABLE = Object.freeze({
  // — Clés existantes (comportement inchangé) —
  accepted_name_gbif_latin: byProfile('hide', 'collapsed', 'open'),
  clade_breadcrumb: byProfile('hide', 'show', 'show'),
  nested_groups_tab: byProfile('hide', 'show', 'show'),
  foodweb_advanced: byProfile('hide', 'show', 'show'),
  pollination_efficacy: byProfile('hide', 'show', 'show'),
  individuals_tab: byProfile('hide', 'show', 'show'),
  biomass_estimates: byProfile('hide', 'collapsed', 'open'),
  curriculum_notions_lycee_plus: byProfile('hide', 'show', 'show'),
  // — Clés du chantier collège (S0 : comportement actuel partout) —
  /** Ligne « Taxonomie » de la fiche espèce. */
  taxonomy_line: SAME_EVERYWHERE_SHOW,
  /** Sections savantes de la fiche (Identité, Écologie…). */
  meta_sections: SAME_EVERYWHERE_SHOW,
  /** Jauges de plages (pH, température). */
  range_gauges: SAME_EVERYWHERE_SHOW,
  /** Pastille « Nutrition » de la fiche. */
  nutrition_badge: SAME_EVERYWHERE_SHOW,
  /** Statut UICN : `'code'` (sigle, comportement actuel) ou `'mots'`. */
  iucn_code: byProfile('code', 'code', 'code'),
  /** Nom scientifique sous les vignettes de la Visite. */
  visit_tile_scientific_name: SAME_EVERYWHERE_SHOW,
  /** Étiquette simple (`plants.usage_label`) sous le nom. */
  usage_label: SAME_EVERYWHERE_SHOW,
  /** Description collège (`plants.description_college`) à la place de la description. */
  description_college: SAME_EVERYWHERE_SHOW,
  /** Espèces hors carte dans le réseau trophique. */
  foodweb_offmap_species: SAME_EVERYWHERE_SHOW,
  /** Réseau trophique complet affiché d'emblée (sinon : choix d'une espèce de départ). */
  foodweb_full_by_default: SAME_EVERYWHERE_SHOW,
  /** Arbre complet des groupes emboîtés (sinon : arbre réduit aux groupes d'usage). */
  nested_groups_full_tree: SAME_EVERYWHERE_SHOW,
  /** Catalogue rangé par groupe d'usage. */
  catalog_grouped: SAME_EVERYWHERE_SHOW,
  /** Espèces phares (`map_species.is_featured`) en tête des listes. */
  featured_first: SAME_EVERYWHERE_SHOW,
  /** Plafond de vignettes d'une fiche de zone : `null` = pas de plafond (comportement actuel). */
  zone_tiles_cap: byProfile(null, null, null),
});

/** Liste des briques d'affichage connues (ordre de la table). */
const PEDAGO_VISIBILITY_FEATURES = Object.freeze(Object.keys(VISIBILITY_TABLE));

function byPalier(cycle3, cycle4, lycee, universite) {
  return Object.freeze({
    cycle3,
    cycle4,
    [ETAPE_LYCEE]: lycee,
    [ETAPE_UNIVERSITE]: universite,
  });
}

/**
 * Règles de palier. Valeurs S0 = sans effet (comportement actuel) :
 * - `glossary_depth_max` : profondeur maximale de glossaire liée et listée par défaut
 *   (`GLOSSARY_NIVEAU_ENUM`), `null` = pas de filtre ;
 * - `quiz_entry_palier_max` : palier d'entrée maximal d'une question, `null` = pas de plafond
 *   supplémentaire ;
 * - `foodweb_types_cycle4_only` : types d'interaction réservés au cycle 4 et au-delà (masqués
 *   en `cycle3`), `[]` = aucun.
 */
const PALIER_RULES_TABLE = Object.freeze({
  glossary_depth_max: byPalier(null, null, null, null),
  quiz_entry_palier_max: byPalier(null, null, null, null),
  foodweb_types_cycle4_only: byPalier(
    Object.freeze([]),
    Object.freeze([]),
    Object.freeze([]),
    Object.freeze([]),
  ),
});

/** Liste des règles de palier connues. */
const PEDAGO_PALIER_RULES = Object.freeze(Object.keys(PALIER_RULES_TABLE));

function normalizeEtape(value) {
  if (value == null || value === '') return null;
  const key = String(value).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return PEDAGO_ETAPE_ENUM.values.includes(key) ? key : null;
}

/**
 * Profil d'affichage d'un apprenant. Accepte l'objet `learner` de `resolveLearnerLevel`
 * (`etape`) ou, par compatibilité, une étape seule (`'college'`…).
 * @param {object|string|null|undefined} learner
 * @returns {'college'|'lycee'|'universite'}
 */
function visibilityProfileFor(learner) {
  const raw = learner && typeof learner === 'object' ? learner.etape : learner;
  return normalizeEtape(raw) || DEFAULT_VISIBILITY_PROFILE;
}

/**
 * Profil de palier d'un apprenant : `cycle3` / `cycle4` au collège (d'après `maxPalier` de la
 * classe ; inconnu → `cycle3`), sinon l'étape.
 * @param {object|string|null|undefined} learner
 * @returns {'cycle3'|'cycle4'|'lycee'|'universite'}
 */
function palierProfileFor(learner) {
  const profile = visibilityProfileFor(learner);
  if (profile !== ETAPE_COLLEGE) return profile;
  const maxPalier = learner && typeof learner === 'object' ? Number(learner.maxPalier) : NaN;
  return Number.isFinite(maxPalier) && maxPalier >= CYCLE4_PALIER ? 'cycle4' : 'cycle3';
}

/**
 * Valeur d'une brique d'affichage pour un apprenant. Clé inconnue : `'show'` (comportement
 * historique de l'ancien `switch`).
 * @param {string} feature
 * @param {object|string|null|undefined} learner
 */
function visibilityFor(feature, learner) {
  const row = Object.prototype.hasOwnProperty.call(VISIBILITY_TABLE, feature)
    ? VISIBILITY_TABLE[feature]
    : null;
  if (!row) return 'show';
  return row[visibilityProfileFor(learner)];
}

/** Vrai sauf si la brique est masquée (`'hide'`). */
function canShowFor(feature, learner) {
  return visibilityFor(feature, learner) !== 'hide';
}

/**
 * Valeur d'une règle de palier pour un apprenant. Règle inconnue : `null`.
 * @param {string} rule
 * @param {object|string|null|undefined} learner
 */
function palierRuleFor(rule, learner) {
  const row = Object.prototype.hasOwnProperty.call(PALIER_RULES_TABLE, rule)
    ? PALIER_RULES_TABLE[rule]
    : null;
  if (!row) return null;
  return row[palierProfileFor(learner)];
}

module.exports = {
  DEFAULT_VISIBILITY_PROFILE,
  VISIBILITY_VALUES,
  PALIER_PROFILES,
  VISIBILITY_TABLE,
  PEDAGO_VISIBILITY_FEATURES,
  PALIER_RULES_TABLE,
  PEDAGO_PALIER_RULES,
  visibilityProfileFor,
  palierProfileFor,
  visibilityFor,
  canShowFor,
  palierRuleFor,
};
