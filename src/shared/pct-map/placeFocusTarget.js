/**
 * Cible du cadrage « zoom sur le lieu avant sa fiche » (`usePlaceFocusSequence`) : les points à
 * faire tenir dans la vue et le zoom maximal à appliquer.
 *
 * Une zone est cadrée sur **tout son contour** ; un repère, point seul, est centré à un zoom
 * fixe. Dans les deux cas, le zoom est plafonné par le réglage (`maxZoom`). Les zooms sont
 * relatifs à l'échelle d'ajustement (1 = carte entière), comme `flyToPctBounds`.
 */

import { parsePctPolygonPoints } from './pctPolygon.js';

/** Zoom d'un repère, en multiple de la carte entière. */
export const PLACE_FOCUS_MARKER_ZOOM = 2.5;

function finitePoint(xp, yp) {
  const x = Number(xp);
  const y = Number(yp);
  return Number.isFinite(x) && Number.isFinite(y) ? { xp: x, yp: y } : null;
}

/** Points d'un contour : JSON stocké, ou tableau `{ xp, yp }` / `{ x, y }`. */
function polygonPoints(raw) {
  if (Array.isArray(raw)) {
    return raw.map((p) => finitePoint(p?.xp ?? p?.x, p?.yp ?? p?.y)).filter(Boolean);
  }
  if (typeof raw === 'string') return parsePctPolygonPoints(raw);
  return [];
}

/** Position d'un repère : `x_pct`/`y_pct` (ForetMap), `xp`/`yp` ou `x`/`y` (GL). */
function markerPoint(place) {
  return (
    finitePoint(place?.x_pct, place?.y_pct) ||
    finitePoint(place?.xp, place?.yp) ||
    finitePoint(place?.x, place?.y)
  );
}

/**
 * @param {object|null} place lieu sélectionné ; `kind` vaut `'zone'` ou `'marker'`.
 * @param {{ maxZoom?: number, markerZoom?: number }} [options]
 * @returns {{ kind: 'zone'|'marker', points: Array<{ xp: number, yp: number }>,
 *   maxZoom: number }|null} `null` si le lieu n'a aucune géométrie exploitable.
 */
export function placeFocusTarget(
  place,
  { maxZoom = 4, markerZoom = PLACE_FOCUS_MARKER_ZOOM } = {},
) {
  if (!place || typeof place !== 'object') return null;
  const cap = Number(maxZoom) > 1 ? Number(maxZoom) : 1;
  const markerCap = Math.min(cap, Number(markerZoom) > 1 ? Number(markerZoom) : 1);
  if (place.kind !== 'marker') {
    const points = polygonPoints(place.points ?? place.polygon);
    if (points.length >= 3) return { kind: 'zone', points, maxZoom: cap };
    if (points.length > 0) return { kind: 'zone', points, maxZoom: markerCap };
  }
  const point = markerPoint(place);
  if (!point) return null;
  return { kind: 'marker', points: [point], maxZoom: markerCap };
}
