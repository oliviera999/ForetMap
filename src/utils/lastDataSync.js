/**
 * Heure de la dernière synchronisation complète des données avec le serveur, gardée sur
 * l'appareil : hors ligne, le bandeau dit de quand datent les données affichées — y compris
 * quand l'application est rouverte sans réseau.
 */

import {
  safeLocalStorageGetItem,
  safeLocalStorageSetItem,
} from '../shared/platform/browserStorage.js';

export const LAST_DATA_SYNC_STORAGE_KEY = 'foretmap_last_data_sync_at';

/** Horodatage (ms) de la dernière synchronisation réussie, ou `null`. */
export function readLastDataSyncAt() {
  const value = Number(safeLocalStorageGetItem(LAST_DATA_SYNC_STORAGE_KEY, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function rememberLastDataSyncAt(timestamp = Date.now()) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return;
  safeLocalStorageSetItem(LAST_DATA_SYNC_STORAGE_KEY, String(Math.round(timestamp)));
}

/**
 * Texte du bandeau hors ligne.
 * @param {number|null} lastSyncAt horodatage de la dernière synchronisation
 * @param {number} [now]
 * @param {'offline'|'unreachable'} [mode] `unreachable` : le téléphone affiche du réseau,
 *   mais le serveur ne répond pas (une barre, Wi-Fi saturé, portail Wi-Fi)
 */
export function offlineBannerText(lastSyncAt, now = Date.now(), mode = 'offline') {
  const tail =
    'Tâches terminées, observations, lectures et carnet sont gardés et partiront au retour du réseau.';
  const head = mode === 'unreachable' ? 'Réseau trop faible' : 'Hors ligne';
  if (!Number.isFinite(lastSyncAt) || lastSyncAt <= 0) {
    return `${head} — données gardées sur l’appareil. ${tail}`;
  }
  const at = new Date(lastSyncAt);
  const sameDay = new Date(now).toDateString() === at.toDateString();
  const time = at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const when = sameDay
    ? `à ${time}`
    : `le ${at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} à ${time}`;
  return `${head} — données de la dernière synchronisation (${when}). ${tail}`;
}
