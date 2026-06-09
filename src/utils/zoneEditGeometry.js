/**
 * Géométrie d'édition d'une zone (polygone en pourcentages) — helpers purs.
 *
 * Extraits de `map-views.jsx` (O6) pour alléger le méga-composant et couvrir cette
 * logique par des tests. Les points sont des `{ xp, yp }` en pourcentage [0..100].
 */

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
  return pts.map((p) => clampEditZonePct({
    xp: (Number(p.xp) || 0) + dx,
    yp: (Number(p.yp) || 0) + dy,
  }));
}
