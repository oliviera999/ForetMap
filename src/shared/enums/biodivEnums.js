/**
 * Référentiel des valeurs énumérées — domaine **biodiversité** (fiches espèces, interactions
 * du réseau trophique, présence d'une espèce sur une carte). Voir `enumCore.js`.
 *
 * Les libellés reprennent ceux des écrans existants (formulaire de fiche, réseau trophique).
 * Les quatre colonnes de `map_species` n'ont encore **aucun écran** (audit du 25/09/2026,
 * § 1.2.6) : leurs libellés sont proposés ici pour le jour où elles seront affichées.
 *
 * Miroir CJS : `lib/shared/biodivEnums.js` (généré, ne pas éditer).
 */

import { defineEnum, defineSubset } from './enumCore.js';

/** Milieu de vie. */
export const HABITAT_TYPE_ENUM = defineEnum('HABITAT_TYPE_ENUM', {
  values: ['terrestre', 'aquatique', 'les_deux'],
  labels: { terrestre: 'Terrestre', aquatique: 'Aquatique', les_deux: 'Terrestre & aquatique' },
  columns: ['plants.habitat_type'],
});

/**
 * Rôle trophique. `detritivore` (migration 295) : l'animal qui fragmente la matière morte,
 * distinct du décomposeur qui la minéralise. L'ordre suit la chaîne de la matière.
 */
export const TROPHIC_ROLE_ENUM = defineEnum('TROPHIC_ROLE_ENUM', {
  values: ['producteur', 'consommateur', 'detritivore', 'decomposeur'],
  labels: {
    producteur: 'Producteur',
    consommateur: 'Consommateur',
    detritivore: 'Détritivore',
    decomposeur: 'Décomposeur',
  },
  columns: ['plants.trophic_role'],
});

/**
 * Nature d'une fiche du catalogue (migration `plants_entity_kind`). Tout n'y est pas une
 * espèce : un groupe fonctionnel (plancton), un consortium (lichen, biofilm) et une ressource
 * non vivante (litière, compost) ont aussi leur fiche, parce que le réseau trophique en a
 * besoin.
 */
export const ENTITY_KIND_ENUM = defineEnum('ENTITY_KIND_ENUM', {
  values: ['taxon', 'groupe_fonctionnel', 'consortium', 'ressource'],
  labels: {
    taxon: 'Espèce ou groupe d’espèces',
    groupe_fonctionnel: 'Groupe fonctionnel',
    consortium: 'Association d’êtres vivants',
    ressource: 'Ressource non vivante',
  },
  columns: ['plants.entity_kind'],
});

/** Nature par défaut d'une fiche (valeur par défaut de la colonne). */
export const ENTITY_KIND_DEFAULT = 'taxon';

/**
 * Natures absentes de la liste et de la recherche des **élèves** : une ressource n'est pas un
 * être vivant. Ces fiches restent dans le réseau trophique, les liens, les clés et la gestion.
 */
export const STUDENT_HIDDEN_ENTITY_KINDS = Object.freeze(['ressource']);

/**
 * Natures **toujours dans le périmètre** d'une carte ou d'une zone du réseau trophique (chantier
 * collège du 22/11/2026, lot 1) : une ressource (compost, litière, bois mort), un consortium
 * (biofilm) ou un groupe fonctionnel (plancton) n'est jamais rattaché à une carte, comme
 * l'extrémité « environnement » d'un lien (`to_id` nul). Une relation qui y mène n'est donc
 * jamais marquée « hors carte » de ce côté. Lu par `routes/food-web.js` (colonnes
 * `from_in_scope` / `to_in_scope`) : c'est la seule définition du périmètre côté données.
 */
export const FOODWEB_ALWAYS_IN_SCOPE_ENTITY_KINDS = Object.freeze(
  ENTITY_KIND_ENUM.values.filter((kind) => kind !== ENTITY_KIND_DEFAULT),
);

/**
 * La fiche est-elle masquée de la liste et de la recherche des élèves ?
 * Une fiche sans nature connue (base non migrée, objet partiel) n'est jamais masquée.
 * @param {{ entity_kind?: string|null }|null|undefined} plant
 * @returns {boolean}
 */
export function isStudentHiddenEntity(plant) {
  return STUDENT_HIDDEN_ENTITY_KINDS.includes(String(plant?.entity_kind || ''));
}

/** Cycle de vie. */
export const LIFE_CYCLE_ENUM = defineEnum('LIFE_CYCLE_ENUM', {
  values: ['annuelle', 'bisannuelle', 'vivace', 'variable'],
  labels: {
    annuelle: 'Annuelle',
    bisannuelle: 'Bisannuelle',
    vivace: 'Vivace',
    variable: 'Variable',
  },
  columns: ['plants.life_cycle'],
});

/** Statut biogéographique. */
export const ORIGIN_STATUS_ENUM = defineEnum('ORIGIN_STATUS_ENUM', {
  values: ['indigene', 'introduit', 'envahissant', 'endemique', 'domestique'],
  labels: {
    indigene: 'Indigène',
    introduit: 'Introduit',
    envahissant: 'Envahissant',
    endemique: 'Endémique',
    domestique: 'Domestique',
  },
  columns: ['plants.origin_status'],
});

/** Catégorie de la liste rouge de l'UICN. */
export const IUCN_STATUS_ENUM = defineEnum('IUCN_STATUS_ENUM', {
  values: ['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE'],
  labels: {
    EX: 'EX — Éteinte',
    EW: 'EW — Éteinte à l’état sauvage',
    CR: 'CR — En danger critique',
    EN: 'EN — En danger',
    VU: 'VU — Vulnérable',
    NT: 'NT — Quasi menacée',
    LC: 'LC — Préoccupation mineure',
    DD: 'DD — Données insuffisantes',
    NE: 'NE — Non évaluée',
  },
  columns: ['plants.iucn_status'],
});

/** Gravité du danger, du moins grave au plus grave. */
export const TOXICITY_LEVEL_ENUM = defineEnum('TOXICITY_LEVEL_ENUM', {
  values: ['aucune', 'irritation', 'toxique', 'mortel'],
  labels: {
    aucune: 'Aucun danger connu',
    irritation: 'Irritation',
    toxique: 'Toxique',
    mortel: 'Potentiellement mortel',
  },
  columns: ['plants.toxicity_level'],
});

/** Voies d'exposition (SET). */
export const HAZARD_EXPOSURE_ENUM = defineEnum('HAZARD_EXPOSURE_ENUM', {
  values: [
    'ingestion',
    'contact',
    'inhalation',
    'projection_oculaire',
    'piqure_morsure',
    'seve_latex',
  ],
  labels: {
    ingestion: 'Ingestion',
    contact: 'Contact avec la peau',
    inhalation: 'Inhalation',
    projection_oculaire: 'Projection dans l’œil',
    piqure_morsure: 'Piqûre ou morsure',
    seve_latex: 'Sève ou latex',
  },
  columns: ['plants.hazard_exposure'],
});

/** Risques sanitaires (SET) : l'espèce est porteuse, pas toxique. */
export const HEALTH_RISK_ENUM = defineEnum('HEALTH_RISK_ENUM', {
  values: [
    'rage',
    'tetanos',
    'salmonellose',
    'leptospirose',
    'toxoplasmose',
    'vecteur',
    'allergie',
  ],
  labels: {
    rage: 'Rage',
    tetanos: 'Tétanos',
    salmonellose: 'Salmonellose',
    leptospirose: 'Leptospirose',
    toxoplasmose: 'Toxoplasmose',
    vecteur: 'Vecteur de maladie',
    allergie: 'Allergie',
  },
  columns: ['plants.health_risk'],
});

/** Type d'interaction biotique (réseau trophique). */
export const INTERACTION_TYPE_ENUM = defineEnum('INTERACTION_TYPE_ENUM', {
  values: [
    'pollinisation',
    'herbivorie',
    'predation',
    'plante_hote',
    'decomposition',
    'nitrification',
    'symbiose',
    'competition',
    'detritivorie',
    'frugivorie',
    'granivorie',
    'parasitisme',
    'excretion',
    'assimilation',
    'mutualisme',
    'commensalisme',
    'mycophagie',
    'allelopathie',
    'facilitation',
  ],
  labels: {
    pollinisation: 'Pollinisation',
    herbivorie: 'Herbivorie',
    predation: 'Prédation',
    plante_hote: 'Plante hôte',
    decomposition: 'Décomposition',
    nitrification: 'Nitrification',
    symbiose: 'Symbiose',
    competition: 'Compétition',
    detritivorie: 'Détritivorie',
    frugivorie: 'Frugivorie',
    granivorie: 'Granivorie',
    parasitisme: 'Parasitisme',
    excretion: 'Excrétion',
    assimilation: 'Assimilation',
    mutualisme: 'Mutualisme',
    commensalisme: 'Commensalisme',
    mycophagie: 'Mycophagie',
    allelopathie: 'Allélopathie',
    facilitation: 'Facilitation',
  },
  columns: ['species_interactions.interaction_type'],
});

/**
 * Libellés « collège » des types d'interaction : un **verbe** que l'élève comprend sans le mot
 * savant, qui vient en second (« mange des fruits (frugivorie) »). Chantier collège du
 * 21/11/2026 (flux C3). Le verbe décrit l'**acteur** du lien stocké (`from_id`) : c'est la
 * phrase « l'espèce … mange des plantes ».
 */
const COLLEGE_INTERACTION_LABELS_SIMPLE = Object.freeze({
  pollinisation: 'pollinise',
  herbivorie: 'mange des plantes',
  frugivorie: 'mange des fruits',
  granivorie: 'mange des graines',
  predation: 'mange des animaux',
  plante_hote: 'pond sur',
  decomposition: 'décompose',
  detritivorie: 'mange des débris',
  parasitisme: 'parasite',
  competition: 'est en concurrence avec',
  symbiose: 'vit associée à',
});

/**
 * Types d'interaction montrés au niveau Collège (réseau trophique « scolaire »). Sous-ensemble
 * volontaire ; `detritivorie` en fait partie depuis la migration 295, `frugivorie` et
 * `granivorie` depuis le chantier collège (décision 8 du 21/11/2026 : montrées à tout le
 * collège). `labelsSimple` : un libellé en verbe par valeur (voir ci-dessus) ; le libellé
 * savant reste `labels`.
 */
export const COLLEGE_INTERACTION_TYPE_ENUM = Object.freeze({
  ...defineSubset('COLLEGE_INTERACTION_TYPE_ENUM', INTERACTION_TYPE_ENUM, 'INTERACTION_TYPE_ENUM', {
    values: [
      'pollinisation',
      'herbivorie',
      'frugivorie',
      'granivorie',
      'predation',
      'plante_hote',
      'decomposition',
      'detritivorie',
      'parasitisme',
      'competition',
      'symbiose',
    ],
  }),
  labelsSimple: COLLEGE_INTERACTION_LABELS_SIMPLE,
});

/**
 * Libellé collège d'un type d'interaction : le verbe, suivi du mot savant entre parenthèses
 * (`withScientific`, par défaut). Un type sans verbe (hors sous-ensemble collège) rend son
 * libellé savant ; un type inconnu, `fallback`.
 *
 * @param {string} type
 * @param {{ withScientific?: boolean, fallback?: string }} [options]
 * @returns {string}
 */
export function interactionTypeLabelSimple(type, { withScientific = true, fallback = '' } = {}) {
  const key = String(type || '')
    .trim()
    .toLowerCase();
  const scientific = INTERACTION_TYPE_ENUM.labels[key];
  if (!scientific) return fallback || String(type || '');
  const verb = COLLEGE_INTERACTION_LABELS_SIMPLE[key];
  if (!verb) return scientific;
  return withScientific ? `${verb} (${scientific.toLowerCase()})` : verb;
}

/**
 * Types d'interaction réservés au **cycle 4** et au-delà (décision 8 du 21/11/2026) : masqués
 * en cycle 3 par la règle de palier `foodweb_types_cycle4_only` de la table de visibilité
 * (`src/shared/pedagoVisibilityCore.js`). Sous-ensemble de `COLLEGE_INTERACTION_TYPE_ENUM`.
 * Appliqué depuis le flux C1 : la règle masque ces types au cycle 3 (`[]` ailleurs).
 */
export const CYCLE4_ONLY_INTERACTION_TYPE_ENUM = defineSubset(
  'CYCLE4_ONLY_INTERACTION_TYPE_ENUM',
  INTERACTION_TYPE_ENUM,
  'INTERACTION_TYPE_ENUM',
  { values: ['symbiose', 'competition'] },
);

/** Niveau de preuve d'une interaction. */
export const EVIDENCE_LEVEL_ENUM = defineEnum('EVIDENCE_LEVEL_ENUM', {
  values: ['bibliographie', 'observe_site', 'hypothese'],
  labels: {
    bibliographie: 'Documenté',
    observe_site: 'Observé sur le site',
    hypothese: 'Hypothèse',
  },
  columns: ['species_interactions.evidence_level'],
});

/** Efficacité d'un pollinisateur (type `pollinisation` seulement). */
export const POLLINATION_EFFICACY_ENUM = defineEnum('POLLINATION_EFFICACY_ENUM', {
  values: ['efficace', 'accessoire', 'visiteur', 'voleur_nectar'],
  labels: {
    efficace: 'Pollinisateur efficace',
    accessoire: 'Pollinisateur accessoire',
    visiteur: 'Simple visiteur',
    voleur_nectar: 'Voleur de nectar',
  },
  columns: ['species_interactions.pollination_efficacy'],
});

/** Statut phénologique d'une espèce sur une carte. */
export const PRESENCE_STATUS_ENUM = defineEnum('PRESENCE_STATUS_ENUM', {
  values: [
    'resident',
    'nicheur_migrateur',
    'hivernant',
    'passage',
    'erratique',
    'introduit',
    'veille',
  ],
  labels: {
    resident: 'Résident',
    nicheur_migrateur: 'Nicheur migrateur',
    hivernant: 'Hivernant',
    passage: 'De passage',
    erratique: 'Erratique',
    introduit: 'Introduit',
    veille: 'Sous surveillance',
  },
  columns: ['map_species.presence_status'],
});

/** Mode de contact sur le terrain (SET). */
export const DETECTION_MODE_ENUM = defineEnum('DETECTION_MODE_ENUM', {
  values: ['vue', 'chant', 'trace', 'indice', 'nocturne'],
  labels: {
    vue: 'Vue',
    chant: 'Chant',
    trace: 'Trace',
    indice: 'Indice',
    nocturne: 'Nocturne',
  },
  // Même vocabulaire pour une observation d'élève (migration 307), en ENUM à une valeur.
  columns: ['map_species.detection_mode', 'species_observations.detection_mode'],
});

/** Fréquence de contact attendue. */
export const SPECIES_FREQUENCY_ENUM = defineEnum('SPECIES_FREQUENCY_ENUM', {
  values: ['commun', 'regulier', 'occasionnel', 'rare'],
  labels: {
    commun: 'Commun',
    regulier: 'Régulier',
    occasionnel: 'Occasionnel',
    rare: 'Rare',
  },
  columns: ['map_species.frequency'],
});

/**
 * Niveau de certitude de la présence sur le site. `confirme_site` est posé par la validation
 * d'une observation d'élève (migration 307, `lib/terrain/observationService.js`).
 */
export const PRESENCE_VALIDATION_STATUS_ENUM = defineEnum('PRESENCE_VALIDATION_STATUS_ENUM', {
  values: ['confirme_site', 'attendu', 'a_confirmer', 'documentaire'],
  labels: {
    confirme_site: 'Confirmé sur le site',
    attendu: 'Attendu',
    a_confirmer: 'À confirmer',
    documentaire: 'Documentaire',
  },
  columns: ['map_species.validation_status'],
});

/** Rôle d'une photo de fiche (migration 303) : une valeur par ancienne colonne photo. */
export const PLANT_PHOTO_KIND_ENUM = defineEnum('PLANT_PHOTO_KIND_ENUM', {
  values: [
    'photo',
    'photo_species',
    'photo_leaf',
    'photo_flower',
    'photo_fruit',
    'photo_harvest_part',
  ],
  labels: {
    photo: 'Photo',
    photo_species: 'Photo espèce',
    photo_leaf: 'Photo feuille',
    photo_flower: 'Photo fleur',
    photo_fruit: 'Photo fruit',
    photo_harvest_part: 'Photo partie récoltée',
  },
  columns: ['plant_photos.kind'],
});

/** Nature d'un nom rattaché à une fiche (migration 304). */
export const PLANT_NAME_ALIAS_KIND_ENUM = defineEnum('PLANT_NAME_ALIAS_KIND_ENUM', {
  values: ['nom_secondaire', 'variante', 'synonyme'],
  labels: {
    nom_secondaire: 'Autre nom',
    variante: 'Variante',
    synonyme: 'Synonyme',
  },
  columns: ['plant_name_aliases.kind'],
});
