/**
 * Catégories réglées par carte (« Cartographie → Cartes », migration 318) : catégories
 * cochées d'office et catégories cachées, portées par chaque carte de `GET /api/maps`
 * (`default_category_ids`, `hidden_category_ids`, déjà ramenées par le serveur aux
 * catégories qui concernent la carte).
 */
import { parseCategoryIdsSetting } from './categoryIdsSetting.js';
import { locationCategoryIds } from './locationCategories.js';

/** Liste d'ids reçue (tableau ou chaîne `;`-séparée) → tableau de chaînes dédoublonné. */
export function mapCategoryIdList(raw) {
  const list = Array.isArray(raw)
    ? raw.map((v) => String(v ?? '').trim())
    : parseCategoryIdsSetting(raw);
  return [...new Set(list.filter(Boolean))];
}

/** Catégories cochées d'office sur une carte, hors catégories cachées. */
export function mapDefaultCategoryIds(map) {
  const hidden = new Set(mapCategoryIdList(map?.hidden_category_ids));
  return mapCategoryIdList(map?.default_category_ids).filter((id) => !hidden.has(id));
}

/** `Map` id de carte → `Set` des catégories cachées (cartes sans masquage omises). */
export function hiddenCategoryIdsByMap(maps) {
  const out = new Map();
  for (const map of maps || []) {
    const ids = mapCategoryIdList(map?.hidden_category_ids);
    if (map?.id != null && ids.length) out.set(String(map.id), new Set(ids));
  }
  return out;
}

/**
 * Un lieu survit-il au masquage ? Même règle que le Plan (`placeSurvivesHiddenCategories`,
 * `lib/categoryIdsSetting.js`) : sans catégorie → oui ; sinon il lui faut au moins une
 * catégorie non cachée.
 */
export function placeSurvivesHiddenCategories(place, hiddenIds) {
  if (!hiddenIds || !hiddenIds.size) return true;
  const ids = locationCategoryIds(place);
  if (!ids.length) return true;
  return ids.some((id) => !hiddenIds.has(id));
}

/** Retire les lieux dont toutes les catégories sont cachées sur leur propre carte. */
export function filterPlacesByHiddenCategories(places, hiddenByMap) {
  const list = Array.isArray(places) ? places : [];
  if (!hiddenByMap || !hiddenByMap.size) return list;
  return list.filter((place) =>
    placeSurvivesHiddenCategories(place, hiddenByMap.get(String(place?.map_id ?? ''))),
  );
}
