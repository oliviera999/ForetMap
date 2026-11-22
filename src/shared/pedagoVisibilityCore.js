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
 * Profil `college` simplifié (flux C1) : vocabulaire savant, sections d'identité et d'écologie,
 * jauges et pastille Nutrition masqués ; étiquette simple et description collège montrées ;
 * statut UICN en mots ; réseau et arbre des groupes bornés ; catalogue groupé, espèces phares
 * en tête, douze vignettes par zone. Profils `lycee` et `universite` : comportement d'avant le
 * chantier. Les flux C2 à C6 codent le comportement collège **derrière** ces clés
 * (`visibilityFor` / `palierRuleFor`, ou `canShow` / `visibility` / `palierRule` du contexte
 * `BiodivPedagoContext`).
 *
 * Aucune I/O, aucun import hors référentiels partagés. Miroir CJS : `lib/shared/pedagoVisibilityCore.js`
 * (généré par `npm run sync:shared-cores`, ne pas éditer).
 */

import { PEDAGO_ETAPE_ENUM, GLOSSARY_NIVEAU_ENUM } from './enums/pedagoEnums.js';
import { CYCLE4_ONLY_INTERACTION_TYPE_ENUM } from './enums/biodivEnums.js';

const [ETAPE_COLLEGE, ETAPE_LYCEE, ETAPE_UNIVERSITE] = PEDAGO_ETAPE_ENUM.values;
const [GLOSSARY_BASE, GLOSSARY_APPROFONDISSEMENT, GLOSSARY_AVANCE] = GLOSSARY_NIVEAU_ENUM.values;

/** Profil d'affichage par défaut (établissement sans réglage, apprenant inconnu). */
export const DEFAULT_VISIBILITY_PROFILE = ETAPE_COLLEGE;

/** Valeurs possibles d'une brique d'affichage (hors clés à paramètre). */
export const VISIBILITY_VALUES = Object.freeze(['hide', 'show', 'collapsed', 'open']);

/** Profils de palier, du plus simple au plus avancé. */
export const PALIER_PROFILES = Object.freeze(['cycle3', 'cycle4', ETAPE_LYCEE, ETAPE_UNIVERSITE]);

/**
 * Paliers (échelle `CURRICULUM_PALIERS` de `pedagoScales`) du cycle 3 et du cycle 4. Un
 * collégien est en cycle 4 à partir de `CYCLE4_PALIER`.
 */
const CYCLE3_PALIER = 1;
const CYCLE4_PALIER = 2;

/** Niveaux de l'apprenant qui fixent le palier `cycle3` / `cycle4` (échelle `LEARNER_NIVEAU_VALUES`). */
const COLLEGE_LEARNER_NIVEAUX = Object.freeze({ cycle3: 'cycle3', cycle4: 'cycle4' });

function byProfile(college, lycee, universite) {
  return Object.freeze({
    [ETAPE_COLLEGE]: college,
    [ETAPE_LYCEE]: lycee,
    [ETAPE_UNIVERSITE]: universite,
  });
}

const SAME_EVERYWHERE_SHOW = byProfile('show', 'show', 'show');
/** Masqué au collège seulement (lycée et université : comportement d'avant le chantier). */
const HIDE_AT_COLLEGE = byProfile('hide', 'show', 'show');

/** Plafond de vignettes d'une fiche de zone au collège (décision 4 : 12 à 20 espèces phares). */
const COLLEGE_ZONE_TILES_CAP = 12;

/**
 * Briques d'affichage. Les huit premières existaient avant le chantier (ancien `switch` de
 * `biodivFeatureVisibility`) ; les suivantes sont les clés du chantier collège.
 */
export const VISIBILITY_TABLE = Object.freeze({
  // — Clés existantes —
  accepted_name_gbif_latin: byProfile('hide', 'collapsed', 'open'),
  /** Fil des groupes de la fiche : montré au collège (l'arbre y est réduit, flux C4). */
  clade_breadcrumb: SAME_EVERYWHERE_SHOW,
  /** Onglet « Groupes » : montré au collège (arbre réduit aux groupes d'usage, flux C4). */
  nested_groups_tab: SAME_EVERYWHERE_SHOW,
  foodweb_advanced: HIDE_AT_COLLEGE,
  pollination_efficacy: HIDE_AT_COLLEGE,
  individuals_tab: HIDE_AT_COLLEGE,
  biomass_estimates: byProfile('hide', 'collapsed', 'open'),
  curriculum_notions_lycee_plus: HIDE_AT_COLLEGE,
  // — Clés du chantier collège —
  /** Ligne « Taxonomie » de la fiche espèce (remplacée au collège par le groupe d'usage). */
  taxonomy_line: HIDE_AT_COLLEGE,
  /** Sections savantes de la fiche (Identité, Écologie et usages). */
  meta_sections: HIDE_AT_COLLEGE,
  /** Jauges de plages (pH, température) et pastilles de plage. */
  range_gauges: HIDE_AT_COLLEGE,
  /** Pastille « Nutrition » de la fiche. */
  nutrition_badge: HIDE_AT_COLLEGE,
  /** Statut UICN : `'code'` (sigle) ou `'mots'` (statut écrit en toutes lettres). */
  iucn_code: byProfile('mots', 'code', 'code'),
  /** Nom scientifique sous les vignettes de la Visite. */
  visit_tile_scientific_name: HIDE_AT_COLLEGE,
  /** Étiquette simple (`plants.usage_label`) sous le nom. */
  usage_label: byProfile('show', 'hide', 'hide'),
  /** Description collège (`plants.description_college`) à la place de la description. */
  description_college: byProfile('show', 'hide', 'hide'),
  /** Espèces hors carte dans le réseau trophique. */
  foodweb_offmap_species: HIDE_AT_COLLEGE,
  /** Réseau trophique complet affiché d'emblée (sinon : choix d'une espèce de départ). */
  foodweb_full_by_default: HIDE_AT_COLLEGE,
  /** Arbre complet des groupes emboîtés (sinon : arbre réduit aux groupes d'usage). */
  nested_groups_full_tree: HIDE_AT_COLLEGE,
  /** Catalogue rangé par groupe d'usage. */
  catalog_grouped: byProfile('show', 'hide', 'hide'),
  /** Espèces phares (`map_species.is_featured`) en tête des listes. */
  featured_first: byProfile('show', 'hide', 'hide'),
  /** Plafond de vignettes d'une fiche de zone : `null` = pas de plafond. */
  zone_tiles_cap: byProfile(COLLEGE_ZONE_TILES_CAP, null, null),
});

/** Liste des briques d'affichage connues (ordre de la table). */
export const PEDAGO_VISIBILITY_FEATURES = Object.freeze(Object.keys(VISIBILITY_TABLE));

function byPalier(cycle3, cycle4, lycee, universite) {
  return Object.freeze({
    cycle3,
    cycle4,
    [ETAPE_LYCEE]: lycee,
    [ETAPE_UNIVERSITE]: universite,
  });
}

/**
 * Règles de palier :
 * - `glossary_depth_max` : profondeur maximale de glossaire liée et listée par défaut
 *   (`GLOSSARY_NIVEAU_ENUM`) — cycle 3 : `base` ; cycle 4 : `approfondissement` ; lycée :
 *   `avance` (tout) ; université : `null` (pas de filtre) ;
 * - `quiz_entry_palier_max` : palier d'entrée maximal d'une question (`CURRICULUM_PALIERS`) —
 *   le palier de la classe au collège (1 ou 2), `null` au-delà (pas de plafond supplémentaire) ;
 * - `foodweb_types_cycle4_only` : types d'interaction **masqués** pour ce profil parce qu'ils
 *   sont réservés au cycle 4 et au-delà (`CYCLE4_ONLY_INTERACTION_TYPE_ENUM` : symbiose,
 *   compétition) — la liste au cycle 3, `[]` ailleurs.
 */
const NO_TYPE = Object.freeze([]);

export const PALIER_RULES_TABLE = Object.freeze({
  glossary_depth_max: byPalier(GLOSSARY_BASE, GLOSSARY_APPROFONDISSEMENT, GLOSSARY_AVANCE, null),
  quiz_entry_palier_max: byPalier(CYCLE3_PALIER, CYCLE4_PALIER, null, null),
  foodweb_types_cycle4_only: byPalier(
    Object.freeze([...CYCLE4_ONLY_INTERACTION_TYPE_ENUM.values]),
    NO_TYPE,
    NO_TYPE,
    NO_TYPE,
  ),
});

/** Liste des règles de palier connues. */
export const PEDAGO_PALIER_RULES = Object.freeze(Object.keys(PALIER_RULES_TABLE));

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
export function visibilityProfileFor(learner) {
  const raw = learner && typeof learner === 'object' ? learner.etape : learner;
  return normalizeEtape(raw) || DEFAULT_VISIBILITY_PROFILE;
}

/**
 * Profil de palier d'un apprenant : `cycle3` / `cycle4` au collège, sinon l'étape.
 *
 * Au collège, le palier suit le **niveau** de l'apprenant (`learner.niveau` : classe, séance
 * ou aperçu du professeur). Niveau inconnu (`niveau: null` : Visite sans compte, élève sans
 * classe, repli carte ou établissement) → `cycle3`. Un niveau hors collège (lycéen qui a choisi
 * l'affichage collège) se lit sur `maxPalier`. Un objet sans clé `niveau` (forme réduite) se
 * lit sur `maxPalier` ; une étape seule (`'college'`) vaut `cycle3`.
 * @param {object|string|null|undefined} learner
 * @returns {'cycle3'|'cycle4'|'lycee'|'universite'}
 */
export function palierProfileFor(learner) {
  const profile = visibilityProfileFor(learner);
  if (profile !== ETAPE_COLLEGE) return profile;
  if (!learner || typeof learner !== 'object') return 'cycle3';
  const hasNiveau = Object.prototype.hasOwnProperty.call(learner, 'niveau');
  if (hasNiveau) {
    const niveau = learner.niveau == null ? '' : String(learner.niveau).trim().toLowerCase();
    if (!niveau) return 'cycle3';
    if (Object.prototype.hasOwnProperty.call(COLLEGE_LEARNER_NIVEAUX, niveau)) {
      return COLLEGE_LEARNER_NIVEAUX[niveau];
    }
  }
  const maxPalier = Number(learner.maxPalier);
  if (learner.maxPalier == null || !Number.isFinite(maxPalier)) {
    // Niveau hors collège sans palier (université affichée « collège ») : le plus avancé.
    return hasNiveau && learner.niveau ? 'cycle4' : 'cycle3';
  }
  return maxPalier >= CYCLE4_PALIER ? 'cycle4' : 'cycle3';
}

/**
 * Valeur d'une brique d'affichage pour un apprenant. Clé inconnue : `'show'` (comportement
 * historique de l'ancien `switch`).
 * @param {string} feature
 * @param {object|string|null|undefined} learner
 */
export function visibilityFor(feature, learner) {
  const row = Object.prototype.hasOwnProperty.call(VISIBILITY_TABLE, feature)
    ? VISIBILITY_TABLE[feature]
    : null;
  if (!row) return 'show';
  return row[visibilityProfileFor(learner)];
}

/** Vrai sauf si la brique est masquée (`'hide'`). */
export function canShowFor(feature, learner) {
  return visibilityFor(feature, learner) !== 'hide';
}

/**
 * Valeur d'une règle de palier pour un apprenant. Règle inconnue : `null`.
 * @param {string} rule
 * @param {object|string|null|undefined} learner
 */
export function palierRuleFor(rule, learner) {
  const row = Object.prototype.hasOwnProperty.call(PALIER_RULES_TABLE, rule)
    ? PALIER_RULES_TABLE[rule]
    : null;
  if (!row) return null;
  return row[palierProfileFor(learner)];
}
