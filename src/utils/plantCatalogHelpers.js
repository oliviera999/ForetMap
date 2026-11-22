/**
 * Helpers purs de catalogue biodiversité — extraits de `foretmap-views.jsx` (O6).
 */

import { normalizedPlantValue } from './plantFormValues.js';
import { PRESENCE_VALIDATION_STATUS_ENUM } from '../shared/enums/biodivEnums.js';
import {
  CATALOG_OTHER_GROUP_ID,
  CATALOG_OTHER_GROUP_LABEL,
  plantTaxonomyValue,
  usageGroupIdOf,
  usageGroupLabelOf,
} from './plantFilters.js';

/**
 * Vrai si la fiche relève du règne « Végétal (Chlorobiontes) » — pour ces entrées la
 * nutrition (souvent « autotrophe ») est redondante et masquée en pastille.
 *
 * Lit `taxon_kingdom` (via `plantTaxonomyValue`) : la seule lecture de `group_1`, colonne
 * supprimée en migration 129 et jamais servie par l'API, rendait toujours `false` en
 * production (flux C4, refacto). Le repli `group_1` ne reste que pour la fixture de
 * `tests-ui/components/biodiv/PlantSummaryBlocks.test.jsx` (périmètre C1) : à retirer avec
 * elle (noté pour SI).
 */
export function isVegetalCatalogEntry(plant) {
  const kingdom = plantTaxonomyValue(plant, 'kingdom') || normalizedPlantValue(plant?.group_1);
  return (kingdom || '').toLowerCase().includes('végétal');
}

// — Catalogue rangé par groupe d'usage (chantier collège, flux C4) —

const [, , PRESENCE_A_CONFIRMER, PRESENCE_DOCUMENTAIRE] = PRESENCE_VALIDATION_STATUS_ENUM.values;

/** Présences « à chercher » (décision 5 du 21/11/2026) : affichées, rangées après les autres. */
const TO_SEARCH_STATUSES = Object.freeze([PRESENCE_A_CONFIRMER, PRESENCE_DOCUMENTAIRE]);

/** Mention portée par les vignettes d'une présence `a_confirmer` ou `documentaire`. */
export const TO_SEARCH_HINT = 'à chercher';

/** Rang d'une fiche dans son groupe : plus petit = plus haut. */
export const CATALOG_PRESENCE_RANK = Object.freeze({
  FEATURED: 0,
  PRESENT: 1,
  TO_SEARCH: 2,
  ELSEWHERE: 3,
});

/** Vrai si l'entrée de présence est `a_confirmer` ou `documentaire` (registre de la carte). */
export function isToSearchPresence(entry) {
  return Boolean(entry) && TO_SEARCH_STATUSES.includes(entry.validation_status);
}

/**
 * Rang d'une fiche dans son groupe d'usage, d'après son entrée de présence sur la carte
 * active (`GET /api/maps/:id/species`) : espèce phare d'abord (si `featuredFirst`), puis
 * présence confirmée, attendue ou située (zone, repère), puis « à chercher », puis absente
 * ou présence inconnue.
 */
export function catalogPresenceRank(entry, { featuredFirst = true } = {}) {
  if (!entry) return CATALOG_PRESENCE_RANK.ELSEWHERE;
  if (featuredFirst && entry.is_featured) return CATALOG_PRESENCE_RANK.FEATURED;
  if (isToSearchPresence(entry)) return CATALOG_PRESENCE_RANK.TO_SEARCH;
  return CATALOG_PRESENCE_RANK.PRESENT;
}

/**
 * Range une liste déjà filtrée et triée en sections par groupe d'usage.
 *
 * - Sections triées par libellé (fr) ; « Autres êtres vivants » (fiches sans groupe) en
 *   dernier.
 * - Dans chaque section : rang de présence (`catalogPresenceRank`), puis l'ordre reçu (le tri
 *   choisi par l'élève est conservé à rang égal).
 *
 * @param {object[]} plants liste filtrée et triée
 * @param {Map<number, object>|null} presenceByPlantId présence sur la carte active
 * @param {{ featuredFirst?: boolean }} [options]
 * @returns {Array<{ id: string, label: string, count: number,
 *   plants: Array<{ plant: object, rank: number, toSearch: boolean }> }>}
 */
export function groupCatalogByUsage(plants, presenceByPlantId, { featuredFirst = true } = {}) {
  const sections = new Map();
  const list = Array.isArray(plants) ? plants : [];
  list.forEach((plant, index) => {
    const id = usageGroupIdOf(plant) || CATALOG_OTHER_GROUP_ID;
    if (!sections.has(id)) {
      sections.set(id, {
        id,
        label:
          id === CATALOG_OTHER_GROUP_ID
            ? CATALOG_OTHER_GROUP_LABEL
            : usageGroupLabelOf(plant) || id,
        items: [],
      });
    }
    const entry =
      presenceByPlantId instanceof Map ? presenceByPlantId.get(Number(plant?.id)) || null : null;
    sections.get(id).items.push({
      plant,
      index,
      rank: catalogPresenceRank(entry, { featuredFirst }),
      toSearch: isToSearchPresence(entry),
    });
  });
  return [...sections.values()]
    .sort((a, b) => {
      if (a.id === CATALOG_OTHER_GROUP_ID) return 1;
      if (b.id === CATALOG_OTHER_GROUP_ID) return -1;
      return a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' });
    })
    .map((section) => ({
      id: section.id,
      label: section.label,
      count: section.items.length,
      plants: section.items
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(({ plant, rank, toSearch }) => ({ plant, rank, toSearch })),
    }));
}

/**
 * Regroupe zones et repères par carte (`map_id`), repli sur `'foret'` si absent/vide.
 * Retourne une `Map<id, { zones, markers }>` dans l'ordre de première rencontre.
 */
export function groupPlantLocationsByMap(zoneList, markerList) {
  const map = new Map();
  const ensure = (mapId) => {
    const id = mapId && String(mapId).trim() ? String(mapId).trim() : 'foret';
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
