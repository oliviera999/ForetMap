import { pointToElementPct } from '../../shared/pct-map/pctMapPointer.js';

export function glBoardPointToPct(event, boardEl) {
  if (!event || !boardEl) return null;
  const point = pointToElementPct(event.clientX, event.clientY, boardEl, { clamp: true, decimals: 2 });
  if (!point) return null;
  return {
    xp: point.x,
    yp: point.y,
  };
}
