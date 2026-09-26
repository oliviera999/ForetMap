/**
 * File hors ligne de « Tâche faite » (piste D, audit du 25/09/2026, § 1.4.6 et § 2.4).
 *
 * Sur le terrain, l'élève termine sa tâche là où le réseau manque : le marquage (et son
 * commentaire) est gardé sur l'appareil et envoyé tout seul au retour du réseau. La clé
 * `client_uuid` (migration 299) garantit qu'un renvoi ne publie pas deux fois le rapport.
 *
 * Ce qui N'entre PAS dans la file, et pourquoi :
 *   - la **photo** du rapport : plusieurs centaines de Ko par image dans un stockage local
 *     limité (≈ 5 Mo, partagé avec le reste de l'application) et lisible par l'élève suivant
 *     sur une tablette partagée — l'élève est prévenu et peut envoyer sans la photo ;
 *   - l'**inscription** (« Je m'en occupe ») : les places sont comptées par le serveur ; une
 *     inscription rejouée plus tard pourrait être refusée alors que l'élève est parti faire
 *     la tâche, et prendrait une place qu'un camarade croyait libre ;
 *   - le **retrait** (« Me retirer ») : libérer une place n'a de sens que si elle se libère
 *     tout de suite pour les autres ; rejoué en différé, il pourrait défaire une réinscription.
 */

import { createOfflineQueue, newClientUuid } from './offlineActionQueue.js';

export const TASK_DONE_QUEUE_STORAGE_KEY = 'foretmap_task_done_queue';
/** Borne de sécurité : une file qui grossit sans fin signale un autre problème. */
export const TASK_DONE_QUEUE_MAX = 50;
/** Même plafond que les rapports saisis en ligne n'en ont pas : on borne le stockage local. */
export const TASK_DONE_COMMENT_MAX = 4000;

/**
 * @typedef {{ user_id: string, task_id: string, task_title: string, client_uuid: string,
 *   comment: string, student_id: string, first_name: string, last_name: string,
 *   queued_at: number }} TaskDoneQueueItem
 */

function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const taskId = String(raw.task_id ?? '').trim();
  if (!taskId || taskId.length > 64) return null;
  const comment = typeof raw.comment === 'string' ? raw.comment : '';
  if (comment.length > TASK_DONE_COMMENT_MAX) return null;
  return {
    user_id: raw.user_id,
    task_id: taskId,
    task_title: String(raw.task_title || '').slice(0, 255),
    client_uuid: raw.client_uuid,
    comment,
    student_id: String(raw.student_id ?? ''),
    first_name: String(raw.first_name ?? ''),
    last_name: String(raw.last_name ?? ''),
    queued_at: Number.isFinite(Number(raw.queued_at)) ? Number(raw.queued_at) : 0,
  };
}

const queue = createOfflineQueue({
  storageKey: TASK_DONE_QUEUE_STORAGE_KEY,
  max: TASK_DONE_QUEUE_MAX,
  normalize,
});

/** Clé d'idempotence d'un « fait » (une par ouverture du rapport, réutilisée en cas de renvoi). */
export const newTaskDoneClientUuid = () => newClientUuid('done');

/** @returns {TaskDoneQueueItem[]} */
export const loadTaskDoneQueue = () => queue.load();

/**
 * Met un « fait » en file.
 * @param {Omit<TaskDoneQueueItem, 'queued_at'>} item
 * @returns {boolean} vrai s'il est gardé sur l'appareil
 */
export const enqueueTaskDone = (item) => queue.enqueue(item);

/** Identifiants des tâches qu'un compte a marquées faites sans réseau (en attente d'envoi). */
export function queuedTaskDoneIds(userId) {
  return new Set(queue.listFor(userId).map((q) => q.task_id));
}

/** Corps de `POST /api/tasks/:id/done` pour une entrée de la file. */
export function taskDoneRequestBody(item) {
  return {
    comment: item.comment || '',
    client_uuid: item.client_uuid,
    studentId: item.student_id || undefined,
    firstName: item.first_name || undefined,
    lastName: item.last_name || undefined,
  };
}

/**
 * Rejoue les « faits » du compte connecté. Un refus définitif (tâche archivée, tutoriel à lire,
 * inscription retirée…) sort de la file : l'appelant prévient l'élève avec `refused`.
 * @param {(item: TaskDoneQueueItem) => Promise<unknown>} send
 * @param {string|null|undefined} userId
 */
export const flushTaskDoneQueue = (send, userId) => queue.flush(send, userId);
