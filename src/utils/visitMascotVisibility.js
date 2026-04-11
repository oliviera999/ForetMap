/**
 * Affichage de la mascotte sur le plan visite (hors modes édition prof).
 */

/**
 * @param {'view'|'draw-zone'|'add-marker'} mode
 * @param {number} visitCartographyTotal — `visitCartographyProgress.total` (zones à polygone valide + repères)
 * @param {unknown[]} [zones]
 * @param {unknown[]} [markers]
 * @param {number} [tutorialCount] — tutoriels actifs renvoyés par `/api/visit/content` pour ce plan
 */
export function getVisitMascotVisibilityReason(mode, visitCartographyTotal, zones, markers, tutorialCount = 0) {
  const z = Array.isArray(zones) ? zones.length : 0;
  const m = Array.isArray(markers) ? markers.length : 0;
  const t = Math.max(0, Number(tutorialCount) || 0);
  const total = Number(visitCartographyTotal) || 0;
  if (mode !== 'view') return 'mode-not-view';
  if (total > 0) return 'cartography-total';
  if (z > 0) return 'zones';
  if (m > 0) return 'markers';
  if (t > 0) return 'tutorials';
  return 'no-public-content';
}

export function shouldShowVisitMapMascot(mode, visitCartographyTotal, zones, markers, tutorialCount = 0) {
  const reason = getVisitMascotVisibilityReason(mode, visitCartographyTotal, zones, markers, tutorialCount);
  return reason !== 'mode-not-view' && reason !== 'no-public-content';
}
