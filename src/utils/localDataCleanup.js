/**
 * Nettoyage des données locales propres à un compte, à la déconnexion (audit RGPD du
 * 28/09/2026, S-8 — réglage `privacy.clear_local_data_on_logout`).
 *
 * Sur une tablette partagée, les files hors ligne gardent des textes écrits par l'élève
 * (rapport de tâche, brouillon de carnet, observation) et le service worker garde ses photos :
 * l'élève suivant pouvait les lire. Les préférences d'affichage (onglet, taille du texte,
 * mascotte…) ne disent rien de la personne et restent en place.
 */

import {
  safeLocalStorageReadJson,
  safeLocalStorageRemoveItem,
  safeLocalStorageWriteJson,
} from '../shared/platform/browserStorage.js';
import { TASK_DONE_QUEUE_STORAGE_KEY } from './taskDoneQueue.js';
import { SPECIES_OBSERVATION_QUEUE_STORAGE_KEY } from './speciesObservationQueue.js';
import { PLANT_OBSERVATION_QUEUE_STORAGE_KEY } from './plantObservationQueue.js';
import { JOURNAL_DRAFT_QUEUE_STORAGE_KEY } from './journalDraftQueue.js';
import { VISIT_SEEN_QUEUE_STORAGE_KEY } from './visitProgressClient.js';
import { PEDAGO_SESSION_STORAGE_KEY } from './pedagoSessionScope.js';

/** Files dont chaque entrée porte `user_id` : on ne retire que celles du compte qui sort. */
export const PER_ACCOUNT_QUEUE_KEYS = Object.freeze([
  TASK_DONE_QUEUE_STORAGE_KEY,
  SPECIES_OBSERVATION_QUEUE_STORAGE_KEY,
  PLANT_OBSERVATION_QUEUE_STORAGE_KEY,
  JOURNAL_DRAFT_QUEUE_STORAGE_KEY,
]);

/** File sans auteur (progression de visite) : elle appartient à la session qui se ferme. */
export const SHARED_QUEUE_KEYS = Object.freeze([VISIT_SEEN_QUEUE_STORAGE_KEY]);

function readQueue(key) {
  const raw = safeLocalStorageReadJson(key, []);
  return Array.isArray(raw) ? raw : [];
}

function belongsTo(item, uid) {
  return String(item?.user_id ?? '').trim() === uid;
}

/**
 * Nombre d'actions encore en attente d'envoi pour ce compte (confirmation avant de les perdre).
 * Une entrée refusée par le serveur et gardée pour l'élève (`refused`) compte aussi : c'est
 * un texte qu'il a écrit.
 * @param {string|null|undefined} userId
 * @returns {number}
 */
export function countPendingLocalActions(userId) {
  const uid = String(userId ?? '').trim();
  let count = 0;
  if (uid) {
    for (const key of PER_ACCOUNT_QUEUE_KEYS) {
      count += readQueue(key).filter((item) => belongsTo(item, uid)).length;
    }
  }
  for (const key of SHARED_QUEUE_KEYS) count += readQueue(key).length;
  return count;
}

/**
 * Retire de l'appareil les données locales du compte. Les entrées d'un autre compte restent :
 * elles attendent que leur auteur se reconnecte.
 * @param {string|null|undefined} userId
 */
export function clearLocalDataForAccount(userId) {
  const uid = String(userId ?? '').trim();
  for (const key of PER_ACCOUNT_QUEUE_KEYS) {
    const queue = readQueue(key);
    const kept = uid ? queue.filter((item) => !belongsTo(item, uid)) : queue;
    if (kept.length === 0) safeLocalStorageRemoveItem(key);
    else if (kept.length !== queue.length) safeLocalStorageWriteJson(key, kept);
  }
  for (const key of SHARED_QUEUE_KEYS) safeLocalStorageRemoveItem(key);
  try {
    if (typeof sessionStorage !== 'undefined')
      sessionStorage.removeItem(PEDAGO_SESSION_STORAGE_KEY);
  } catch {
    /* stockage de session indisponible */
  }
}

/** Photos et fichiers déposés par les utilisateurs (`/uploads/…`) gardés par le service worker. */
const USER_MEDIA_PATH_RE = /\/uploads\//;

/**
 * Retire du cache du service worker les photos déposées par les utilisateurs. Les bundles,
 * icônes et polices restent (rien de personnel). Meilleur effort : ne rejette jamais.
 * @returns {Promise<number>} nombre d'entrées retirées
 */
export async function purgeCachedUserMedia() {
  try {
    if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return 0;
    let removed = 0;
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        let url;
        try {
          url = new URL(request.url);
        } catch {
          continue;
        }
        if (!USER_MEDIA_PATH_RE.test(url.pathname)) continue;
        if (await cache.delete(request)) removed += 1;
      }
    }
    return removed;
  } catch {
    return 0;
  }
}

/**
 * Message de confirmation quand des actions non envoyées seraient perdues, sinon `null`.
 * @param {number} pending
 * @returns {string|null}
 */
export function pendingLossConfirmationMessage(pending) {
  const n = Number(pending) || 0;
  if (n <= 0) return null;
  const lost =
    n === 1
      ? '1 action n’a pas encore été envoyée (pas de réseau). Si vous vous déconnectez maintenant, elle sera effacée'
      : `${n} actions n’ont pas encore été envoyées (pas de réseau). Si vous vous déconnectez maintenant, elles seront effacées`;
  return `${lost} de cet appareil. Se déconnecter quand même ?`;
}
