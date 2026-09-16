/**
 * Halo « à découvrir » (visite) : sélectionne un petit sous-ensemble de lieux
 * non vus, les plus proches du centre du plan, pour un signal bref sans
 * allumer toute la carte.
 *
 * Clés au format `${type}:${id}` (même convention que `itemSeenKey`).
 */
import { parsePctPolygonPoints } from '../shared/pct-map/pctPolygon.js';
import { polygonPoleOfInaccessibilityPct } from '../shared/pct-map/pctPolylabel.js';

/** Nombre max de lieux mis en halo (densité élevée). */
export const DISCOVER_HALO_LIMIT = 5;

/** Durée d’affichage du halo (ms), alignée sur l’animation CSS. */
export const DISCOVER_HALO_MS = 2800;

/** @param {'zone'|'marker'} type @param {string|number} id */
function seenKey(type, id) {
  return `${type}:${id}`;
}

/**
 * Ancre d’un lieu en % image (pôle zone, ou coordonnées repère).
 * @param {object} place
 * @returns {{ xp: number, yp: number }|null}
 */
export function discoverPlaceAnchorPct(place) {
  if (!place) return null;
  const hasPoints = place.points != null && String(place.points).trim() !== '';
  if (!hasPoints && place.x_pct != null && place.y_pct != null) {
    const xp = Number(place.x_pct);
    const yp = Number(place.y_pct);
    return Number.isFinite(xp) && Number.isFinite(yp) ? { xp, yp } : null;
  }
  if (!hasPoints) return null;
  const points = parsePctPolygonPoints(place.points);
  if (!points || points.length < 3) return null;
  return (
    polygonPoleOfInaccessibilityPct(points) || {
      xp: points.reduce((sum, p) => sum + p.xp, 0) / points.length,
      yp: points.reduce((sum, p) => sum + p.yp, 0) / points.length,
    }
  );
}

/**
 * Clés `itemSeenKey` des lieux non vus les plus proches du centre.
 * @param {object} opts
 * @param {Array<object>} [opts.zones]
 * @param {Array<object>} [opts.markers]
 * @param {Set<string>} opts.seen
 * @param {{ xp?: number, yp?: number }} [opts.centerPct]
 * @param {number} [opts.limit]
 * @returns {Set<string>}
 */
export function pickDiscoverHaloKeys({
  zones = [],
  markers = [],
  seen,
  centerPct = { xp: 50, yp: 50 },
  limit = DISCOVER_HALO_LIMIT,
} = {}) {
  if (!(seen instanceof Set)) return new Set();
  const cx = Number(centerPct?.xp);
  const cy = Number(centerPct?.yp);
  const center = {
    xp: Number.isFinite(cx) ? cx : 50,
    yp: Number.isFinite(cy) ? cy : 50,
  };
  const max = Math.max(0, Math.floor(Number(limit) || 0));
  if (max === 0) return new Set();

  const candidates = [];

  for (const zone of zones || []) {
    if (zone == null || zone.id == null) continue;
    const key = seenKey('zone', zone.id);
    if (seen.has(key)) continue;
    const anchor = discoverPlaceAnchorPct(zone);
    if (!anchor) continue;
    const dx = anchor.xp - center.xp;
    const dy = anchor.yp - center.yp;
    candidates.push({ key, d2: dx * dx + dy * dy });
  }

  for (const marker of markers || []) {
    if (marker == null || marker.id == null) continue;
    const key = seenKey('marker', marker.id);
    if (seen.has(key)) continue;
    const anchor = discoverPlaceAnchorPct(marker);
    if (!anchor) continue;
    const dx = anchor.xp - center.xp;
    const dy = anchor.yp - center.yp;
    candidates.push({ key, d2: dx * dx + dy * dy });
  }

  candidates.sort((a, b) => a.d2 - b.d2 || a.key.localeCompare(b.key));
  return new Set(candidates.slice(0, max).map((c) => c.key));
}
