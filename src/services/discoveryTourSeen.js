import { api } from './api';

/**
 * Progression des visites guidées du compte (`PUT /api/auth/discovery-tour-seen`).
 *
 * Route étroite : merge serveur (union des clés `true`), sans mot de passe actuel.
 * Rend l'accueil OLU et les parcours d'onglets **portables d'un appareil à l'autre**.
 *
 * @param {Record<string, true|boolean>} seen clés de parcours à marquer vues
 * @returns {Promise<Record<string, true>>} carte complète retenue par le serveur
 */
export async function saveDiscoveryTourSeen(seen) {
  const res = await api('/api/auth/discovery-tour-seen', 'PUT', { seen: seen || {} });
  return res?.discoveryTourSeen && typeof res.discoveryTourSeen === 'object'
    ? res.discoveryTourSeen
    : {};
}
