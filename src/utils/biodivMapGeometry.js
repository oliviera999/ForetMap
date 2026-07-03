/**
 * Helpers purs de géométrie de la carte biodiversité — extraits de `foretmap-views.jsx` (O6).
 *
 * Les implémentations étaient dupliquées ligne à ligne avec la carte visite : ce module
 * ré-exporte désormais les implémentations uniques sous leurs alias historiques.
 * - `parseZonePointsJson` ≡ `parseVisitZonePoints` (`visitMapGeometry.js`) ;
 * - `computeBiodivMapFitRect` ≡ `computeMapImageContainRect` (`mapImageFit.js`).
 */

export { parseVisitZonePoints as parseZonePointsJson } from './visitMapGeometry.js';
export { computeMapImageContainRect as computeBiodivMapFitRect } from './mapImageFit.js';
