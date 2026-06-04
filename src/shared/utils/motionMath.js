/** Calcule la progression de scroll (0–1) pour une fenêtre ou un élément scrollable. */
export function computeScrollProgress({ scrollTop, scrollHeight, clientHeight }) {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return Math.min(1, Math.max(0, scrollTop / max));
}

/** Valeur interpolée pour un compteur animé (ease-out cubique). */
export function easeOutCubic(t) {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

/** Valeur arrondie d'un compteur animé entre start et end. */
export function countUpValue(start, end, progress) {
  const from = Number(start);
  const to = Number(end);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return end;
  const eased = easeOutCubic(progress);
  return Math.round(from + (to - from) * eased);
}

/** Parse rootMargin IntersectionObserver (1 à 4 valeurs, unités px). */
export function parseRootMargin(rootMargin = '0px') {
  const parts = String(rootMargin).trim().split(/\s+/).filter(Boolean);
  const toPx = (value) => {
    const m = /^(-?\d+(?:\.\d+)?)(px)?$/.exec(String(value || '').trim());
    return m ? Number(m[1]) : 0;
  };
  if (parts.length === 0) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (parts.length === 1) {
    const v = toPx(parts[0]);
    return { top: v, right: v, bottom: v, left: v };
  }
  if (parts.length === 2) {
    const v0 = toPx(parts[0]);
    const v1 = toPx(parts[1]);
    return { top: v0, right: v1, bottom: v0, left: v1 };
  }
  if (parts.length === 3) {
    return { top: toPx(parts[0]), right: toPx(parts[1]), bottom: toPx(parts[2]), left: toPx(parts[1]) };
  }
  return {
    top: toPx(parts[0]),
    right: toPx(parts[1]),
    bottom: toPx(parts[2]),
    left: toPx(parts[3]),
  };
}

/**
 * Ratio d'intersection cible / zone utile (aligné sur IntersectionObserver + rootMargin).
 * @param {Element} el
 * @param {{ rootMargin?: string, threshold?: number, viewport?: { top?: number, left?: number, width: number, height: number } }} [options]
 */
export function isElementScrollRevealVisible(el, options = {}) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return false;
  const {
    rootMargin = '0px 0px -80px 0px',
    threshold = 0.08,
    viewport = null,
  } = options;
  const vp = viewport || {
    top: 0,
    left: 0,
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  };
  const margin = parseRootMargin(rootMargin);
  const rootTop = (vp.top ?? 0) - margin.top;
  const rootLeft = (vp.left ?? 0) - margin.left;
  const rootBottom = (vp.top ?? 0) + vp.height + margin.bottom;
  const rootRight = (vp.left ?? 0) + vp.width + margin.right;
  const rect = el.getBoundingClientRect();
  const intersectTop = Math.max(rect.top, rootTop);
  const intersectLeft = Math.max(rect.left, rootLeft);
  const intersectBottom = Math.min(rect.bottom, rootBottom);
  const intersectRight = Math.min(rect.right, rootRight);
  const w = Math.max(0, intersectRight - intersectLeft);
  const h = Math.max(0, intersectBottom - intersectTop);
  const intersectArea = w * h;
  const targetArea = Math.max(1, rect.width * rect.height);
  const ratio = intersectArea / targetArea;
  const minRatio = Math.max(0, Math.min(1, Number(threshold) || 0));
  return ratio >= minRatio;
}
