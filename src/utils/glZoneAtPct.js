import { isPointInPolygon, polygonArea } from './glPointInPolygon.js';

function zoneMusicUrl(zone) {
  const urls = zoneMusicUrls(zone);
  return urls.length > 0 ? urls[0] : null;
}

function zoneMusicUrls(zone) {
  const urls = zone?.musicUrls ?? zone?.music_urls;
  if (Array.isArray(urls)) {
    return urls.map((url) => String(url || '').trim()).filter(Boolean);
  }
  const legacy = zone?.musicUrl ?? zone?.music_url ?? null;
  if (legacy == null) return [];
  const s = String(legacy).trim();
  return s.length > 0 ? [s] : [];
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
    const musicUrls = zoneMusicUrls(zone);
    if (musicUrls.length === 0) continue;
    const points = Array.isArray(zone?.points) ? zone.points : [];
    if (!isPointInPolygon(xPct, yPct, points)) continue;
    const area = polygonArea(points);
    if (area < bestArea) {
      bestArea = area;
      best = {
        ...zone,
        musicUrls,
        musicUrl: musicUrls[0],
        musicVolume: zoneMusicVolume(zone),
      };
    }
  }
  return best;
}

export { zoneMusicUrl, zoneMusicUrls, zoneMusicVolume };
