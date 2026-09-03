/**
 * Points de centrage (% image) d'une zone ou d'un repère — le centrage lui-même est porté par
 * `focusOnPct` du moteur partagé (`src/shared/pct-map/usePctMapViewport.js`).
 */

/** Centre % image d'un repère. */
export function markerFocusPct(marker) {
  return {
    xp: Number(marker?.x_pct) || 0,
    // `y_pct` (colonne API) — lisait `marker.yp`, absent des repères : centrage toujours en haut.
    yp: Number(marker?.y_pct) || 0,
  };
}

/** Centre % image (bbox) d'une zone à partir de points JSON. */
export function zoneFocusPctFromPoints(pointsJson) {
  let pts;
  try {
    pts = pointsJson ? JSON.parse(pointsJson) : [];
  } catch (_e) {
    pts = [];
  }
  if (!Array.isArray(pts) || pts.length < 1) return { xp: 50, yp: 50 };
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += Number(p?.xp) || 0;
    sy += Number(p?.yp) || 0;
  }
  return { xp: sx / pts.length, yp: sy / pts.length };
}
