/** Utilitaires polygones en coordonnées % (0–100), alignés carte ForetMap / GL. */

export function clampPctCoord(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const bounded = Math.max(0, Math.min(100, n));
  if (decimals == null) return bounded;
  return Number(bounded.toFixed(decimals));
}

/** @param {{ x?: number, y?: number, xp?: number, yp?: number }} point */
export function normalizePctPoint(point, decimals = 2) {
  const x = point?.x ?? point?.xp;
  const y = point?.y ?? point?.yp;
  return {
    x: clampPctCoord(x, decimals),
    y: clampPctCoord(y, decimals),
  };
}

export function normalizePctPoints(points, decimals = 2) {
  if (!Array.isArray(points)) return [];
  return points.map((p) => normalizePctPoint(p, decimals));
}

export function clonePctPoints(points) {
  return (points || []).map((p) => ({ x: p.x, y: p.y }));
}

export function pctPointsEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y) return false;
  }
  return true;
}

export function pointsToSvgPolygon(points) {
  if (!Array.isArray(points)) return '';
  return points.map((p) => `${Number(p.x)},${Number(p.y)}`).join(' ');
}

export function translatePctPoints(points, dx, dy, decimals = 2) {
  return (points || []).map((p) => normalizePctPoint({
    x: (Number(p.x) || 0) + dx,
    y: (Number(p.y) || 0) + dy,
  }, decimals));
}

export function offsetDuplicatePctPoints(points, dx = 2.5, dy = 2.5, decimals = 2) {
  if (!Array.isArray(points) || points.length < 3) return null;
  return translatePctPoints(points, dx, dy, decimals);
}

function distSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Projection du point P sur le segment AB (coordonnées %). */
export function projectPointOnSegmentPct(p, a, b) {
  const ax = Number(a.x) || 0;
  const ay = Number(a.y) || 0;
  const bx = Number(b.x) || 0;
  const by = Number(b.y) || 0;
  const px = Number(p.x) || 0;
  const py = Number(p.y) || 0;
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-8) return normalizePctPoint(a);
  let t = ((px - ax) * abx + (py - ay) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return normalizePctPoint({ x: ax + t * abx, y: ay + t * aby });
}

/**
 * Insère un sommet sur l’arête la plus proche du clic (si distance ≤ maxEdgeDist).
 * @returns {{ index: number, point: { x: number, y: number } } | null}
 */
export function findNearestEdgeInsertion(points, click, maxEdgeDist = 3) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const px = Number(click.x) || 0;
  const py = Number(click.y) || 0;
  const maxSq = maxEdgeDist * maxEdgeDist;
  let best = null;
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const proj = projectPointOnSegmentPct({ x: px, y: py }, a, b);
    const dSq = distSq(px, py, proj.x, proj.y);
    if (dSq <= maxSq && (!best || dSq < best.dSq)) {
      best = { dSq, insertIndex: i + 1, point: proj };
    }
  }
  return best;
}

export function insertPctPointAt(points, index, point) {
  const next = clonePctPoints(points);
  const i = Math.max(0, Math.min(next.length, Number(index) || 0));
  next.splice(i, 0, normalizePctPoint(point));
  return next;
}

export function removePctPointAt(points, index) {
  if (!Array.isArray(points) || points.length <= 3) return points;
  const next = clonePctPoints(points);
  const i = Number(index);
  if (!Number.isFinite(i) || i < 0 || i >= next.length) return next;
  next.splice(i, 1);
  return next;
}
