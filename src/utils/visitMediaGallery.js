/**
 * Helpers purs de la galerie média de la visite — extraits de `visit-views.jsx` (O6).
 *
 * Allègent le méga-composant `visit-views.jsx` et couvrent par des tests une logique sinon
 * noyée dans le JSX : résolution de la source d'image (vignette / lightbox), réordonnancement
 * par glisser-déposer, et clé d'identité « vu » d'un item.
 */
import { withAppBase } from '../services/api';

/** Clé d'identité « vu » d'un item (zone/marqueur/…) : `${type}:${id}`. */
export function itemSeenKey(type, id) {
  return `${type}:${id}`;
}

/** Source principale d'un média de visite (préfixée par la base de l'app), ou '' si absente. */
export function visitMediaImgSrc(m) {
  const u = m?.image_url;
  if (!u) return '';
  return withAppBase(u);
}

/** Vignette galerie visite : préfère `thumb_url` (carte) si fourni par l'API, sinon l'image. */
export function visitMediaGalleryThumbDisplaySrc(m) {
  const u = m?.thumb_url || m?.image_url;
  if (!u) return '';
  return withAppBase(u);
}

/** Image plein écran (lightbox) : toujours la résolution principale (repli sur la vignette). */
export function visitMediaGalleryLightboxSrc(m) {
  const u = m?.image_url || m?.thumb_url;
  if (!u) return '';
  return withAppBase(u);
}

/**
 * Réordonne une liste de médias après un glisser-déposer : déplace l'élément `draggedId` à la
 * position de `dropTargetId`. Retourne la liste inchangée (même référence) si l'un des ids est
 * introuvable ou si source == cible ; sinon une nouvelle liste (référence neuve).
 */
export function reorderVisitMediaRows(list, draggedId, dropTargetId) {
  const ids = list.map((m) => m.id);
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(dropTargetId);
  if (from < 0 || to < 0 || from === to) return list;
  const next = [...list];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}
