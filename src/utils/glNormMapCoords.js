/** Conversion coords normalisées 0–1 (origine haut-gauche) ↔ pourcentage GL 0–100. */

export function normToPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n * 100;
}

export function pctToNorm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}

/** @param {[number, number] | { x?: number, y?: number }} point */
export function normPointToPct(point) {
  if (Array.isArray(point)) {
    return { x: normToPct(point[0]), y: normToPct(point[1]) };
  }
  return { x: normToPct(point?.x), y: normToPct(point?.y) };
}

/** @param {{ x?: number, y?: number, xp?: number, yp?: number }} point */
export function pctPointToNorm(point) {
  const x = point?.x ?? point?.xp;
  const y = point?.y ?? point?.yp;
  return [pctToNorm(x), pctToNorm(y)];
}

/** @param {Array<[number, number]>} polygon */
export function normPolygonToPctPoints(polygon) {
  if (!Array.isArray(polygon)) return [];
  return polygon.map((pt) => normPointToPct(pt));
}

/** @param {Array<{ x: number, y: number }>} points */
export function pctPointsToNormPolygon(points) {
  if (!Array.isArray(points)) return [];
  return points.map((pt) => pctPointToNorm(pt));
}
