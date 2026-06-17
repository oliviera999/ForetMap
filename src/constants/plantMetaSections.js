/**
 * Modèle des sections de métadonnées d'une fiche plante — extrait de `foretmap-views.jsx` (O6).
 * Partagé entre l'affichage (`PlantMetaSections`) et le formulaire d'édition (`PlantEditForm`).
 */

export const PLANT_META_SECTIONS = [
  {
    title: 'Identité',
    items: [
      { key: 'second_name', label: 'Deuxième nom' },
      { key: 'scientific_name', label: 'Nom scientifique' },
      { key: 'taxon_kingdom', label: 'Règne (taxon)' },
      { key: 'taxon_group', label: 'Grand groupe' },
      { key: 'taxon_family', label: 'Famille' },
      { key: 'taxon_genus', label: 'Genre' },
      { key: 'gbif_key', label: 'Clé GBIF' },
      { key: 'geographic_origin', label: 'Origine géographique' },
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
      { key: 'photo_species', label: 'Photo espèce', links: true },
      { key: 'photo_leaf', label: 'Photo feuille', links: true },
      { key: 'photo_flower', label: 'Photo fleur', links: true },
      { key: 'photo_fruit', label: 'Photo fruit', links: true },
      { key: 'photo_harvest_part', label: 'Photo partie à récolter', links: true },
    ],
  },
];

export const PLANT_SELECT_OPTIONS = {
  habitat_type: [
    { value: '', label: '—' },
    { value: 'terrestre', label: 'Terrestre' },
    { value: 'aquatique', label: 'Aquatique' },
    { value: 'les_deux', label: 'Terrestre & aquatique' },
  ],
  trophic_role: [
    { value: '', label: '—' },
    { value: 'producteur', label: 'Producteur' },
    { value: 'consommateur', label: 'Consommateur' },
    { value: 'decomposeur', label: 'Décomposeur' },
  ],
  is_edible: [
    { value: '', label: '—' },
    { value: '1', label: 'Oui' },
    { value: '0', label: 'Non' },
  ],
  life_cycle: [
    { value: '', label: '—' },
    { value: 'annuelle', label: 'Annuelle' },
    { value: 'bisannuelle', label: 'Bisannuelle' },
    { value: 'vivace', label: 'Vivace' },
    { value: 'variable', label: 'Variable' },
  ],
};

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
