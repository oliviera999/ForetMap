/**
 * Filtres catalogue biodiversité (champs plants côté client).
 */

function nv(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s === '-') return '';
  return s;
}

/** Présence sur la carte (zone : `living_beings_list` ou `current_plant`). */
export const ZONE_PRESENCE_FILTER = {
  ALL: '',
  IN_MAP: 'in_map',
  NOT_IN_MAP: 'not_in_map',
};

/** Noms d’êtres vivants rattachés à une zone (`living_beings_list` + colonne legacy `current_plant` si présente). */
export function mapZoneLivingNames(zone) {
  const names = new Set();
  if (Array.isArray(zone?.living_beings_list)) {
    for (const x of zone.living_beings_list) {
      const v = nv(x);
      if (v) names.add(v);
    }
  }
  const cp = nv(zone?.current_plant);
  if (cp) names.add(cp);
  return names;
}

/** Noms d’êtres vivants rattachés à un repère (`living_beings_list` + colonne legacy `plant_name` si présente). */
export function mapMarkerLivingNames(marker) {
  const names = new Set();
  if (Array.isArray(marker?.living_beings_list)) {
    for (const x of marker.living_beings_list) {
      const v = nv(x);
      if (v) names.add(v);
    }
  }
  const pn = nv(marker?.plant_name);
  if (pn) names.add(pn);
  return names;
}

export function plantLinkedToMapZone(plant, zone) {
  const name = nv(plant?.name);
  if (!name) return false;
  return mapZoneLivingNames(zone).has(name);
}

export function plantLinkedToMapMarker(plant, marker) {
  const name = nv(plant?.name);
  if (!name) return false;
  return mapMarkerLivingNames(marker).has(name);
}

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
    plant.group_4,
    plant.geographic_origin,
    plant.harvest_part,
  ];
  return fields.some((field) => nv(field).toLowerCase().includes(queryTrimmedLower));
}

export function plantMatchesZonePresence(plant, zones, markers, presence) {
  if (!presence) return true;
  const zl = Array.isArray(zones) ? zones : [];
  const ml = Array.isArray(markers) ? markers : [];
  const has =
    zl.some((z) => plantLinkedToMapZone(plant, z)) || ml.some((m) => plantLinkedToMapMarker(plant, m));
  if (presence === ZONE_PRESENCE_FILTER.IN_MAP) return has;
  if (presence === ZONE_PRESENCE_FILTER.NOT_IN_MAP) return !has;
  return true;
}

export function plantMatchesAllFilters(plant, { structured, queryTrimmedLower, zonePresence }, zones, markers) {
  if (!plantMatchesStructuredFilters(plant, structured)) return false;
  if (!plantTextMatchesQuery(plant, queryTrimmedLower)) return false;
  if (!plantMatchesZonePresence(plant, zones, markers, zonePresence)) return false;
  return true;
}
