/**
 * Utilitaires partagés pour dupliquer repères et zones sur la carte GL
 * (décalage léger pour éviter le chevauchement exact).
 */

export const DUPLICATE_MAP_OFFSET_PCT = 3;

export function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

export function offsetPctCoordinate(value, offset = DUPLICATE_MAP_OFFSET_PCT) {
  return clampPct(Number(value) + offset);
}

export function duplicateMapLabel(label, suffix = ' (copie)') {
  const base = String(label || '').trim() || 'Élément';
  return `${base}${suffix}`;
}

export function offsetPctPoints(points, offset = DUPLICATE_MAP_OFFSET_PCT) {
  if (!Array.isArray(points)) return [];
  return points.map((point) => ({
    x: offsetPctCoordinate(point?.x, offset),
    y: offsetPctCoordinate(point?.y, offset),
  }));
}
