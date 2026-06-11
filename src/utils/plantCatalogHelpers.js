/**
 * Helpers purs du catalogue biodiversité — extraits de `foretmap-views.jsx` (O6).
 *
 * Fonctions sans React/DOM/hooks :
 * - Détection des fiches « végétal » (groupe 1 contenant « végétal ») pour
 *   l'affichage des badges nutritionnels.
 * - Extraction normalisée du formulaire plante à partir d'une fiche existante.
 * - Regroupement des zones/repères par carte pour les mini-cartes de localisation.
 * - Génération de la clé de slot pour les photos de pré-saisie.
 *
 * Dépend de `plantFormValues.js` (`normalizedPlantValue`) qui est déjà extrait.
 */

import { normalizedPlantValue } from './plantFormValues.js';

/** Champs du formulaire plante (valeurs par défaut = chaînes vides). */
export const EMPTY_PLANT_FORM = {
  name: '',
  emoji: '🌱',
  description: '',
  second_name: '',
  scientific_name: '',
  group_1: '',
  group_2: '',
  group_3: '',
  group_4: '',
  habitat: '',
  photo: '',
  nutrition: '',
  agroecosystem_category: '',
  longevity: '',
  remark_1: '',
  remark_2: '',
  remark_3: '',
  reproduction: '',
  size: '',
  sources: '',
  ideal_temperature_c: '',
  optimal_ph: '',
  ecosystem_role: '',
  geographic_origin: '',
  human_utility: '',
  harvest_part: '',
  planting_recommendations: '',
  preferred_nutrients: '',
  photo_species: '',
  photo_leaf: '',
  photo_flower: '',
  photo_fruit: '',
  photo_harvest_part: '',
};

/**
 * Retourne `true` si le groupe taxonomique 1 de la fiche indique « Végétal »
 * (ex. « Végétal (Chlorobiontes) »). Utilisé pour adapter l'affichage des badges
 * nutritionnels (les végétaux autotrophes n'affichent pas « nutrition » mais
 * « nutriments préférés »).
 *
 * @param {{ group_1?: unknown }} plant
 * @returns {boolean}
 */
export function isVegetalCatalogEntry(plant) {
  const g1 = (normalizedPlantValue(plant.group_1) || '').toLowerCase();
  return g1.includes('végétal');
}

/**
 * Extrait un objet formulaire normalisé à partir d'une fiche plante existante.
 * Garantit que tous les champs de `EMPTY_PLANT_FORM` sont présents (chaîne vide si absent),
 * et que l'emoji n'est jamais vide (valeur de repli : '🌱').
 *
 * @param {Record<string, unknown>} [plant]
 * @returns {typeof EMPTY_PLANT_FORM}
 */
export function extractPlantForm(plant = {}) {
  const form = { ...EMPTY_PLANT_FORM };
  Object.keys(form).forEach((k) => {
    form[k] = normalizedPlantValue(plant[k]);
  });
  if (!form.emoji) form.emoji = '🌱';
  return form;
}

/**
 * Regroupe les zones et repères par `map_id` pour les mini-cartes de localisation.
 *
 * Les entrées sans `map_id` (null, vide, etc.) sont rattachées à l'identifiant
 * de repli `'foret'`.
 *
 * @param {Array<{ map_id?: unknown }>} [zoneList]
 * @param {Array<{ map_id?: unknown }>} [markerList]
 * @returns {Map<string, { zones: unknown[], markers: unknown[] }>}
 */
export function groupPlantLocationsByMap(zoneList, markerList) {
  const map = new Map();
  const ensure = (mapId) => {
    const id =
      mapId && String(mapId).trim() ? String(mapId).trim() : 'foret';
    if (!map.has(id)) map.set(id, { zones: [], markers: [] });
    return id;
  };
  for (const z of zoneList || []) {
    const id = ensure(z.map_id);
    map.get(id).zones.push(z);
  }
  for (const m of markerList || []) {
    const id = ensure(m.map_id);
    map.get(id).markers.push(m);
  }
  return map;
}

/**
 * Génère la clé unique d'un slot de photo de pré-saisie.
 * Format : `"${field}:${idx}"` — utilisé pour identifier chaque proposition
 * photo dans `prefillPhotoSelections`.
 *
 * @param {string} field - Clé du champ photo (ex. `'photo_species'`).
 * @param {number} idx - Index de la photo dans la liste du champ.
 * @returns {string}
 */
export function prefillPhotoSlotKey(field, idx) {
  return `${String(field).trim()}:${Number(idx)}`;
}
