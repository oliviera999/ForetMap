/**
 * Points d’un polygone zone visite / carte (JSON), en pourcentages 0–100.
 * @param {string} raw
 * @returns {{ xp: number, yp: number }[]}
 */
export function parseVisitZonePoints(raw) {
  try {
    const points = JSON.parse(raw || '[]');
    if (!Array.isArray(points)) return [];
    return points
      .map((p) => ({
        xp: Number(p?.xp),
        yp: Number(p?.yp),
      }))
      .filter((p) => Number.isFinite(p.xp) && Number.isFinite(p.yp));
  } catch (_) {
    return [];
  }
}

/**
 * Centroïde d’une zone visite (repère %), ou null si polygone invalide.
 * @param {{ points?: string } | null | undefined} zone
 * @returns {{ xp: number, yp: number } | null}
 */
export function visitZoneCentroidPct(zone) {
  const points = parseVisitZonePoints(zone?.points);
  if (points.length < 3) return null;
  const xp = points.reduce((s, pt) => s + pt.xp, 0) / points.length;
  const yp = points.reduce((s, pt) => s + pt.yp, 0) / points.length;
  return { xp, yp };
}
