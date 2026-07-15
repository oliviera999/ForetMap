import { parseZonePoints } from './zoneGeometry.js';

/**
 * Points d'un polygone zone visite / carte (JSON), en pourcentages 0–100.
 * @deprecated Alias historique de {@link parseZonePoints} (`zoneGeometry.js`, module
 *   fédérateur §5.3). Conservé pour ne casser aucun importateur.
 * @type {typeof parseZonePoints}
 */
export const parseVisitZonePoints = parseZonePoints;

/**
 * Centroïde d'une zone visite (repère %), ou null si polygone invalide.
 * @param {{ points?: string } | null | undefined} zone
 * @returns {{ xp: number, yp: number } | null}
 */
export function visitZoneCentroidPct(zone) {
  const points = parseZonePoints(zone?.points);
  if (points.length < 3) return null;
  const xp = points.reduce((s, pt) => s + pt.xp, 0) / points.length;
  const yp = points.reduce((s, pt) => s + pt.yp, 0) / points.length;
  return { xp, yp };
}
