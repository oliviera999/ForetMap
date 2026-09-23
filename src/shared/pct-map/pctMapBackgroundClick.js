/**
 * Cibles qui ne doivent **pas** déclencher le clic « fond de carte »
 * (déplacement mascotte, pose de repère Visite, etc.).
 *
 * Important : exclure `.fm-pct-zone` (groupe d'une zone), **pas** `.fm-pct-zones`
 * (SVG plein cadre). Sinon tout clic hors polygone est avalé et la mascotte
 * ne se déplace plus vers un point libre.
 */
export const PCT_MAP_BACKGROUND_CLICK_IGNORE_SELECTOR = [
  '.fm-pct-map-controls',
  '.plan-map-controls',
  '.fm-map-action',
  '.fm-pct-marker',
  '.fm-pct-cluster',
  '.fm-pct-zone',
  '.fm-pct-label',
  '.map-route-bar',
  '.map-route-resume',
].join(', ');

/**
 * @param {EventTarget|null|undefined} target
 * @returns {boolean} true si le clic doit être ignoré par le handler fond
 */
export function shouldIgnorePctMapBackgroundClick(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest(PCT_MAP_BACKGROUND_CLICK_IGNORE_SELECTOR));
}
