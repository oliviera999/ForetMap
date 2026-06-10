/**
 * Helpers purs de géométrie de la carte biodiversité — extraits de `foretmap-views.jsx` (O6).
 *
 * Parsing tolérant des points de zone (pourcentages) et calcul du rectangle « contain » d'une
 * image dans une boîte (offset + dimensions centrées). Logique géométrique isolée pour test.
 */

/** Parse un JSON de points de zone en `{ xp, yp }` numériques finis ; `[]` si invalide. */
export function parseZonePointsJson(raw) {
  try {
    const points = JSON.parse(raw || '[]');
    if (!Array.isArray(points)) return [];
    return points
      .map((p) => ({ xp: Number(p?.xp), yp: Number(p?.yp) }))
      .filter((p) => Number.isFinite(p.xp) && Number.isFinite(p.yp));
  } catch (_) {
    return [];
  }
}

/**
 * Rectangle « contain » d'une image (`nw`×`nh`) centrée dans une boîte (`cw`×`ch`).
 * Sans dimensions naturelles, remplit la boîte. Retourne `{ offsetX, offsetY, width, height }`.
 */
export function computeBiodivMapFitRect(nw, nh, cw, ch) {
  const boxW = Math.max(1, cw);
  const boxH = Math.max(1, ch);
  if (!nw || !nh) {
    return { offsetX: 0, offsetY: 0, width: boxW, height: boxH };
  }
  const scale = Math.min(boxW / nw, boxH / nh);
  const width = nw * scale;
  const height = nh * scale;
  const offsetX = (boxW - width) / 2;
  const offsetY = (boxH - height) / 2;
  return { offsetX, offsetY, width, height };
}
