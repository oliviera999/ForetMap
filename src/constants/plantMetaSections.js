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
      { key: 'group_1', label: 'Groupe (taxon) 1' },
      { key: 'group_2', label: 'Groupe (taxon) 2' },
      { key: 'group_3', label: 'Groupe (taxon) 3' },
      { key: 'group_4', label: 'Groupe (taxon) 4' },
      { key: 'geographic_origin', label: 'Origine géographique' },
      { key: 'longevity', label: 'Longévité' },
      { key: 'size', label: 'Taille' },
      { key: 'reproduction', label: 'Reproduction' },
    ],
  },
  {
    title: 'Écologie et usages',
    items: [
      { key: 'habitat', label: 'Habitat' },
      { key: 'agroecosystem_category', label: "Catégorie de l'agrosystème" },
      { key: 'harvest_part', label: 'Partie à récolter' },
      { key: 'planting_recommendations', label: 'Recommandations de plantation' },
      { key: 'preferred_nutrients', label: 'Nutriments préférés' },
      { key: 'nutrition', label: 'Nutrition' },
      { key: 'ideal_temperature_c', label: 'Température idéale (°C)' },
      { key: 'optimal_ph', label: 'pH optimal' },
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

export const PHOTO_FIELD_KEYS = new Set([
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
]);
