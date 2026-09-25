/**
 * Filtres catalogue biodiversité (champs plants côté client).
 */

import { trophicRoleLabel } from './plantTrophicRole.js';

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

/**
 * Filtre « Présence sur la carte » du catalogue.
 *
 * La présence d'une espèce sur une carte est décidée par le **serveur**
 * (`GET /api/maps/:mapId/species`, `lib/biodiv/presenceService.js`, décision Q10) :
 * registre de la carte, zones ou repères. Le client ne refait plus la réunion, et les
 * anciens noms mono-espèce (`zones.current_plant`, `map_markers.plant_name`) ne comptent
 * plus : sur la base de référence, les trois encore renseignés ont tous leur jonction.
 */
export const ZONE_PRESENCE_FILTER = {
  ALL: '',
  IN_MAP: 'in_map',
  NOT_IN_MAP: 'not_in_map',
};

function plantIdOf(plant) {
  const id = Number(plant?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function entityHasPlantId(entity, plantId) {
  if (plantId == null) return false;
  const ids = entity?.species_ids;
  if (!Array.isArray(ids) || ids.length === 0) return false;
  return ids.some((x) => Number(x) === plantId);
}

/** La zone porte-t-elle cette espèce (jonction `species_ids`) ? Sert à nommer les lieux. */
export function plantLinkedToMapZone(plant, zone) {
  return entityHasPlantId(zone, plantIdOf(plant));
}

/** Le repère porte-t-il cette espèce (jonction `species_ids`) ? Sert à nommer les lieux. */
export function plantLinkedToMapMarker(plant, marker) {
  return entityHasPlantId(marker, plantIdOf(plant));
}

/**
 * Présente sur la carte active, d'après la réponse du serveur.
 * @param {object} plant
 * @param {Map<number, object>|null} presenceByPlantId index de `indexSpeciesPresence` ;
 *   `null` = présence pas encore connue
 * @returns {boolean|null} `null` si la présence est inconnue
 */
export function plantPresentOnActiveMap(plant, presenceByPlantId) {
  if (!(presenceByPlantId instanceof Map)) return null;
  const id = plantIdOf(plant);
  return id != null && presenceByPlantId.has(id);
}

/**
 * Fiches à marquer « Sur la carte » dans une grille (pastille de vignette).
 *
 * Présence connue → réponse du serveur, la même pour l'élève et le professeur. Présence
 * pas encore chargée → repli sur les lieux déjà connus du client (jonctions des zones et
 * repères), sans jamais réintroduire les anciens noms mono-espèce.
 *
 * @returns {Set<number|string>} identifiants de fiche (tels que dans `plants`)
 */
export function plantIdsMarkedOnMap(plants, presenceByPlantId, zones = [], markers = []) {
  const ids = new Set();
  const zl = Array.isArray(zones) ? zones : [];
  const ml = Array.isArray(markers) ? markers : [];
  for (const p of Array.isArray(plants) ? plants : []) {
    const known = plantPresentOnActiveMap(p, presenceByPlantId);
    if (known === true) ids.add(p.id);
    else if (
      known == null &&
      (zl.some((z) => plantLinkedToMapZone(p, z)) || ml.some((m) => plantLinkedToMapMarker(p, m)))
    ) {
      ids.add(p.id);
    }
  }
  return ids;
}

/**
 * Sous-ensemble après application des filtres taxonomiques seuls (pour options en cascade).
 */
export function filterPlantsByTaxonomy(
  plants,
  { group1, group2, group3, trophicRole, habitatType } = {},
) {
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
  if (f.originStatus && nv(plant.origin_status) !== f.originStatus) return false;
  if (f.iucnStatus && nv(plant.iucn_status) !== f.iucnStatus) return false;
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
    plant.accepted_scientific_name,
    plant.habitat,
    plantTaxonomyValue(plant, 'kingdom'),
    plantTaxonomyValue(plant, 'group'),
    plantTaxonomyValue(plant, 'family'),
    plantTaxonomyValue(plant, 'genus'),
    plant.trophic_role,
    // Le libellé accentué (« détritivore », « décomposeur ») : la valeur stockée n'a pas
    // d'accent, et c'est le mot que l'élève tape.
    trophicRoleLabel(plant.trophic_role),
    plant.geographic_origin,
    plant.harvest_part,
  ];
  return fields.some((field) => nv(field).toLowerCase().includes(queryTrimmedLower));
}

/**
 * Filtre de présence. Tant que la présence de la carte est inconnue (chargement, erreur
 * réseau), le filtre **ne retire rien** : mieux vaut montrer tout le catalogue un instant
 * qu'un « aucun résultat » trompeur.
 */
export function plantMatchesZonePresence(plant, presenceByPlantId, presence) {
  if (!presence) return true;
  const has = plantPresentOnActiveMap(plant, presenceByPlantId);
  if (has == null) return true;
  if (presence === ZONE_PRESENCE_FILTER.IN_MAP) return has;
  if (presence === ZONE_PRESENCE_FILTER.NOT_IN_MAP) return !has;
  return true;
}

export function plantMatchesAllFilters(
  plant,
  { structured, queryTrimmedLower, zonePresence },
  presenceByPlantId = null,
) {
  if (!plantMatchesStructuredFilters(plant, structured)) return false;
  if (!plantTextMatchesQuery(plant, queryTrimmedLower)) return false;
  if (!plantMatchesZonePresence(plant, presenceByPlantId, zonePresence)) return false;
  return true;
}
