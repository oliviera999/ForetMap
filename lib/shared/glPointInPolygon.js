'use strict';

/**
 * Ray casting — un point est-il dans un polygone ? Coordonnées en % (0–100).
 *
 * Miroir CJS de `src/gl/utils/glPointInPolygon.js`, au caractère près : le serveur doit
 * conclure exactement comme l'écran du joueur. Une divergence d'arrondi produirait le pire
 * des cas — une mascotte visiblement dans la zone, refusée par l'API.
 *
 * @param {number} x
 * @param {number} y
 * @param {Array<{x:number,y:number}>} points
 * @returns {boolean}
 */
function isPointInPolygon(x, y, points) {
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

module.exports = { isPointInPolygon };
