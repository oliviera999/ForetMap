/**
 * Point « messages non lus » du forum — module pur.
 *
 * Le serveur fournit le dernier message publié par quelqu'un d'autre (identifiant + date) ; le
 * curseur de lecture vit dans le navigateur, par utilisateur, comme celui des commentaires
 * contextuels. Pas de table « lu / non lu » côté serveur : le repère est donc propre à
 * l'appareil.
 *
 * La comparaison se fait **par date** (fournie par le serveur, à la milliseconde) : comparer
 * les seuls identifiants rallumait le point quand le dernier message disparaissait (suppression,
 * sortie du périmètre), puisque le serveur désignait alors un message plus ancien, différent du
 * curseur. Les identifiants (UUID) ne servent qu'à reconnaître le même message.
 */

import { readJsonStorage, writeJsonStorage } from '../shared/notifications/storage.js';

/** Événement diffusé quand le curseur bouge (plusieurs lecteurs dans le même onglet). */
export const FORUM_READ_EVENT = 'foretmap_forum_read';

export const EMPTY_FORUM_MARKER = Object.freeze({ id: '', at: '' });

export function forumReadCursorKey(userType, userId) {
  return `foretmap:forumReadCursor:${String(userType || '')}:${String(userId || '')}`;
}

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

/**
 * Repère `{ id, at }`. Accepte l'ancien format (identifiant seul, sans date) et la réponse
 * serveur (`latest_post_id` / `latest_post_at`).
 */
export function normalizeForumMarker(value) {
  if (value == null) return EMPTY_FORUM_MARKER;
  if (typeof value === 'string' || typeof value === 'number') {
    return { id: normalizeString(value), at: '' };
  }
  const id = normalizeString(value.id ?? value.latestPostId ?? value.latest_post_id);
  if (!id) return EMPTY_FORUM_MARKER;
  return { id, at: normalizeString(value.at ?? value.latest_post_at) };
}

/** Dernier message vu (repère vide si le forum n'a jamais été consulté sur cet appareil). */
export function readForumReadCursor(userType, userId) {
  if (!userType || !userId) return EMPTY_FORUM_MARKER;
  return normalizeForumMarker(readJsonStorage(forumReadCursorKey(userType, userId), ''));
}

export function writeForumReadCursor(userType, userId, marker) {
  const next = normalizeForumMarker(marker);
  if (!userType || !userId || !next.id) return next;
  writeJsonStorage(forumReadCursorKey(userType, userId), next);
  try {
    window.dispatchEvent(new CustomEvent(FORUM_READ_EVENT, { detail: { marker: next } }));
  } catch (_) {
    /* pas de fenêtre (tests hors DOM) : le stockage suffit */
  }
  return next;
}

function toTime(value) {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * Y a-t-il un message d'autrui non lu ?
 *
 * - Même message que le curseur : lu.
 * - Les deux dates connues : non lu seulement si le dernier message est **plus récent** que le
 *   curseur (un message supprimé ne ramène jamais un plus ancien au rang de « non lu »).
 * - Curseur sans date (ancien format) ou absent : non lu dès que l'identifiant diffère.
 */
export function hasUnreadForumPosts(latest, cursor) {
  const last = normalizeForumMarker(latest);
  if (!last.id) return false;
  const seen = normalizeForumMarker(cursor);
  if (last.id === seen.id) return false;
  if (last.at && seen.at) {
    const lastTime = toTime(last.at);
    const seenTime = toTime(seen.at);
    if (lastTime != null && seenTime != null) return lastTime > seenTime;
    return last.at > seen.at;
  }
  return true;
}
