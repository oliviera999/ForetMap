/**
 * État « déjà vu » des messages reçus sur les lieux — module pur.
 *
 * Le repère de lecture vit dans le navigateur, comme celui du centre de notifications : il
 * n'existe pas de table « lu / non lu » côté serveur, et en inventer une pour ce seul écran
 * coûterait une migration et une écriture par ouverture de panneau. Conséquence assumée :
 * le repère est propre à l'appareil.
 *
 * Les dates comparées viennent toutes du serveur (`created_at` sérialisé en ISO 8601), donc
 * une comparaison de chaînes suffit et reste chronologique.
 */

import { readJsonStorage, writeJsonStorage } from '../shared/notifications/storage.js';

/** Clé de stockage du repère de lecture. */
export const PLACE_MESSAGES_SEEN_KEY = 'foretmap_place_messages_last_seen';

/**
 * Événement diffusé quand le repère bouge : les deux lecteurs du même état (le panneau de la
 * console et la règle du centre de notifications) se resynchronisent sans passer par un
 * contexte React traversant toute l'application.
 */
export const PLACE_MESSAGES_SEEN_EVENT = 'foretmap_place_messages_seen';

/** Horodatage de la dernière lecture (chaîne vide si l'écran n'a jamais été ouvert). */
export function readPlaceMessagesLastSeen() {
  const raw = readJsonStorage(PLACE_MESSAGES_SEEN_KEY, '');
  return typeof raw === 'string' ? raw : '';
}

/** Écrit le repère de lecture et prévient les autres lecteurs de l'onglet. */
export function writePlaceMessagesLastSeen(value) {
  const next = String(value || '');
  writeJsonStorage(PLACE_MESSAGES_SEEN_KEY, next);
  try {
    window.dispatchEvent(new CustomEvent(PLACE_MESSAGES_SEEN_EVENT, { detail: { at: next } }));
  } catch (_) {
    /* pas de fenêtre (tests hors DOM) : le stockage suffit */
  }
  return next;
}

/** Date ISO du message le plus récent d'une liste déjà triée du plus récent au plus ancien. */
export function newestPlaceMessageDate(items) {
  const first = Array.isArray(items) ? items[0] : null;
  return first?.created_at ? String(first.created_at) : '';
}

/**
 * Messages postérieurs au repère de lecture.
 *
 * Sans repère (premier usage), on ne déclare **pas** tout l'historique non lu : annoncer
 * « 30 nouveaux messages » à quelqu'un qui ouvre l'écran pour la première fois ne renseigne
 * sur rien. La liste est alors considérée comme déjà vue.
 */
export function unreadPlaceMessages(items, lastSeenAt) {
  const since = String(lastSeenAt || '');
  if (!since) return [];
  return (Array.isArray(items) ? items : []).filter(
    (item) => item?.created_at && String(item.created_at) > since,
  );
}
