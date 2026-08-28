/**
 * Heuristiques d'affichage des libellés de zone (masquage adaptatif).
 */

/**
 * Aire d'un polygone (coordonnées quelconques, signe conservé).
 * @param {Array<{ cx: number, cy: number }>} pts
 */
export function polygonAreaAbs(pts) {
  if (!pts || pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.cx * b.cy - b.cx * a.cy;
  }
  return Math.abs(sum) / 2;
}

/**
 * Indique si le nom de zone doit s'afficher (zone assez grande à l'écran).
 *
 * @param {{ pts: Array<{xp:number,yp:number}>, iw: number, ih: number, inv: number, labelFontPx: number }} params
 */
export function shouldShowZoneNameLabel({ pts, iw, ih, inv, labelFontPx }) {
  if (!pts || pts.length < 3 || !(iw > 0) || !(ih > 0)) return false;
  const wp = pts.map((p) => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih }));
  const areaWorld = polygonAreaAbs(wp);
  const worldScale = inv > 0 ? 1 / inv : 1;
  const areaScreen = areaWorld * worldScale * worldScale;
  const labelApparentPx = Math.max(1, labelFontPx * worldScale);
  const minArea = (labelApparentPx * 4) ** 2;
  return areaScreen >= minArea;
}

/**
 * Largeur max (unités monde) pour un libellé long (≈ 80 px écran).
 * @param {number} inv inverse échelle monde
 */
export function zoneLabelMaxTextLengthWorld(inv) {
  const screenPx = 80;
  return Math.max(24, screenPx * (inv > 0 ? inv : 1));
}
