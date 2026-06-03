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
