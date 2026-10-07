/**
 * « Marquer comme lu » d'un tutoriel confirmé sans réseau. Même patron que les autres files
 * (`offlineActionQueue.js`) : file dans le stockage local, propre à chaque compte, rejouée au
 * retour du réseau par la boîte d'envoi (`services/offlineOutbox.js`), **avant** les tâches
 * faites — une tâche liée à ce tutoriel exige sa lecture côté serveur.
 *
 * Le serveur enregistre la lecture une seule fois même si elle est renvoyée ; la clé
 * `client_uuid` ne sert ici qu'à identifier l'entrée sur l'appareil.
 *
 * Seule une lecture **sans contrôle de compréhension à passer** entre dans la file : les
 * questions du contrôle sont tirées et corrigées par le serveur, impossible sans réseau. Si le
 * contrôle a été ajouté entre-temps, le serveur refuse au retour du réseau et l'élève est
 * prévenu (l'entrée sort de la file : il n'y a pas de texte à garder).
 */

import { createOfflineQueue, newClientUuid } from './offlineActionQueue.js';

export const TUTORIAL_READ_QUEUE_STORAGE_KEY = 'foretmap_tutorial_read_queue';
export const TUTORIAL_READ_QUEUE_MAX = 100;

/**
 * @typedef {{ user_id: string, client_uuid: string, tutorial_id: number,
 *   tutorial_title: string, queued_at: number }} QueuedTutorialRead
 */

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = Number(raw.tutorial_id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    user_id: raw.user_id,
    client_uuid: raw.client_uuid,
    tutorial_id: id,
    tutorial_title: String(raw.tutorial_title || '').slice(0, 200),
    queued_at: Number.isFinite(Number(raw.queued_at)) ? Number(raw.queued_at) : 0,
  };
}

const queue = createOfflineQueue({
  storageKey: TUTORIAL_READ_QUEUE_STORAGE_KEY,
  max: TUTORIAL_READ_QUEUE_MAX,
  normalize,
});

/**
 * Met une lecture en file (une seule par tutoriel et par compte).
 * @returns {boolean} vrai si elle est gardée sur l'appareil
 */
export function enqueueTutorialRead({ user_id, tutorial_id, tutorial_title = '' }) {
  const id = Number(tutorial_id);
  if (queue.listFor(user_id).some((q) => q.tutorial_id === id)) return true;
  return queue.enqueue({
    user_id,
    client_uuid: newClientUuid('tread'),
    tutorial_id: id,
    tutorial_title,
  });
}

export const listQueuedTutorialReads = (userId) => queue.listFor(userId);

/** Tutoriels lus hors ligne par ce compte (comptés comme lus en attendant l'envoi). */
export function queuedTutorialReadIds(userId) {
  return new Set(queue.listFor(userId).map((q) => q.tutorial_id));
}

export const removeQueuedTutorialRead = (clientUuid) => queue.remove(clientUuid);

export const flushTutorialReadQueue = (send, userId) => queue.flush(send, userId);
