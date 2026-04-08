/**
 * Filtres catalogue biodiversité (champs plants côté client).
 */

function nv(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s === '-') return '';
  return s;
}

/** Présence sur la carte (zones.current_plant === plant.name). */
export const ZONE_PRESENCE_FILTER = {
  ALL: '',
  IN_MAP: 'in_map',
  NOT_IN_MAP: 'not_in_map',
};

/**
 * Sous-ensemble après application des filtres taxonomiques seuls (pour options en cascade).
 */
export function filterPlantsByTaxonomy(plants, { group1, group2, group3 } = {}) {
  return plants.filter((p) => {
    if (group1 && nv(p.group_1) !== group1) return false;
    if (group2 && nv(p.group_2) !== group2) return false;
    if (group3 && nv(p.group_3) !== group3) return false;
    return true;
  });
}

export function distinctPlantFieldValues(plants, fieldKey) {
  const set = new Set();
  for (const p of plants) {
    const val = nv(p[fieldKey]);
    if (val) set.add(val);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

export function plantMatchesStructuredFilters(plant, f) {
  if (f.group1 && nv(plant.group_1) !== f.group1) return false;
  if (f.group2 && nv(plant.group_2) !== f.group2) return false;
  if (f.group3 && nv(plant.group_3) !== f.group3) return false;
  if (f.habitat && nv(plant.habitat) !== f.habitat) return false;
  if (f.agroecosystemCategory && nv(plant.agroecosystem_category) !== f.agroecosystemCategory) {
    return false;
  }
  return true;
}

/** Recherche texte alignée élève / prof (champs courts + taxonomie). */
export function plantTextMatchesQuery(plant, queryTrimmedLower) {
  if (!queryTrimmedLower) return true;
  const fields = [
    plant.name,
    plant.description,
    plant.scientific_name,
    plant.habitat,
    plant.group_1,
    plant.group_2,
    plant.group_3,
    plant.geographic_origin,
    plant.harvest_part,
  ];
  return fields.some((field) => nv(field).toLowerCase().includes(queryTrimmedLower));
}

export function plantMatchesZonePresence(plant, zones, presence) {
  if (!presence) return true;
  const name = nv(plant.name);
  const has = Array.isArray(zones) && zones.some((z) => nv(z.current_plant) === name);
  if (presence === ZONE_PRESENCE_FILTER.IN_MAP) return has;
  if (presence === ZONE_PRESENCE_FILTER.NOT_IN_MAP) return !has;
  return true;
}

export function plantMatchesAllFilters(plant, { structured, queryTrimmedLower, zonePresence }, zones) {
  if (!plantMatchesStructuredFilters(plant, structured)) return false;
  if (!plantTextMatchesQuery(plant, queryTrimmedLower)) return false;
  if (!plantMatchesZonePresence(plant, zones, zonePresence)) return false;
  return true;
}
