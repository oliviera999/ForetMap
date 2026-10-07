/**
 * Boîte d'envoi hors ligne : point unique qui rejoue, au retour du réseau, toutes les écritures
 * gardées sur l'appareil par l'élève, **quel que soit l'écran ouvert**. Auparavant, chaque file
 * n'était rejouée que par son propre écran : une tâche notée faite sans réseau attendait que
 * l'élève rouvre l'onglet Tâches.
 *
 * Ordre de rejeu (important) : une lecture de tutoriel passe avant les tâches faites — une
 * tâche liée exige sa lecture côté serveur. Le carnet n'est pas rejoué ici : son éditeur garde
 * la main sur le brouillon en cours de frappe (`userJournalOfflineAdapter.js`) ; il est
 * seulement listé dans l'écran « En attente d'envoi ».
 *
 * Chaque rejeu porte `X-Foretmap-Queued-At` (heure de mise en file) et `X-Foretmap-Replay` :
 * le serveur compte, sans rien de nominatif, combien d'écritures arrivent en différé et avec
 * quel retard (diagnostic administrateur).
 */

import { api, getAuthUserId } from './api';
import { createSpeciesObservation, uploadSpeciesObservationPhoto } from './observationsApi';
import { isDefinitiveRefusal } from '../utils/offlineActionQueue.js';
import {
  dismissTaskDone,
  flushTaskDoneQueue,
  liveTaskDoneKeys,
  listQueuedTaskDone,
  taskDoneRequestBody,
} from '../utils/taskDoneQueue.js';
import {
  flushSpeciesObservationQueue,
  liveSpeciesObservationKeys,
  listQueuedSpeciesObservations,
  removeQueuedSpeciesObservation,
  speciesObservationRequestBody,
} from '../utils/speciesObservationQueue.js';
import {
  flushPlantObservationQueue,
  loadPlantObservationQueue,
  savePlantObservationQueue,
} from '../utils/plantObservationQueue.js';
import {
  flushTutorialReadQueue,
  listQueuedTutorialReads,
  removeQueuedTutorialRead,
} from '../utils/tutorialReadQueue.js';
import { listJournalDrafts, isEmptyJournalDraft } from '../utils/journalDraftQueue.js';
import {
  deleteOfflinePhoto,
  getOfflinePhoto,
  pruneOrphanOfflinePhotos,
} from '../utils/offlinePhotoStore.js';

/** Événement de fenêtre émis quand le contenu de la boîte d'envoi change. */
export const OUTBOX_CHANGED_EVENT = 'foretmap_outbox_changed';
export const QUEUED_AT_HEADER = 'X-Foretmap-Queued-At';
export const REPLAY_HEADER = 'X-Foretmap-Replay';

export const OUTBOX_KINDS = Object.freeze({
  tutorialRead: 'tutorial_read',
  taskDone: 'task_done',
  speciesObservation: 'species_observation',
  plantObservation: 'plant_observation',
  journalDraft: 'journal_draft',
});

/** En-têtes d'un rejeu (télémétrie anonyme des envois différés). */
export function replayHeaders(item, via = 'page') {
  const queuedAt = Number(item?.queued_at);
  return {
    ...(Number.isFinite(queuedAt) && queuedAt > 0 ? { [QUEUED_AT_HEADER]: String(queuedAt) } : {}),
    [REPLAY_HEADER]: via,
  };
}

export function notifyOutboxChanged(detail = {}) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT, { detail }));
  } catch {
    /* environnement sans CustomEvent */
  }
}

// --- Envois unitaires (utilisés aussi par les écrans qui rejouent leur propre file) ---

export function sendQueuedTutorialRead(item) {
  return api(
    `/api/tutorials/${encodeURIComponent(item.tutorial_id)}/acknowledge-read`,
    'POST',
    { confirm: true },
    { headers: replayHeaders(item) },
  );
}

/** « Tâche faite » rejouée, avec sa photo gardée hors ligne si elle existe encore. */
export async function sendQueuedTaskDone(item) {
  const imageData = item.has_photo ? await getOfflinePhoto(item.client_uuid) : null;
  const response = await api(
    `/api/tasks/${encodeURIComponent(item.task_id)}/done`,
    'POST',
    taskDoneRequestBody(item, imageData),
    { headers: replayHeaders(item) },
  );
  if (item.has_photo) await deleteOfflinePhoto(item.client_uuid);
  return response;
}

/**
 * Observation rejouée, puis sa photo. Une photo qui ne part pas faute de réseau garde
 * l'observation en file : au prochain essai, le serveur rejoue l'observation (même clé) et la
 * photo repart. Une photo refusée (format, taille) est abandonnée : l'observation est acquise.
 */
export async function sendQueuedSpeciesObservation(item) {
  const response = await createSpeciesObservation(speciesObservationRequestBody(item), {
    headers: replayHeaders(item),
  });
  if (!item.has_photo) return response;
  const photo = await getOfflinePhoto(item.client_uuid);
  const id = response?.observation?.id;
  if (photo && id) {
    try {
      await uploadSpeciesObservationPhoto(id, photo);
    } catch (err) {
      if (!isDefinitiveRefusal(err)) throw err;
      return { ...response, photo_refused: true };
    }
  }
  await deleteOfflinePhoto(item.client_uuid);
  return response;
}

export function sendQueuedPlantObservation(item) {
  return api(
    `/api/plants/${item.plant_id}/acknowledge-discovery`,
    'POST',
    { confirm: true, client_uuid: item.client_uuid },
    { headers: replayHeaders(item) },
  );
}

// --- Liste et rejeu de l'ensemble ---

/**
 * @typedef {{ kind: string, key: string, title: string, detail: string, queued_at: number,
 *   refused: boolean, error: string, error_code: string, has_photo: boolean,
 *   dismissible: boolean }} OutboxEntry
 */

/**
 * Toutes les écritures en attente du compte, dans l'ordre de rejeu.
 * @param {string|null|undefined} [userId] compte connecté (par défaut : la session)
 * @returns {OutboxEntry[]}
 */
export function listOutboxEntries(userId = getAuthUserId()) {
  const uid = String(userId ?? '').trim();
  if (!uid) return [];
  const base = (kind, item, extra) => ({
    kind,
    key: item.client_uuid,
    title: '',
    detail: '',
    queued_at: Number(item.queued_at) || 0,
    refused: !!item.refused,
    error: item.error || '',
    error_code: item.error_code || '',
    has_photo: !!item.has_photo,
    dismissible: true,
    ...extra,
  });
  return [
    ...listQueuedTutorialReads(uid).map((q) =>
      base(OUTBOX_KINDS.tutorialRead, q, { title: q.tutorial_title || 'Tutoriel' }),
    ),
    ...listQueuedTaskDone(uid).map((q) =>
      base(OUTBOX_KINDS.taskDone, q, { title: q.task_title || 'Tâche', detail: q.comment || '' }),
    ),
    ...listQueuedSpeciesObservations(uid).map((q) =>
      base(OUTBOX_KINDS.speciesObservation, q, {
        title: q.plant_label || 'Observation',
        detail: [q.place_label, q.text].filter(Boolean).join(' — '),
      }),
    ),
    ...loadPlantObservationQueue()
      .filter((q) => q.user_id === uid)
      .map((q) => base(OUTBOX_KINDS.plantObservation, q, { title: 'Espèce observée' })),
    ...listJournalDrafts(uid)
      .filter((d) => !isEmptyJournalDraft(d))
      .map((d) =>
        base(OUTBOX_KINDS.journalDraft, d, {
          title: d.title || 'Article du carnet',
          // Le brouillon se gère depuis le carnet (il peut être en cours d'édition).
          dismissible: false,
        }),
      ),
  ];
}

/** Nombre d'écritures en attente (refusées comprises) du compte. */
export const countOutboxEntries = (userId = getAuthUserId()) => listOutboxEntries(userId).length;

/** Retire une écriture de l'appareil (l'élève renonce à l'envoyer). */
export async function dismissOutboxEntry(kind, key) {
  if (kind === OUTBOX_KINDS.tutorialRead) removeQueuedTutorialRead(key);
  else if (kind === OUTBOX_KINDS.taskDone) dismissTaskDone(key);
  else if (kind === OUTBOX_KINDS.speciesObservation) removeQueuedSpeciesObservation(key);
  else if (kind === OUTBOX_KINDS.plantObservation) {
    savePlantObservationQueue(loadPlantObservationQueue().filter((q) => q.client_uuid !== key));
  } else return false;
  await deleteOfflinePhoto(key);
  notifyOutboxChanged({ reason: 'dismissed', kind });
  return true;
}

/** Photos qui n'accompagnent plus aucune écriture en file (tous comptes). */
export function pruneOutboxPhotos() {
  return pruneOrphanOfflinePhotos(
    new Set([...liveTaskDoneKeys(), ...liveSpeciesObservationKeys()]),
  );
}

const EMPTY_FLUSH = Object.freeze({
  synced: 0,
  dropped: 0,
  remaining: 0,
  sent: [],
  refused: [],
});

let flushInFlight = null;
let flushRerun = null;

/**
 * Rejoue toutes les files du compte connecté, dans l'ordre. Un seul rejeu à la fois dans la
 * page : une demande reçue pendant un rejeu (retour du réseau en cours de route) en programme
 * un seul autre, juste après — sinon elle recevrait le bilan d'un essai déjà échoué.
 * @param {{ userId?: string }} [options]
 * @returns {Promise<{ synced: number, dropped: number, remaining: number,
 *   sent: Array<{ kind: string, item: object, response: unknown }>,
 *   refused: Array<{ kind: string, item: object, message: string, kept: boolean, code: string }> }>}
 */
export function flushOutbox({ userId = getAuthUserId() } = {}) {
  const uid = String(userId ?? '').trim();
  if (!uid) return Promise.resolve(EMPTY_FLUSH);
  if (flushInFlight) {
    if (!flushRerun) {
      flushRerun = flushInFlight
        .catch(() => null)
        .then(() => {
          flushRerun = null;
          return flushOutbox({ userId: uid });
        });
    }
    return flushRerun;
  }
  flushInFlight = (async () => {
    const summary = { synced: 0, dropped: 0, remaining: 0, sent: [], refused: [] };
    const merge = (kind, out) => {
      if (!out) return;
      summary.synced += out.synced || 0;
      summary.dropped += out.dropped || 0;
      for (const s of out.sent || []) summary.sent.push({ kind, ...s });
      for (const r of out.refused || []) summary.refused.push({ kind, ...r });
    };
    const safe = (p) => p.catch(() => null);
    merge(
      OUTBOX_KINDS.tutorialRead,
      await safe(flushTutorialReadQueue(sendQueuedTutorialRead, uid)),
    );
    merge(OUTBOX_KINDS.taskDone, await safe(flushTaskDoneQueue(sendQueuedTaskDone, uid)));
    merge(
      OUTBOX_KINDS.speciesObservation,
      await safe(flushSpeciesObservationQueue(sendQueuedSpeciesObservation, uid)),
    );
    const plant = await safe(flushPlantObservationQueue(sendQueuedPlantObservation, uid));
    if (plant) {
      summary.synced += plant.synced || 0;
      summary.dropped += plant.dropped || 0;
    }
    await pruneOutboxPhotos().catch(() => 0);
    summary.remaining = listOutboxEntries(uid).length;
    if (summary.synced || summary.dropped || summary.refused.length) {
      notifyOutboxChanged({ reason: 'flushed', summary });
    }
    return summary;
  })().finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}

/** Codes stables des refus de `POST /api/tasks/:id/done` (voir `docs/API.md`). */
export const TASK_DONE_CONFLICT_REASONS = Object.freeze({
  task_not_found: 'la tâche a été supprimée entre-temps',
  task_archived: 'la tâche a été archivée entre-temps',
  not_assigned: 'tu n’es plus inscrit·e sur cette tâche',
  tutorials_unread: 'un tutoriel lié doit d’abord être lu',
});

const KIND_NOUNS = Object.freeze({
  [OUTBOX_KINDS.tutorialRead]: ['lecture de tutoriel', 'lectures de tutoriels'],
  [OUTBOX_KINDS.taskDone]: ['tâche', 'tâches'],
  [OUTBOX_KINDS.speciesObservation]: ['observation', 'observations'],
  [OUTBOX_KINDS.plantObservation]: ['espèce observée', 'espèces observées'],
});

/**
 * Message à afficher après un rejeu (ou `null` s'il n'y a rien à dire). Un refus passe avant
 * un succès : c'est lui qui demande une action de l'élève.
 * @param {Awaited<ReturnType<typeof flushOutbox>>} summary
 * @param {(item: object, response: unknown) => string|null} [closedMessage] message d'une tâche
 *   arrivée close entre-temps (`taskDoneAlreadyClosedMessage`)
 */
export function outboxFlushToast(summary, closedMessage = null) {
  if (!summary) return null;
  const firstRefusal = summary.refused?.[0];
  if (firstRefusal) {
    return outboxRefusalMessage(firstRefusal);
  }
  if (!summary.synced) return null;
  if (typeof closedMessage === 'function') {
    const closed = (summary.sent || [])
      .filter((s) => s.kind === OUTBOX_KINDS.taskDone)
      .map((s) => closedMessage(s.item, s.response))
      .find(Boolean);
    if (closed) return closed;
  }
  const kinds = new Set((summary.sent || []).map((s) => s.kind));
  if (summary.synced === 1 && kinds.size === 1) {
    const [kind] = kinds;
    if (kind === OUTBOX_KINDS.taskDone) return 'Ta tâche notée sans réseau est bien partie ✓';
    const [singular] = KIND_NOUNS[kind] || ['action'];
    return `Ton envoi en attente (${singular}) est bien parti ✓`;
  }
  if (kinds.size === 1 && kinds.has(OUTBOX_KINDS.taskDone)) {
    return `${summary.synced} tâches notées sans réseau sont bien parties ✓`;
  }
  return `${summary.synced} envois gardés sans réseau sont bien partis ✓`;
}

/**
 * Explication d'un refus définitif, selon son code stable quand le serveur en donne un.
 * @param {{ kind: string, item: object, message: string, kept: boolean, code?: string }} refusal
 */
export function outboxRefusalMessage({ kind, item, message, kept, code = '' }) {
  const sentence = (s) => {
    const t = String(s || '').trim();
    return /[.!?…]$/.test(t) ? t : `${t}.`;
  };
  const keptNote = kept
    ? ' Ton texte est gardé : tu peux le copier depuis « En attente d’envoi ».'
    : '';
  if (kind === OUTBOX_KINDS.taskDone) {
    const reason = TASK_DONE_CONFLICT_REASONS[code] || message;
    return `« ${item?.task_title || 'Tâche'} » n’a pas pu être marquée faite : ${sentence(reason)}${keptNote}`;
  }
  if (kind === OUTBOX_KINDS.tutorialRead) {
    return `La lecture de « ${item?.tutorial_title || 'ce tutoriel'} » n’a pas pu être enregistrée : ${sentence(message)}`;
  }
  if (kind === OUTBOX_KINDS.speciesObservation) {
    return `Ton observation n’a pas pu être envoyée : ${sentence(message)}${keptNote}`;
  }
  return `Un envoi en attente a été refusé : ${sentence(message)}`;
}
