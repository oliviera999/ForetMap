/**
 * Modèle des sections de métadonnées d'une fiche plante — extrait de `foretmap-views.jsx` (O6).
 * Partagé entre l'affichage (`PlantMetaSections`) et le formulaire d'édition (`PlantEditForm`).
 */

export const PLANT_META_SECTIONS = [
  {
    title: 'Identité',
    items: [
      { key: 'second_name', label: 'Deuxième nom' },
      { key: 'scientific_name', label: 'Nom scientifique (usage)' },
      { key: 'accepted_scientific_name', label: 'Nom accepté (GBIF)' },
      { key: 'taxon_kingdom', label: 'Règne (taxon)' },
      { key: 'taxon_phylum', label: 'Embranchement (latin)' },
      { key: 'taxon_class', label: 'Classe (latin)' },
      { key: 'taxon_order', label: 'Ordre (latin)' },
      { key: 'taxon_group', label: 'Grand groupe' },
      { key: 'taxon_family', label: 'Famille (vernaculaire)' },
      { key: 'taxon_family_latin', label: 'Famille (latin)' },
      { key: 'taxon_genus', label: 'Genre' },
      { key: 'gbif_key', label: 'Clé GBIF (usage)' },
      { key: 'gbif_accepted_key', label: 'Clé GBIF (accepté)' },
      { key: 'gbif_checked_at', label: 'Vérifié GBIF le' },
      { key: 'geographic_origin', label: 'Origine géographique' },
      {
        key: 'origin_status',
        label: 'Statut biogéographique',
        select: 'origin_status',
        valueLabels: {
          indigene: 'Indigène',
          introduit: 'Introduit',
          envahissant: 'Envahissant',
          endemique: 'Endémique',
          domestique: 'Domestique',
        },
      },
      {
        key: 'iucn_status',
        label: 'Statut UICN',
        select: 'iucn_status',
        valueLabels: {
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
      },
      { key: 'life_cycle', label: 'Cycle de vie' },
      { key: 'size', label: 'Taille' },
      { key: 'reproduction', label: 'Reproduction' },
    ],
  },
  {
    title: 'Écologie et usages',
    items: [
      { key: 'habitat', label: 'Habitat (texte)' },
      { key: 'habitat_type', label: 'Milieu (terrestre/aquatique)', select: 'habitat_type' },
      { key: 'trophic_role', label: 'Rôle trophique', select: 'trophic_role' },
      { key: 'is_edible', label: 'Comestible (oui/non)', select: 'is_edible' },
      { key: 'harvest_part', label: 'Partie à récolter' },
      { key: 'planting_recommendations', label: 'Recommandations de plantation' },
      { key: 'preferred_nutrients', label: 'Nutriments préférés' },
      { key: 'nutrition', label: 'Nutrition' },
      { key: 'temp_min_c', label: 'Température min (°C)' },
      { key: 'temp_max_c', label: 'Température max (°C)' },
      { key: 'ph_min', label: 'pH min' },
      { key: 'ph_max', label: 'pH max' },
    ],
  },
  {
    title: 'Ressources',
    items: [
      { key: 'sources', label: 'Sources', links: true },
      { key: 'photo', label: 'Photo', links: true },
      { key: 'photo_credit', label: 'Crédit photo' },
      { key: 'photo_licence', label: 'Licence photo' },
      { key: 'photo_species', label: 'Photo espèce', links: true },
      { key: 'photo_leaf', label: 'Photo feuille', links: true },
      { key: 'photo_flower', label: 'Photo fleur', links: true },
      { key: 'photo_fruit', label: 'Photo fruit', links: true },
      { key: 'photo_harvest_part', label: 'Photo partie à récolter', links: true },
    ],
  },
];

/**
 * Champs de la section « Détermination » — partagés entre l'affichage
 * (`PlantDeterminationSection`) et le formulaire d'édition (`PlantEditForm`).
 *
 * Volontairement neutres vis-à-vis du règne : le catalogue mêle végétaux, animaux,
 * champignons, micro-organismes et fiches-ressources. Les libellés parlent de
 * « caractères observables » et de « stade », jamais de feuille ni de fleur — un
 * intitulé botanique rendrait la section inutilisable sur la moitié du catalogue.
 *
 * `lookalike_species` est mis en avant à l'affichage (encadré d'alerte) : la forêt est
 * comestible et les élèves récoltent, la confusion est l'information à ne pas manquer.
 */
export const PLANT_DETERMINATION_FIELDS = [
  {
    key: 'identification_criteria',
    label: 'Critères de détermination',
    placeholder:
      'Ce qu’il faut observer pour être sûr : silhouette, taille, couleurs, nervures, nombre de pattes, lames, odeur, traces…',
    rows: 3,
    long: true,
  },
  {
    key: 'lookalike_species',
    label: 'Confusions possibles',
    placeholder:
      'Espèces ressemblantes et critère qui tranche. Signaler toute ressemblance avec une espèce toxique ou piquante.',
    rows: 3,
    long: true,
  },
  {
    key: 'identification_period',
    label: 'Quand l’observer',
    placeholder: 'Saison, moment de la journée, stade (floraison, fructification, mue…)',
    rows: 1,
    long: false,
  },
];

/**
 * Niveaux de gravité du danger — parité avec l'ENUM SQL `plants.toxicity_level` et
 * `lib/plantHazard.js`. L'ordre est celui de la gravité croissante, pas celui du menu :
 * le formulaire l'affiche tel quel, du moins grave au plus grave.
 */
export const TOXICITY_LEVEL_OPTIONS = [
  { value: 'aucune', label: 'Aucun danger connu' },
  { value: 'irritation', label: 'Irritation' },
  { value: 'toxique', label: 'Toxique' },
  { value: 'mortel', label: 'Potentiellement mortel' },
];

/** Voies d'exposition — parité avec le SET SQL `plants.hazard_exposure`. */
export const HAZARD_EXPOSURE_OPTIONS = [
  { value: 'ingestion', label: 'Ingestion' },
  { value: 'contact', label: 'Contact avec la peau' },
  { value: 'inhalation', label: 'Inhalation' },
  { value: 'projection_oculaire', label: 'Projection dans l’œil' },
  { value: 'piqure_morsure', label: 'Piqûre ou morsure' },
  { value: 'seve_latex', label: 'Sève ou latex' },
];

/**
 * Risques sanitaires — parité avec le SET SQL `plants.health_risk` et `lib/plantHealthRisk.js`.
 *
 * Séparés de la toxicité : la rage ou le tétanos ne rendent pas l'espèce toxique, elles la
 * rendent porteuse. Les deux blocs cohabitent sur la fiche sans se confondre.
 */
export const HEALTH_RISK_OPTIONS = [
  { value: 'rage', label: 'Rage' },
  { value: 'tetanos', label: 'Tétanos' },
  { value: 'salmonellose', label: 'Salmonellose' },
  { value: 'leptospirose', label: 'Leptospirose' },
  { value: 'toxoplasmose', label: 'Toxoplasmose' },
  { value: 'vecteur', label: 'Vecteur de maladie' },
  { value: 'allergie', label: 'Allergie' },
];

export const TOXICITY_LEVEL_LABELS = Object.fromEntries(
  TOXICITY_LEVEL_OPTIONS.map((entry) => [entry.value, entry.label]),
);

export const HEALTH_RISK_LABELS = Object.fromEntries(
  HEALTH_RISK_OPTIONS.map((entry) => [entry.value, entry.label]),
);

export const HAZARD_EXPOSURE_LABELS = Object.fromEntries(
  HAZARD_EXPOSURE_OPTIONS.map((entry) => [entry.value, entry.label]),
);

export const PHOTO_FIELD_KEYS = new Set([
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
]);

/** Champs photo du formulaire (ordre affichage upload + menu pré-saisie). */
export const PLANT_PHOTO_FIELD_OPTIONS = [
  { key: 'photo_species', label: 'Photo espèce' },
  { key: 'photo_leaf', label: 'Photo feuille' },
  { key: 'photo_flower', label: 'Photo fleur' },
  { key: 'photo_fruit', label: 'Photo fruit' },
  { key: 'photo_harvest_part', label: 'Photo partie récoltée' },
  { key: 'photo', label: 'Photo (générale)' },
];
