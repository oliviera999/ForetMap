/**
 * Helpers pour la barre d'échelle et la rose des vents sur un plan calé GPS.
 * Les dimensions réelles viennent de `planSizeMeters` ; le zoom courant convertit
 * mètres ↔ pixels écran.
 */

import {
  applyGeoTransform,
  planSizeMeters,
  pctToGeo,
  solveAffineFromAnchors,
} from './pctGeoTransform.js';
import { northOffsetFromProjection } from './positionGeometry.js';

/** Longueurs « jolies » pour une barre d'échelle (mètres). */
const NICE_METERS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/**
 * Mètres par pixel écran, d'après la largeur réelle du plan et le zoom.
 * @param {{ widthM?: number }|null} planSize
 * @param {number} contentWidthPx largeur du contenu à l'échelle 1 (px)
 * @param {number} scale zoom courant (`committed.s`)
 * @returns {number|null}
 */
export function metersPerScreenPixel(planSize, contentWidthPx, scale) {
  const widthM = Number(planSize?.widthM);
  const w = Number(contentWidthPx);
  const s = Number(scale);
  if (!(widthM > 0) || !(w > 0) || !(s > 0) || !Number.isFinite(s)) return null;
  const mpp = widthM / (w * s);
  return Number.isFinite(mpp) && mpp > 0 ? mpp : null;
}

/**
 * Choisit une longueur d'échelle lisible proche de `targetPx` pixels.
 * @param {number} metersPerPx
 * @param {number} [targetPx=80]
 * @returns {{ meters: number, widthPx: number, label: string }|null}
 */
export function niceScaleBar(metersPerPx, targetPx = 80) {
  const mpp = Number(metersPerPx);
  const target = Number(targetPx);
  if (!(mpp > 0) || !Number.isFinite(mpp) || !(target > 0)) return null;
  const idealM = mpp * target;
  let best = NICE_METERS[0];
  let bestScore = Infinity;
  for (const candidate of NICE_METERS) {
    const score = Math.abs(Math.log(candidate / idealM));
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  const widthPx = best / mpp;
  if (!(widthPx > 0) || !Number.isFinite(widthPx)) return null;
  const label = best >= 1000 ? `${best / 1000} km` : `${best} m`;
  return { meters: best, widthPx, label };
}

/**
 * Angle du nord dans l'image (degrés, 0 = nord vers le haut), déduit du calage.
 * @param {unknown} georef
 * @returns {number}
 */
export function northOffsetDegFromGeoref(georef) {
  const transform = solveAffineFromAnchors(georef);
  if (!transform) return 0;
  const center = pctToGeo(50, 50, georef);
  return northOffsetFromProjection(
    (lat, lng) => applyGeoTransform(transform, lat, lng),
    center || { lat: 0, lng: 0 },
  );
}

/**
 * Rotation CSS de la flèche « N » pour qu'elle pointe le nord géographique à l'écran.
 * `orientationDeg` = rotation du calque carte (heading-up), sinon 0.
 * @param {number} northOffsetDeg
 * @param {number} [orientationDeg=0]
 * @returns {number}
 */
export function compassNeedleDeg(northOffsetDeg, orientationDeg = 0) {
  const n = Number(northOffsetDeg);
  const o = Number(orientationDeg);
  const north = Number.isFinite(n) ? n : 0;
  const orient = Number.isFinite(o) ? o : 0;
  return (((north + orient) % 360) + 360) % 360;
}

/**
 * Données d'affichage pour l'overlay (échelle + nord), ou `null` si inutilisable.
 * @param {object} options
 * @param {unknown} options.georef
 * @param {number} options.contentWidthPx
 * @param {number} options.scale
 * @param {number} [options.orientationDeg=0]
 * @param {number} [options.targetBarPx=80]
 * @returns {{
 *   planSize: { widthM: number, heightM: number },
 *   scaleBar: { meters: number, widthPx: number, label: string },
 *   northOffsetDeg: number,
 *   needleDeg: number,
 * }|null}
 */
export function resolveScaleCompassDisplay({
  georef,
  contentWidthPx,
  scale,
  orientationDeg = 0,
  targetBarPx = 80,
} = {}) {
  const planSize = planSizeMeters(georef);
  if (!planSize) return null;
  const mpp = metersPerScreenPixel(planSize, contentWidthPx, scale);
  if (mpp == null) return null;
  const scaleBar = niceScaleBar(mpp, targetBarPx);
  if (!scaleBar) return null;
  const northOffsetDeg = northOffsetDegFromGeoref(georef);
  return {
    planSize,
    scaleBar,
    northOffsetDeg,
    needleDeg: compassNeedleDeg(northOffsetDeg, orientationDeg),
  };
}

export default resolveScaleCompassDisplay;
