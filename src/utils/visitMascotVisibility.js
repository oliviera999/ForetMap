/**
 * Affichage de la mascotte sur le plan visite (hors modes édition prof).
 */

/**
 * @param {'view'|'draw-zone'|'add-marker'} mode
 * @param {number} visitCartographyTotal — `visitCartographyProgress.total` (zones à polygone valide + repères)
 * @param {unknown[]} [zones]
 * @param {unknown[]} [markers]
 */
export function shouldShowVisitMapMascot(mode, visitCartographyTotal, zones, markers) {
  const z = Array.isArray(zones) ? zones.length : 0;
  const m = Array.isArray(markers) ? markers.length : 0;
  const total = Number(visitCartographyTotal) || 0;
  return mode === 'view' && (total > 0 || z > 0 || m > 0);
}
