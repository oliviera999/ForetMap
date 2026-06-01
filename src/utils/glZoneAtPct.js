import { isPointInPolygon, polygonArea } from './glPointInPolygon.js';

function zoneMusicUrl(zone) {
  const url = zone?.musicUrl ?? zone?.music_url ?? null;
  if (url == null) return null;
  const s = String(url).trim();
  return s.length > 0 ? s : null;
}

function zoneMusicVolume(zone, fallback = 0.7) {
  const raw = zone?.musicVolume ?? zone?.music_volume;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

/**
 * Retourne la zone la plus spécifique (plus petite aire) contenant le point et ayant une musique.
 * @param {Array<object>} zones
 * @param {number} xPct
 * @param {number} yPct
 * @returns {object|null}
 */
export function pickZoneAtPct(zones, xPct, yPct) {
  if (!Array.isArray(zones) || zones.length === 0) return null;
  let best = null;
  let bestArea = Infinity;
  for (const zone of zones) {
    const musicUrl = zoneMusicUrl(zone);
    if (!musicUrl) continue;
    const points = Array.isArray(zone?.points) ? zone.points : [];
    if (!isPointInPolygon(xPct, yPct, points)) continue;
    const area = polygonArea(points);
    if (area < bestArea) {
      bestArea = area;
      best = {
        ...zone,
        musicUrl,
        musicVolume: zoneMusicVolume(zone),
      };
    }
  }
  return best;
}

export { zoneMusicUrl, zoneMusicVolume };
