import { api } from './api';

/**
 * Client API du domaine biodiversité (étape B3 de l'audit du 25/09/2026).
 *
 * Premier appel : la présence des espèces sur une carte (`GET /api/maps/:mapId/species`).
 * Les requêtes identiques en cours sont partagées : le catalogue et la fiche ouverte
 * demandent la même carte au même moment, pour une seule requête réseau.
 */

/** Requêtes de présence en vol / récentes, par clé `carte|révision`. */
const presenceRequests = new Map();
/** Quelques révisions suffisent : la clé change à chaque rechargement réel des données. */
const PRESENCE_REQUESTS_MAX = 8;

/**
 * Espèces présentes sur une carte, avec leur provenance.
 *
 * @param {string} mapId
 * @param {{ revision?: string }} [opts] clé de fraîcheur fournie par l'appelant : deux
 *   appels de même carte et même révision partagent la même promesse
 * @returns {Promise<{ map_id: string, sources: string[], summary: object,
 *   species: Array<{ plant_id: number, name: string, emoji: string, sources: string[],
 *   validation_status: string|null, zones: Array<{id: string, name: string}>,
 *   markers: Array<{id: string, label: string}> }> }>}
 */
export function fetchMapSpeciesPresence(mapId, { revision = '' } = {}) {
  const id = String(mapId || '').trim();
  if (!id) return Promise.resolve({ map_id: '', sources: [], summary: null, species: [] });
  const key = `${id}|${revision}`;
  const cached = presenceRequests.get(key);
  if (cached) return cached;
  const request = api(`/api/maps/${encodeURIComponent(id)}/species`).catch((err) => {
    // Un échec ne doit pas rester en cache : la prochaine demande réessaie.
    presenceRequests.delete(key);
    throw err;
  });
  presenceRequests.set(key, request);
  while (presenceRequests.size > PRESENCE_REQUESTS_MAX) {
    presenceRequests.delete(presenceRequests.keys().next().value);
  }
  return request;
}

/** Réservé aux tests : vide le partage de requêtes. */
export function resetBiodivApiCacheForTests() {
  presenceRequests.clear();
}
