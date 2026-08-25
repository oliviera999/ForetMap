/**
 * Géométrie d'édition d'une zone (polygone en pourcentages) — helpers purs.
 *
 * Extraits de `map-views.jsx` (O6) pour alléger le méga-composant et couvrir cette
 * logique par des tests. Les points sont des `{ xp, yp }` en pourcentage [0..100].
 */

import { findNearestEdgeInsertion, insertPctPointAt } from '../shared/pct-map/pctPolygon.js';

/** Borne un point dans [0..100] sur chaque axe. */
export function clampEditZonePct(p) {
  return {
    xp: Math.min(100, Math.max(0, Number(p.xp) || 0)),
    yp: Math.min(100, Math.max(0, Number(p.yp) || 0)),
  };
}

/** Borne tous les points d'un polygone. */
export function clampEditPts(pts) {
  return (pts || []).map(clampEditZonePct);
}

/** Copie superficielle des points (nouvelle référence, mêmes coordonnées). */
export function cloneEditPts(pts) {
  return pts.map((p) => ({ xp: p.xp, yp: p.yp }));
}

/** Égalité de deux instantanés de polygone (même longueur + mêmes coordonnées). */
export function editPtsSnapshotEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].xp !== b[i].xp || a[i].yp !== b[i].yp) return false;
  }
  return true;
}

/** Décale le polygone (%) pour une copie visible à côté de l’original. */
export function offsetDuplicateZonePoints(pts, dx = 2.5, dy = 2.5) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  return pts.map((p) =>
    clampEditZonePct({
      xp: (Number(p.xp) || 0) + dx,
      yp: (Number(p.yp) || 0) + dy,
    }),
  );
}

// ——————————————————————————————————————————————————————————————————————
// Sommets : insertion, suppression, sélection multiple (lots « édition de contour »)
//
// La logique de projection/insertion est mutualisée avec la carte GL
// (`src/shared/pct-map/pctPolygon.js`, points `{x, y}`) ; on ne fait ici que
// l'adaptation de format vers les points ForetMap `{xp, yp}`.
// ——————————————————————————————————————————————————————————————————————

/** Nombre minimal de sommets d'un polygone de zone (garde-fou côté API : `routes/zones.js`). */
export const MIN_ZONE_POINTS = 3;

/** `{xp,yp}` → `{x,y}` (format des helpers partagés). */
function toSharedPoint(p) {
  return { x: Number(p?.xp) || 0, y: Number(p?.yp) || 0 };
}

/** `{x,y}` → `{xp,yp}` borné. */
function fromSharedPoint(p) {
  return clampEditZonePct({ xp: p?.x, yp: p?.y });
}

/** Indices valides, dédoublonnés et triés croissant. */
export function normalizeEditSelection(indices, length) {
  const max = Number(length) || 0;
  const out = [];
  const seen = new Set();
  for (const raw of indices || []) {
    const i = Number(raw);
    if (!Number.isInteger(i) || i < 0 || i >= max || seen.has(i)) continue;
    seen.add(i);
    out.push(i);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Cherche l'arête la plus proche d'un clic et le point projeté où insérer un sommet.
 * @param {Array<{xp:number,yp:number}>} pts
 * @param {{xp:number,yp:number}} click position du clic (% image)
 * @param {number} maxEdgeDist distance maximale au bord, en % d'image
 * @returns {{ index: number, point: {xp:number,yp:number} } | null} index d'insertion
 */
export function findEditEdgeInsertion(pts, click, maxEdgeDist = 3) {
  if (!Array.isArray(pts) || pts.length < 2 || !click) return null;
  const best = findNearestEdgeInsertion(pts.map(toSharedPoint), toSharedPoint(click), maxEdgeDist);
  if (!best) return null;
  return { index: best.insertIndex, point: fromSharedPoint(best.point) };
}

/** Insère un sommet à `index` (bornes tolérantes). */
export function insertEditPointAt(pts, index, point) {
  const shared = insertPctPointAt((pts || []).map(toSharedPoint), index, toSharedPoint(point));
  return shared.map(fromSharedPoint);
}

/**
 * Milieux d'arêtes (poignées « fantômes ») : un point par arête, arête de fermeture incluse.
 * `index` est l'index d'insertion du futur sommet.
 * @returns {Array<{xp:number,yp:number,index:number}>}
 */
export function editEdgeMidpoints(pts) {
  if (!Array.isArray(pts) || pts.length < 2) return [];
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const mid = clampEditZonePct({
      xp: ((Number(a?.xp) || 0) + (Number(b?.xp) || 0)) / 2,
      yp: ((Number(a?.yp) || 0) + (Number(b?.yp) || 0)) / 2,
    });
    out.push({ ...mid, index: i + 1 });
  }
  return out;
}

/**
 * Retire les sommets d'indices donnés. Refuse (renvoie le tableau d'origine) si la
 * suppression ferait passer le polygone sous `MIN_ZONE_POINTS` sommets.
 */
export function removeEditPointsAt(pts, indices) {
  if (!Array.isArray(pts)) return [];
  const targets = normalizeEditSelection(indices, pts.length);
  if (!targets.length) return pts;
  if (pts.length - targets.length < MIN_ZONE_POINTS) return pts;
  const drop = new Set(targets);
  return pts.filter((_p, i) => !drop.has(i));
}

/** Vrai si la suppression de `indices` est autorisée (au moins 3 sommets restants). */
export function canRemoveEditPoints(pts, indices) {
  if (!Array.isArray(pts)) return false;
  const targets = normalizeEditSelection(indices, pts.length);
  return targets.length > 0 && pts.length - targets.length >= MIN_ZONE_POINTS;
}

/**
 * Borne un déplacement `(dx, dy)` pour que les points visés restent dans [0..100] :
 * le groupe glisse le long du bord au lieu de s'écraser dessus.
 */
export function clampEditMoveDelta(pts, indices, dx, dy) {
  const targets = normalizeEditSelection(indices, (pts || []).length);
  let ddx = Number(dx) || 0;
  let ddy = Number(dy) || 0;
  if (!targets.length) return { dx: 0, dy: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const i of targets) {
    const p = pts[i];
    const x = Number(p?.xp) || 0;
    const y = Number(p?.yp) || 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  ddx = Math.max(-minX, Math.min(100 - maxX, ddx));
  ddy = Math.max(-minY, Math.min(100 - maxY, ddy));
  return { dx: ddx, dy: ddy };
}

/** Déplace uniquement les sommets sélectionnés, en conservant leurs positions relatives. */
export function moveEditPointsBy(pts, indices, dx, dy) {
  if (!Array.isArray(pts)) return [];
  const targets = new Set(normalizeEditSelection(indices, pts.length));
  if (!targets.size) return pts;
  const delta = clampEditMoveDelta(pts, [...targets], dx, dy);
  if (delta.dx === 0 && delta.dy === 0) return pts;
  return pts.map((p, i) =>
    targets.has(i)
      ? clampEditZonePct({ xp: (Number(p.xp) || 0) + delta.dx, yp: (Number(p.yp) || 0) + delta.dy })
      : p,
  );
}

/** Rectangle de lasso ordonné à partir de deux coins (% image). */
export function normalizeSelectionRect(a, b) {
  const ax = Number(a?.xp) || 0;
  const ay = Number(a?.yp) || 0;
  const bx = Number(b?.xp) || 0;
  const by = Number(b?.yp) || 0;
  return {
    x1: Math.min(ax, bx),
    y1: Math.min(ay, by),
    x2: Math.max(ax, bx),
    y2: Math.max(ay, by),
  };
}

/** Indices des sommets contenus dans le rectangle (bornes incluses). */
export function selectEditPointsInRect(pts, rect) {
  if (!Array.isArray(pts) || !rect) return [];
  const out = [];
  for (let i = 0; i < pts.length; i += 1) {
    const x = Number(pts[i]?.xp) || 0;
    const y = Number(pts[i]?.yp) || 0;
    if (x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2) out.push(i);
  }
  return out;
}

/** Réindexe une sélection après suppression des indices donnés. */
export function shiftSelectionAfterRemove(selection, removedIndices) {
  const removed = [...new Set((removedIndices || []).map(Number).filter(Number.isInteger))].sort(
    (a, b) => a - b,
  );
  const out = new Set();
  for (const raw of selection || []) {
    const i = Number(raw);
    if (!Number.isInteger(i) || removed.includes(i)) continue;
    const before = removed.filter((r) => r < i).length;
    out.add(i - before);
  }
  return out;
}
