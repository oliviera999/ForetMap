/**
 * Rectangle de rendu de l’image du plan en `object-fit: contain`.
 *
 * Implémentation canonique déplacée dans le module fédérateur `zoneGeometry.js`
 * (§5.3 de `docs/AUDIT_CODE_2026-07.md`) : ré-exportée ici sous son nom historique
 * pour ne casser aucun importateur (`visit-views.jsx`, `useGlBoardImageFit.js`,
 * alias `computeBiodivMapFitRect` de `biodivMapGeometry.js`).
 */
export { computeMapImageContainRect } from './zoneGeometry.js';

/**
 * Dimensions client d’une scène carte ; en plein écran, repli viewport si le layout n’est pas encore stabilisé.
 * @param {HTMLElement|null|undefined} el
 * @param {{ fullscreen?: boolean, minSide?: number }} [options]
 */
export function resolveMapStageClientBox(el, { fullscreen = false, minSide = 200 } = {}) {
  const vw = window.visualViewport?.width ?? window.innerWidth;
  const vh = window.visualViewport?.height ?? window.innerHeight;
  let cw = Math.max(1, el?.clientWidth || 0);
  let ch = Math.max(1, el?.clientHeight || 0);
  if (fullscreen && (cw < minSide || ch < minSide)) {
    return { cw: Math.max(1, vw), ch: Math.max(1, vh) };
  }
  return { cw, ch };
}
