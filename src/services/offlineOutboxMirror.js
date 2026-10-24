/**
 * Miroir de la boîte d'envoi pour la **synchronisation en arrière-plan** (Background Sync) :
 * le service worker ne peut pas lire le stockage local de la page, alors les écritures en
 * attente du compte connecté sont recopiées dans IndexedDB (`offlineDb.js`, magasin `outbox`)
 * sous une forme prête à envoyer, et une synchronisation est demandée au navigateur. Au retour
 * du réseau, le service worker les envoie même si l'application a été fermée entre-temps
 * (Chrome / Android ; ailleurs, la page rejoue elle-même à sa prochaine ouverture).
 *
 * Le rejeu par le service worker et celui de la page peuvent se croiser sans doublon : chaque
 * écriture porte sa clé d'idempotence, et le serveur rejoue la première réponse.
 *
 * Restent hors du miroir : les écritures accompagnées d'une **photo** (envoyées par la page,
 * qui les relit dans IndexedDB), les écritures refusées, et les brouillons du carnet.
 *
 * Sécurité : chaque entrée embarque le jeton de session de l'élève (le service worker n'en a
 * pas d'autre). Le miroir est effacé à la déconnexion et reconstruit à chaque changement.
 *
 * Inspiration : module `workbox-background-sync` de Workbox (Google, licence MIT,
 * https://github.com/GoogleChrome/workbox) — file IndexedDB rejouée sur l'événement `sync` ;
 * réécrit ici sans dépendance, au format des files ForetMap.
 */

import { getAuthToken, getAuthUserId, withAppBase } from './api';
import {
  OFFLINE_DB_STORES,
  OUTBOX_SYNC_TAG,
  idbGetAll,
  idbReplaceAll,
} from '../utils/offlineDb.js';
import { listQueuedTutorialReads } from '../utils/tutorialReadQueue.js';
import { listQueuedTaskDone, taskDoneRequestBody } from '../utils/taskDoneQueue.js';
import {
  listQueuedSpeciesObservations,
  speciesObservationRequestBody,
} from '../utils/speciesObservationQueue.js';
import { loadPlantObservationQueue } from '../utils/plantObservationQueue.js';

const STORE = OFFLINE_DB_STORES.outbox;

/**
 * Entrées du miroir pour un compte (ordre de rejeu : lectures, tâches, observations).
 * @param {string} userId
 * @param {string} token jeton de session du compte
 * @param {(path: string) => string} [resolveUrl]
 */
export function buildOutboxMirrorEntries(userId, token, resolveUrl = (p) => p) {
  const uid = String(userId ?? '').trim();
  if (!uid || !token) return [];
  const entry = (order, kind, item, path, body) => ({
    id: item.client_uuid,
    user_id: uid,
    kind,
    order,
    url: resolveUrl(path),
    method: 'POST',
    body: JSON.stringify(body),
    token,
    queued_at: Number(item.queued_at) || 0,
  });
  return [
    ...listQueuedTutorialReads(uid).map((q) =>
      entry(1, 'tutorial_read', q, `/api/tutorials/${q.tutorial_id}/acknowledge-read`, {
        confirm: true,
      }),
    ),
    ...listQueuedTaskDone(uid)
      .filter((q) => !q.refused && !q.has_photo)
      .map((q) =>
        entry(
          2,
          'task_done',
          q,
          `/api/tasks/${encodeURIComponent(q.task_id)}/done`,
          taskDoneRequestBody(q),
        ),
      ),
    ...listQueuedSpeciesObservations(uid)
      .filter((q) => !q.refused && !q.has_photo)
      .map((q) =>
        entry(
          3,
          'species_observation',
          q,
          '/api/species-observations',
          speciesObservationRequestBody(q),
        ),
      ),
    ...loadPlantObservationQueue()
      .filter((q) => q.user_id === uid)
      .map((q) =>
        entry(4, 'plant_observation', q, `/api/plants/${q.plant_id}/acknowledge-discovery`, {
          confirm: true,
          client_uuid: q.client_uuid,
        }),
      ),
  ];
}

/** Synchronisation en arrière-plan disponible (service worker actif + `SyncManager`). */
export function isBackgroundSyncSupported() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.serviceWorker &&
    typeof window !== 'undefined' &&
    'SyncManager' in window
  );
}

async function registerOutboxSync() {
  if (!isBackgroundSyncSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    if (!registration?.sync?.register) return false;
    await registration.sync.register(OUTBOX_SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reconstruit le miroir pour le compte connecté et demande une synchronisation s'il reste des
 * écritures. Meilleur effort : ne rejette jamais.
 * @returns {Promise<{ mirrored: number, syncRegistered: boolean }>}
 */
export async function syncOutboxMirror({ userId = getAuthUserId(), token = getAuthToken() } = {}) {
  if (!isBackgroundSyncSupported()) return { mirrored: 0, syncRegistered: false };
  const entries = buildOutboxMirrorEntries(userId, token, withAppBase);
  const written = await idbReplaceAll(STORE, entries);
  if (!written || entries.length === 0) return { mirrored: 0, syncRegistered: false };
  return { mirrored: entries.length, syncRegistered: await registerOutboxSync() };
}

/** Efface le miroir (déconnexion) : plus aucune copie du jeton dans IndexedDB. */
export async function clearOutboxMirror() {
  return idbReplaceAll(STORE, []);
}

/** Nombre d'entrées encore dans le miroir (diagnostic, tests). */
export async function countOutboxMirrorEntries() {
  return (await idbGetAll(STORE)).length;
}
