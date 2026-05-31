import { pointToElementPct, pointToRenderedImagePct } from '../../shared/pct-map/pctMapPointer.js';

export function glBoardPointToPct(event, boardEl, imageEl = null) {
  if (!event || !boardEl) return null;
  const point = imageEl
    ? pointToRenderedImagePct(event.clientX, event.clientY, imageEl, { decimals: 2 })
    : pointToElementPct(event.clientX, event.clientY, boardEl, { clamp: true, decimals: 2 });
  if (!point) return null;
  return {
    xp: point.x,
    yp: point.y,
  };
}
