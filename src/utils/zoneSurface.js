/**
 * Surface réelle estimée des zones sur les cartes calées GPS (m² / ha), pour les
 * personnels : fiche zone, tracé/retouche du contour et inventaire « Zones & repères ».
 */
import { polygonAreaM2 } from '../shared/pct-map/pctGeoTransform.js';
import { parseZonePoints } from './zoneGeometry.js';

const HECTARE_M2 = 10000;

/**
 * @param {number | null | undefined} m2
 * @returns {string | null} « ≈ 1 234 m² » sous 1 ha, « ≈ 1,23 ha » au-delà
 */
export function formatSurface(m2) {
  if (typeof m2 !== 'number' || !Number.isFinite(m2) || m2 < 0) return null;
  if (m2 < HECTARE_M2) {
    return `≈ ${Math.round(m2).toLocaleString('fr-FR')} m²`;
  }
  const ha = (m2 / HECTARE_M2).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `≈ ${ha} ha`;
}

/**
 * @param {{ points?: unknown } | null | undefined} zone points JSON stocké ou tableau `{xp, yp}`
 * @param {unknown} georef ancres de calage de la carte de la zone
 * @returns {number | null}
 */
export function zoneSurfaceM2(zone, georef) {
  if (!zone || !Array.isArray(georef)) return null;
  const raw = zone.points;
  const points = Array.isArray(raw) ? parseZonePoints(JSON.stringify(raw)) : parseZonePoints(raw);
  return polygonAreaM2(points, georef);
}

/**
 * @param {{ xp: number, yp: number }[]} points
 * @param {unknown} georef
 * @returns {string | null}
 */
export function pointsSurfaceLabel(points, georef) {
  if (!Array.isArray(georef)) return null;
  return formatSurface(polygonAreaM2(points, georef));
}
