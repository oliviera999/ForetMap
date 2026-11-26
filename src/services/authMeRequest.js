/**
 * Déduplication des `GET /api/auth/me` in-flight (lot perf réactivité).
 *
 * Au reload, l'hydratation de session et la fin de `fetchAll` (parfois doublée par le
 * debounce boot) lançaient 2–3 allers-retours identiques. Une seule promesse partagée
 * suffit ; le renouvellement JWT et l'hydratation réutilisent le même point d'entrée.
 */

import { api } from './api';

/** @type {Promise<object>|null} */
let inFlight = null;

/** Instant (ms) de la dernière réponse `/me` réussie via ce module (0 = jamais). */
let lastSuccessAtMs = 0;

/** Fenêtre pendant laquelle un `fetchAll` peut sauter un `/me` redondant après hydratation. */
export const AUTH_ME_FRESH_MS = 8_000;

/**
 * @returns {Promise<object>}
 */
export function fetchAuthMe() {
  if (inFlight) return inFlight;
  inFlight = api('/api/auth/me')
    .then((data) => {
      lastSuccessAtMs = Date.now();
      return data;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Vrai si une réponse `/me` récente a déjà hydraté la session. */
export function wasAuthMeFetchedRecently(nowMs = Date.now()) {
  return lastSuccessAtMs > 0 && nowMs - lastSuccessAtMs < AUTH_ME_FRESH_MS;
}

/** Réservé aux tests. */
export function resetAuthMeRequestForTests() {
  inFlight = null;
  lastSuccessAtMs = 0;
}
