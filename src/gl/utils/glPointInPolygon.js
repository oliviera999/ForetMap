/**
 * Ray casting — point dans un polygone (coordonnées % 0–100).
 * @param {number} x
 * @param {number} y
 * @param {Array<{x:number,y:number}>} points
 */
export function isPointInPolygon(x, y, points) {
  if (!Array.isArray(points) || points.length < 3) return false;
  const px = Number(x);
  const py = Number(y);
  if (!Number.isFinite(px) || !Number.isFinite(py)) return false;

  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = Number(points[i]?.x);
    const yi = Number(points[i]?.y);
    const xj = Number(points[j]?.x);
    const yj = Number(points[j]?.y);
    if (
      !Number.isFinite(xi) ||
      !Number.isFinite(yi) ||
      !Number.isFinite(xj) ||
      !Number.isFinite(yj)
    ) {
      continue;
    }
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Aire absolue d'un polygone (formule du lacet).
 * @param {Array<{x:number,y:number}>} points
 */
export function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = Number(points[i]?.x);
    const yi = Number(points[i]?.y);
    const xj = Number(points[j]?.x);
    const yj = Number(points[j]?.y);
    if (
      !Number.isFinite(xi) ||
      !Number.isFinite(yi) ||
      !Number.isFinite(xj) ||
      !Number.isFinite(yj)
    ) {
      continue;
    }
    sum += (xj + xi) * (yj - yi);
  }
  return Math.abs(sum / 2);
}
