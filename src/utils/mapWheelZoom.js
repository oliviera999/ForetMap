'use strict';

/**
 * Convertit WheelEvent.deltaY en « pixels virtuels » pour un zoom cohérent
 * entre trackpad (souvent DOM_DELTA_PIXEL) et souris (DOM_DELTA_LINE / PAGE).
 *
 * @param {Pick<WheelEvent, 'deltaY' | 'deltaMode'>} wheelEvent
 * @param {{ linePixels?: number, containerClientHeight?: number }} [options]
 * @returns {number}
 */
export function normalizeWheelDeltaYPixels(wheelEvent, options = {}) {
  const linePx = options.linePixels != null && options.linePixels > 0 ? options.linePixels : 16;
  const pageH =
    options.containerClientHeight != null && options.containerClientHeight > 0
      ? options.containerClientHeight
      : 600;
  let dy = Number(wheelEvent.deltaY) || 0;
  if (wheelEvent.deltaMode === 1) dy *= linePx;
  else if (wheelEvent.deltaMode === 2) dy *= pageH;
  return dy;
}

/**
 * Facteur multiplicatif d’échelle (à appliquer à l’échelle courante) pour un événement wheel.
 * Petits deltaY (trackpad) → petits pas ; grosses crans souris → pas bornés pour rester maniable.
 *
 * @param {Pick<WheelEvent, 'deltaY' | 'deltaMode'>} wheelEvent
 * @param {{ linePixels?: number, containerClientHeight?: number, pixelsPerZoomLevel?: number, minFactorPerEvent?: number, maxFactorPerEvent?: number }} [options]
 * @returns {number}
 */
export function wheelZoomScaleFactor(wheelEvent, options = {}) {
  const dy = normalizeWheelDeltaYPixels(wheelEvent, options);
  const pxPerZoom =
    options.pixelsPerZoomLevel != null && options.pixelsPerZoomLevel > 0
      ? options.pixelsPerZoomLevel
      : 380;
  const raw = 2 ** (-dy / pxPerZoom);
  const minF = options.minFactorPerEvent != null ? options.minFactorPerEvent : 0.72;
  const maxF = options.maxFactorPerEvent != null ? options.maxFactorPerEvent : 1.38;
  return Math.min(maxF, Math.max(minF, raw));
}
