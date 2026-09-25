/**
 * File hors ligne des observations d'espèce (« Espèce observée »), sur le modèle de la file
 * « vu » de la visite (`visitProgressClient.js`). Audit du 25/09/2026, piste D : sur le
 * terrain, une observation confirmée sans réseau était perdue.
 *
 * Chaque observation porte une clé d'idempotence (`client_uuid`, migration 296) : le serveur
 * ne la compte qu'une fois, même si la file est rejouée après une réponse perdue.
 */

import {
  safeLocalStorageReadJson,
  safeLocalStorageWriteJson,
} from '../shared/platform/browserStorage.js';

export const PLANT_OBSERVATION_QUEUE_STORAGE_KEY = 'foretmap_plant_observation_queue';
/** Borne de sécurité : une file qui grossit sans fin signale un autre problème. */
export const PLANT_OBSERVATION_QUEUE_MAX = 200;

/**
 * La file est **propre à chaque compte** : sur une tablette partagée, l'observation d'un élève
 * n'est jamais rejouée sous la session d'un autre (elle attend que son auteur se reconnecte).
 *
 * @typedef {{ user_id: string, plant_id: number, client_uuid: string, queued_at: number }} PlantObservationQueueItem
 */

/** Clé d'idempotence d'une observation (UUID v4 si le navigateur le permet). */
export function newObservationClientUuid() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `obs-${Date.now().toString(36)}-${rand()}-${rand()}`;
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const user_id = String(raw.user_id ?? '').trim();
  const plant_id = Number(raw.plant_id);
  const client_uuid = String(raw.client_uuid || '').trim();
  if (!user_id || user_id.length > 64) return null;
  if (!Number.isInteger(plant_id) || plant_id <= 0) return null;
  if (!/^[A-Za-z0-9-]{8,64}$/.test(client_uuid)) return null;
  const queued_at = Number.isFinite(Number(raw.queued_at)) ? Number(raw.queued_at) : 0;
  return { user_id, plant_id, client_uuid, queued_at };
}

/** @returns {PlantObservationQueueItem[]} */
export function loadPlantObservationQueue() {
  const raw = safeLocalStorageReadJson(PLANT_OBSERVATION_QUEUE_STORAGE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeItem).filter(Boolean);
}

/** @param {PlantObservationQueueItem[]} queue */
export function savePlantObservationQueue(queue) {
  safeLocalStorageWriteJson(
    PLANT_OBSERVATION_QUEUE_STORAGE_KEY,
    (Array.isArray(queue) ? queue : []).slice(-PLANT_OBSERVATION_QUEUE_MAX),
  );
}

/**
 * Met une observation en file (sans doublon de clé).
 * @param {{ user_id: string, plant_id: number, client_uuid: string }} item
 * @returns {PlantObservationQueueItem[]} la file après ajout
 */
export function enqueuePlantObservation(item) {
  const normalized = normalizeItem({ ...item, queued_at: Date.now() });
  const queue = loadPlantObservationQueue();
  if (!normalized || queue.some((q) => q.client_uuid === normalized.client_uuid)) return queue;
  const next = [...queue, normalized].slice(-PLANT_OBSERVATION_QUEUE_MAX);
  savePlantObservationQueue(next);
  return next;
}

/** Nombre d'observations d'un compte en attente pour une fiche. */
export function countQueuedObservations(userId, plantId, queue = loadPlantObservationQueue()) {
  const pid = Number(plantId);
  const uid = String(userId ?? '');
  return queue.filter((q) => q.plant_id === pid && q.user_id === uid).length;
}

/** Statuts qui ne condamnent pas l'observation : session à rouvrir, limite de débit, délai. */
const RETRYABLE_CLIENT_STATUSES = new Set([401, 408, 429]);

let flushInFlight = null;

/**
 * Rejoue les observations **du compte connecté**. Une observation quitte la file quand le
 * serveur l'a enregistrée (ou rejouée), ou quand il la refuse définitivement (4xx : fiche
 * supprimée, contrôle de compréhension non satisfait…). Une panne réseau, une erreur 5xx, une
 * session expirée ou une limite de débit la laissent en file.
 *
 * Un seul rejeu à la fois dans la page, même si plusieurs boutons le demandent.
 *
 * @param {(item: PlantObservationQueueItem) => Promise<unknown>} send
 * @param {string|null|undefined} userId compte connecté ; aucun rejeu sans compte
 * @returns {Promise<{ synced: number, dropped: number, remaining: number }>}
 */
export function flushPlantObservationQueue(send, userId) {
  const uid = String(userId ?? '').trim();
  if (!uid) return Promise.resolve({ synced: 0, dropped: 0, remaining: 0 });
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    let synced = 0;
    let dropped = 0;
    for (const item of loadPlantObservationQueue().filter((q) => q.user_id === uid)) {
      let done = false;
      try {
        await send(item);
        synced += 1;
        done = true;
      } catch (err) {
        const status = Number(err?.status);
        if (status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status)) {
          dropped += 1;
          done = true;
        } else {
          break; // réseau toujours absent ou serveur en difficulté : on réessaiera
        }
      }
      if (done) {
        // Relecture à chaque pas : une observation ajoutée pendant le rejeu reste en file.
        savePlantObservationQueue(
          loadPlantObservationQueue().filter((q) => q.client_uuid !== item.client_uuid),
        );
      }
    }
    const remaining = loadPlantObservationQueue().filter((q) => q.user_id === uid).length;
    return { synced, dropped, remaining };
  })().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}
