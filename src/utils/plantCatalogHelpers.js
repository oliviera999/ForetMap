/**
 * Helpers purs de catalogue biodiversité — extraits de `foretmap-views.jsx` (O6).
 */

import { normalizedPlantValue } from './plantFormValues.js';

/**
 * Vrai si la fiche relève du groupe (taxon) 1 « Végétal (Chlorobiontes) » — pour ces entrées
 * la nutrition (souvent « autotrophe ») est redondante et masquée en pastille.
 */
export function isVegetalCatalogEntry(plant) {
  const g1 = (normalizedPlantValue(plant.group_1) || '').toLowerCase();
  return g1.includes('végétal');
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
