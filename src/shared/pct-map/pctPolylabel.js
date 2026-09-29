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
 * `aspect` (largeur ÷ hauteur de l'image) rend les distances **isotropes** : 1 % de largeur et
 * 1 % de hauteur ne font pas le même nombre de pixels sur une image non carrée, et « le point le
 * plus éloigné des bords » calculé en pourcentages bruts favorisait l'axe le plus long
 * (`docs/AUDIT_ETIQUETTES_ZONES_2026-09-29.md` constat 6). Les abscisses sont donc dilatées de
 * `aspect` le temps du calcul — l'unité commune devient le « % de hauteur ».
 *
 * @param {Array<{ xp: number, yp: number }>} points sommets (en % de l'image).
 * @param {number} [precision] arrêt de la subdivision (en % de la hauteur de l'image).
 * @param {number} [aspect=1] rapport largeur ÷ hauteur de l'image.
 * @returns {{ xp: number, yp: number, distance: number }} point (en % de l'image) et distance
 *   au bord le plus proche (en % de la hauteur) ; pour moins de trois sommets, le centroïde
 *   avec une distance nulle.
 */
export function polygonPoleOfInaccessibilityPct(
  points,
  precision = PCT_POLYLABEL_PRECISION,
  aspect = 1,
) {
  const ratio = Number(aspect) > 0 && Number.isFinite(Number(aspect)) ? Number(aspect) : 1;
  if (ratio !== 1) {
    const stretched = (points || []).map((p) =>
      p ? { xp: Number(p.xp) * ratio, yp: Number(p.yp) } : p,
    );
    const pole = polygonPoleOfInaccessibilityPct(stretched, precision, 1);
    return { ...pole, xp: pole.xp / ratio };
  }
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

/** Points d'ancrage de repli proposés au-delà du pôle (bâtiments en bande, en L, en H…). */
export const PCT_LABEL_ALTERNATE_ANCHORS_MAX = 5;

/**
 * Points d'ancrage candidats d'un polygone : le pôle d'inaccessibilité **d'abord**, puis des
 * points de repli bien à l'intérieur et écartés les uns des autres.
 *
 * Pourquoi : un seul point par zone ne laisse aucune issue quand il est déjà pris — sur le plan
 * de Lyautey, la pastille de groupe « 🎬 2 » tombait pile sur l'emoji du bâtiment I, l'épingle
 * du Fablab sur celui du bâtiment T (`docs/AUDIT_ETIQUETTES_ZONES_2026-09-29.md`, seconde
 * passe). Le moteur d'étiquettes essaie ces points dans l'ordre, comme les positions candidates
 * des moteurs cartographiques (`text-variable-anchor` de Mapbox GL).
 *
 * Méthode : quadrillage de l'emprise (16 pas sur le grand côté, isotrope via `aspect`), points
 * gardés s'ils sont à au moins 35 % de la profondeur du pôle, triés du plus profond au moins
 * profond, puis retenus s'ils sont à distance du pôle et des points déjà retenus.
 *
 * @param {Array<{ xp: number, yp: number }>} points sommets (en % de l'image).
 * @param {number} [aspect=1] rapport largeur ÷ hauteur de l'image.
 * @param {{ max?: number }} [options] nombre maximal de points de repli.
 * @returns {Array<{ xp: number, yp: number, distance: number }>} pôle puis replis (en % de
 *   l'image ; `distance` en % de la hauteur) ; vide pour moins de trois sommets valides.
 */
export function polygonLabelAnchorsPct(
  points,
  aspect = 1,
  { max = PCT_LABEL_ALTERNATE_ANCHORS_MAX } = {},
) {
  const ratio = Number(aspect) > 0 && Number.isFinite(Number(aspect)) ? Number(aspect) : 1;
  const pts = (points || [])
    .filter((p) => p && Number.isFinite(Number(p.xp)) && Number.isFinite(Number(p.yp)))
    .map((p) => ({ xp: Number(p.xp) * ratio, yp: Number(p.yp) }));
  if (pts.length < 3) return [];
  const pole = polygonPoleOfInaccessibilityPct(pts, PCT_POLYLABEL_PRECISION, 1);
  const out = [{ xp: pole.xp / ratio, yp: pole.yp, distance: pole.distance }];
  const limit = Math.max(0, Math.floor(Number(max) || 0));
  if (!limit || !(pole.distance > 0)) return out;

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
  const long = Math.max(maxX - minX, maxY - minY);
  const step = long / 16;
  if (!(step > 0)) return out;
  const minDepth = pole.distance * 0.35;
  // Assez serré pour qu'un bâtiment trapu ait aussi des replis (au-delà d'environ une
  // profondeur de pôle, il n'en aurait aucun), assez large pour qu'ils ne se recouvrent pas.
  const spacing = Math.max(pole.distance * 0.6, long / 8);
  const samples = [];
  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let y = minY + step / 2; y < maxY; y += step) {
      const d = pointToPolygonDist(x, y, pts);
      if (d >= minDepth) samples.push({ x, y, d });
    }
  }
  samples.sort((a, b) => b.d - a.d);
  const kept = [{ x: pole.xp, y: pole.yp }];
  for (const s of samples) {
    if (out.length > limit) break;
    if (kept.some((k) => Math.hypot(k.x - s.x, k.y - s.y) < spacing)) continue;
    kept.push({ x: s.x, y: s.y });
    out.push({ xp: s.x / ratio, yp: s.y, distance: s.d });
  }
  return out;
}
