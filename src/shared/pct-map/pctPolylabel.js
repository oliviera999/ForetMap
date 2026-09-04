/**
 * Pôle d'inaccessibilité d'un polygone — point le plus « à l'intérieur » (lot 5,
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` N4).
 *
 * Pourquoi : les étiquettes de zone sont posées au **centroïde**, qui tombe hors du polygone
 * dès qu'une zone est en L, en U ou en croissant — l'étiquette flotte alors sur une autre
 * zone, ou dans le vide. Le pôle d'inaccessibilité est le point intérieur le plus éloigné de
 * tout bord : c'est là qu'un nom tient.
 *
 * Algorithme : subdivision par quadrillage avec file de priorité, d'après **polylabel** de
 * Mapbox (licence ISC, https://github.com/mapbox/polylabel) — réimplémenté ici en JavaScript
 * pur, sans dépendance, avec une file triée simple (les polygones de zone comptent quelques
 * dizaines de sommets : un tas binaire n'apporterait rien de mesurable).
 *
 * Coordonnées en pourcentage de l'image (`{ xp, yp }`), comme partout dans le noyau carte.
 */

/** Précision par défaut, en pourcentage de l'image (0,5 % ≈ quelques pixels à l'écran). */
export const PCT_POLYLABEL_PRECISION = 0.5;

/** Distance signée d'un point au polygone : positive à l'intérieur, négative à l'extérieur. */
function pointToPolygonDist(x, y, points) {
  let inside = false;
  let minDistSq = Infinity;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.yp > y !== b.yp > y && x < ((b.xp - a.xp) * (y - a.yp)) / (b.yp - a.yp) + a.xp) {
      inside = !inside;
    }
    minDistSq = Math.min(minDistSq, segmentDistSq(x, y, a, b));
  }
  const dist = Math.sqrt(minDistSq);
  return inside ? dist : -dist;
}

/** Carré de la distance d'un point au segment [a, b]. */
function segmentDistSq(px, py, a, b) {
  let x = a.xp;
  let y = a.yp;
  let dx = b.xp - x;
  let dy = b.yp - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = b.xp;
      y = b.yp;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  dx = px - x;
  dy = py - y;
  return dx * dx + dy * dy;
}

/** Cellule carrée du quadrillage, avec sa borne supérieure de distance (potentiel `max`). */
function makeCell(x, y, h, points) {
  const d = pointToPolygonDist(x, y, points);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

/** Centroïde de surface du polygone (point de départ, et repli quand l'aire est nulle). */
export function polygonCentroidPct(points) {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const f = a.xp * b.yp - b.xp * a.yp;
    area += f * 3;
    x += (a.xp + b.xp) * f;
    y += (a.yp + b.yp) * f;
  }
  if (area === 0) {
    const n = points.length || 1;
    return {
      xp: points.reduce((s, p) => s + p.xp, 0) / n,
      yp: points.reduce((s, p) => s + p.yp, 0) / n,
    };
  }
  return { xp: x / area, yp: y / area };
}

/**
 * Pôle d'inaccessibilité d'un polygone simple.
 *
 * @param {Array<{ xp: number, yp: number }>} points sommets (en % de l'image).
 * @param {number} [precision] arrêt de la subdivision (en % de l'image).
 * @returns {{ xp: number, yp: number, distance: number }} point et distance au bord le plus
 *   proche ; pour moins de trois sommets, le centroïde avec une distance nulle.
 */
export function polygonPoleOfInaccessibilityPct(points, precision = PCT_POLYLABEL_PRECISION) {
  const pts = (points || []).filter(
    (p) => p && Number.isFinite(Number(p.xp)) && Number.isFinite(Number(p.yp)),
  );
  if (pts.length < 3) {
    const fallback = pts.length ? polygonCentroidPct(pts) : { xp: 0, yp: 0 };
    return { ...fallback, distance: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.xp);
    minY = Math.min(minY, p.yp);
    maxX = Math.max(maxX, p.xp);
    maxY = Math.max(maxY, p.yp);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);
  if (cellSize === 0) return { xp: minX, yp: minY, distance: 0 };

  let h = cellSize / 2;
  const queue = [];
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      queue.push(makeCell(x + h, y + h, h, pts));
    }
  }

  const centroid = polygonCentroidPct(pts);
  let best = makeCell(centroid.xp, centroid.yp, 0, pts);
  const bboxCell = makeCell(minX + width / 2, minY + height / 2, 0, pts);
  if (bboxCell.d > best.d) best = bboxCell;

  const step = Math.max(Number(precision) || PCT_POLYLABEL_PRECISION, 1e-4);
  // File triée par potentiel décroissant : on explore d'abord la cellule qui peut encore
  // contenir un meilleur point que le champion courant.
  while (queue.length) {
    queue.sort((a, b) => a.max - b.max);
    const cell = queue.pop();
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= step) continue;
    h = cell.h / 2;
    queue.push(
      makeCell(cell.x - h, cell.y - h, h, pts),
      makeCell(cell.x + h, cell.y - h, h, pts),
      makeCell(cell.x - h, cell.y + h, h, pts),
      makeCell(cell.x + h, cell.y + h, h, pts),
    );
  }
  return { xp: best.x, yp: best.y, distance: best.d };
}
