const DEFAULT_MARGIN = 8;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function panelRect(left, top, width, height) {
  return { left, top, right: left + width, bottom: top + height };
}

function overlapArea(a, b) {
  if (!a || !b) return 0;
  const dx = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const dy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return dx * dy;
}

function fitsViewport(rect, viewportWidth, viewportHeight, margin) {
  return (
    rect.left >= margin &&
    rect.top >= margin &&
    rect.right <= viewportWidth - margin &&
    rect.bottom <= viewportHeight - margin
  );
}

/**
 * Positionne le popover de dés pour limiter le chevauchement avec le plateau (repères, équipes).
 * Priorité : sous le plateau, puis sous l’ancre FAB, puis emplacement avec recouvrement minimal.
 */
export function computeGlDicePopoverPosition({
  anchorRect,
  panelWidth,
  panelHeight,
  avoidRect = null,
  viewportWidth,
  viewportHeight,
  margin = DEFAULT_MARGIN,
}) {
  const vw = Number(viewportWidth) || 0;
  const vh = Number(viewportHeight) || 0;
  if (!anchorRect || vw <= 0 || vh <= 0) {
    return { top: margin, left: margin };
  }

  const clampPos = (left, top) => ({
    left: clamp(left, margin, Math.max(margin, vw - panelWidth - margin)),
    top: clamp(top, margin, Math.max(margin, vh - panelHeight - margin)),
  });

  const candidates = [];

  if (avoidRect) {
    candidates.push(() => clampPos(avoidRect.left, avoidRect.bottom + margin));
    candidates.push(() => clampPos(avoidRect.right + margin, avoidRect.top));
  }

  candidates.push(() => clampPos(anchorRect.left, anchorRect.bottom + margin));
  candidates.push(() => clampPos(anchorRect.left, anchorRect.top - panelHeight - margin));
  candidates.push(() =>
    clampPos(anchorRect.left - panelWidth - margin, anchorRect.bottom - panelHeight),
  );

  let bestFallback = null;
  let bestOverlap = Infinity;

  for (const build of candidates) {
    const pos = build();
    const rect = panelRect(pos.left, pos.top, panelWidth, panelHeight);
    if (!fitsViewport(rect, vw, vh, margin)) continue;
    const overlap = avoidRect ? overlapArea(rect, avoidRect) : 0;
    if (overlap === 0) return pos;
    if (overlap < bestOverlap) {
      bestOverlap = overlap;
      bestFallback = pos;
    }
  }

  if (bestFallback) return bestFallback;
  return clampPos(margin, vh - panelHeight - margin);
}
