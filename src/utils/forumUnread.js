/**
 * Point « messages non lus » du forum — module pur.
 *
 * Le serveur fournit le marqueur (identifiant) du dernier message publié par quelqu'un
 * d'autre ; le curseur de lecture vit dans le navigateur, par utilisateur, comme celui des
 * commentaires contextuels. Pas de table « lu / non lu » côté serveur : le repère est donc
 * propre à l'appareil.
 *
 * Les identifiants sont des UUID : on compare par **égalité**, jamais par ordre.
 */

import { readJsonStorage, writeJsonStorage } from '../shared/notifications/storage.js';

/** Événement diffusé quand le curseur bouge (plusieurs lecteurs dans le même onglet). */
export const FORUM_READ_EVENT = 'foretmap_forum_read';

export function forumReadCursorKey(userType, userId) {
  return `foretmap:forumReadCursor:${String(userType || '')}:${String(userId || '')}`;
}

function normalizeMarker(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Dernier message vu (chaîne vide si le forum n'a jamais été consulté sur cet appareil). */
export function readForumReadCursor(userType, userId) {
  if (!userType || !userId) return '';
  const raw = readJsonStorage(forumReadCursorKey(userType, userId), '');
  return normalizeMarker(typeof raw === 'string' ? raw : raw?.latestPostId);
}

export function writeForumReadCursor(userType, userId, marker) {
  const next = normalizeMarker(marker);
  if (!userType || !userId || !next) return next;
  writeJsonStorage(forumReadCursorKey(userType, userId), next);
  try {
    window.dispatchEvent(new CustomEvent(FORUM_READ_EVENT, { detail: { marker: next } }));
  } catch (_) {
    /* pas de fenêtre (tests hors DOM) : le stockage suffit */
  }
  return next;
}

/**
 * Y a-t-il un message d'autrui non lu ?
 *
 * Sans curseur et avec au moins un message : forum jamais consulté, donc non lu — même
 * choix que les commentaires contextuels (mieux vaut signaler une fois que taire).
 */
export function hasUnreadForumPosts(latestPostId, cursor) {
  const latest = normalizeMarker(latestPostId);
  if (!latest) return false;
  return latest !== normalizeMarker(cursor);
}
