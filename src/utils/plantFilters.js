/**
 * Filtres catalogue biodiversité (champs plants côté client).
 */

function nv(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s === '-') return '';
  return s;
}

export function plantTaxonomyValue(plant, level) {
  const tax = plant?.taxonomy;
  if (tax && typeof tax === 'object') {
    if (level === 'kingdom') return nv(tax.kingdom);
    if (level === 'group') return nv(tax.group);
    if (level === 'family') return nv(tax.family);
    if (level === 'genus') return nv(tax.genus);
  }
  if (level === 'kingdom') return nv(plant?.taxon_kingdom) || nv(plant?.group_1);
  if (level === 'group') return nv(plant?.taxon_group) || nv(plant?.group_2);
  if (level === 'family') return nv(plant?.taxon_family) || nv(plant?.group_3);
  if (level === 'genus') return nv(plant?.taxon_genus) || nv(plant?.group_4);
  return '';
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
export function filterPlantsByTaxonomy(plants, { group1, group2, group3, trophicRole, habitatType } = {}) {
  return plants.filter((p) => {
    if (group1 && plantTaxonomyValue(p, 'kingdom') !== group1) return false;
    if (group2 && plantTaxonomyValue(p, 'group') !== group2) return false;
    if (group3 && plantTaxonomyValue(p, 'family') !== group3) return false;
    if (trophicRole && nv(p.trophic_role) !== trophicRole) return false;
    if (habitatType && nv(p.habitat_type) !== habitatType) return false;
    return true;
  });
}

export function distinctPlantFieldValues(plants, fieldKey) {
  const set = new Set();
  for (const p of plants) {
    let val = '';
    if (fieldKey === 'taxon_kingdom') val = plantTaxonomyValue(p, 'kingdom');
    else if (fieldKey === 'taxon_group') val = plantTaxonomyValue(p, 'group');
    else if (fieldKey === 'taxon_family') val = plantTaxonomyValue(p, 'family');
    else val = nv(p[fieldKey]);
    if (val) set.add(val);
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
}

export function plantMatchesStructuredFilters(plant, f) {
  if (f.group1 && plantTaxonomyValue(plant, 'kingdom') !== f.group1) return false;
  if (f.group2 && plantTaxonomyValue(plant, 'group') !== f.group2) return false;
  if (f.group3 && plantTaxonomyValue(plant, 'family') !== f.group3) return false;
  if (f.habitat && nv(plant.habitat) !== f.habitat) return false;
  if (f.trophicRole && nv(plant.trophic_role) !== f.trophicRole) return false;
  if (f.habitatType && nv(plant.habitat_type) !== f.habitatType) return false;
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
    plantTaxonomyValue(plant, 'kingdom'),
    plantTaxonomyValue(plant, 'group'),
    plantTaxonomyValue(plant, 'family'),
    plantTaxonomyValue(plant, 'genus'),
    plant.trophic_role,
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
    zl.some((z) => plantLinkedToMapZone(plant, z)) ||
    ml.some((m) => plantLinkedToMapMarker(plant, m));
  if (presence === ZONE_PRESENCE_FILTER.IN_MAP) return has;
  if (presence === ZONE_PRESENCE_FILTER.NOT_IN_MAP) return !has;
  return true;
}

export function plantMatchesAllFilters(
  plant,
  { structured, queryTrimmedLower, zonePresence },
  zones,
  markers,
) {
  if (!plantMatchesStructuredFilters(plant, structured)) return false;
  if (!plantTextMatchesQuery(plant, queryTrimmedLower)) return false;
  if (!plantMatchesZonePresence(plant, zones, markers, zonePresence)) return false;
  return true;
}
