/**
 * Centrage doux de la carte sur une zone ou un repère.
 */

/** Centre % image d'un repère. */
export function markerFocusPct(marker) {
  return {
    xp: Number(marker?.x_pct) || 0,
    yp: Number(marker?.yp) || 0,
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

/**
 * Applique pan + zoom pour centrer un point % image dans le conteneur.
 * @param {{ xp: number, yp: number }} focusPct
 * @param {object} params
 * @param {React.RefObject<HTMLElement>} params.containerRef
 * @param {{ current: { x: number, y: number, s: number } }} params.txRef
 * @param {{ w: number, h: number }} params.imgSize
 * @param {(scale: number, pivotX: number, pivotY: number) => void} params.animateZoomTowardScale
 * @param {() => void} [params.commit]
 * @param {number} [params.targetScale] zoom cible (défaut : max(scale actuelle, fit*1.35))
 */
export function focusMapOnPct(
  focusPct,
  { containerRef, txRef, imgSize, animateZoomTowardScale, commit, fitScale = 1, targetScale },
) {
  const container = containerRef?.current;
  const tx = txRef?.current;
  const iw = Number(imgSize?.w) || 1;
  const ih = Number(imgSize?.h) || 1;
  if (!container || !tx) return;

  const rect = container.getBoundingClientRect();
  const cw = rect.width || container.clientWidth || 1;
  const ch = rect.height || container.clientHeight || 1;

  const pivotX = cw / 2;
  const pivotY = ch / 2;

  const px = ((Number(focusPct?.xp) || 0) / 100) * iw;
  const py = ((Number(focusPct?.yp) || 0) / 100) * ih;

  const minScale = Math.max(Number(fitScale) || 0.15, 0.15);
  const desired =
    targetScale != null
      ? targetScale
      : Math.min(8, Math.max(tx.s, minScale * 1.35, (Number(fitScale) || 1) * 1.35));
  const ns = Math.max(minScale, desired);

  // Place le point sous le centre à l'échelle actuelle, puis zoome en gardant le pivot.
  tx.x = pivotX - px * tx.s;
  tx.y = pivotY - py * tx.s;

  if (typeof animateZoomTowardScale === 'function') {
    animateZoomTowardScale(ns, pivotX, pivotY);
  } else {
    tx.s = ns;
    tx.x = pivotX - px * ns;
    tx.y = pivotY - py * ns;
    commit?.();
  }
}
