/**
 * Présence des espèces sur une carte — côté client, **lecture seule**.
 *
 * La définition de « présente sur ce site » vit sur le serveur
 * (`lib/biodiv/presenceService.js`, décision Q10) : registre de la carte, zones ou repères.
 * Le client ne refait plus la réunion ; il indexe la réponse de
 * `GET /api/maps/:mapId/species` (ou `site_species` du contenu de visite) et en tire des
 * libellés de provenance sobres.
 */

export const PRESENCE_SOURCES = Object.freeze({
  REGISTRY: 'registre',
  ZONE: 'zone',
  MARKER: 'repere',
});

function pluralize(count, singular, plural) {
  return count > 1 ? plural : singular;
}

/**
 * Liste d'entrées de présence → `Map<plantId:number, entrée>`.
 * @param {Array<{ plant_id: number|string, sources?: string[] }>|null|undefined} species
 * @returns {Map<number, object>|null} `null` si la liste est inconnue (pas encore chargée)
 */
export function indexSpeciesPresence(species) {
  if (!Array.isArray(species)) return null;
  const map = new Map();
  for (const entry of species) {
    const id = Number(entry?.plant_id);
    if (Number.isInteger(id) && id > 0) map.set(id, entry);
  }
  return map;
}

/** Entrée de présence d'une fiche (`null` si absente ou si la présence est inconnue). */
export function presenceEntryForPlant(presenceByPlantId, plantOrId) {
  if (!(presenceByPlantId instanceof Map)) return null;
  const id = Number(typeof plantOrId === 'object' ? plantOrId?.id : plantOrId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return presenceByPlantId.get(id) || null;
}

/**
 * Provenance lisible, dans l'ordre registre → zones → repères :
 * « au registre du site · dans 2 zones · sur 1 repère ».
 *
 * Les nombres viennent des lieux **visibles** par le lecteur ; un canal dont les lieux sont
 * tous réservés reste annoncé, sans nombre (« dans une zone »).
 *
 * @param {{ sources?: string[], zones?: Array, markers?: Array }|null} entry
 * @returns {string} chaîne vide si l'espèce n'est pas présente
 */
export function describePresenceSources(entry) {
  const sources = Array.isArray(entry?.sources) ? entry.sources : [];
  const parts = [];
  if (sources.includes(PRESENCE_SOURCES.REGISTRY)) parts.push('au registre du site');
  if (sources.includes(PRESENCE_SOURCES.ZONE)) {
    const n = Array.isArray(entry?.zones) ? entry.zones.length : 0;
    parts.push(n > 0 ? `dans ${n} ${pluralize(n, 'zone', 'zones')}` : 'dans une zone');
  }
  if (sources.includes(PRESENCE_SOURCES.MARKER)) {
    const n = Array.isArray(entry?.markers) ? entry.markers.length : 0;
    parts.push(n > 0 ? `sur ${n} ${pluralize(n, 'repère', 'repères')}` : 'sur un repère');
  }
  return parts.join(' · ');
}

/** Vrai si l'espèce n'est rattachée à la carte que par le registre (aucun lieu précis). */
export function isRegistryOnly(entry) {
  const sources = Array.isArray(entry?.sources) ? entry.sources : [];
  return sources.length === 1 && sources[0] === PRESENCE_SOURCES.REGISTRY;
}
