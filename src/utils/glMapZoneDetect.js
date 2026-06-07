import { isPointInPolygon, polygonArea } from './glPointInPolygon.js';

const TRAVERSE_SAMPLES = 10;

const defaultGetZonePoints = (zone) => (
  Array.isArray(zone?.points) ? zone.points : []
);

function pickSmallestZone(candidates, getZonePoints = defaultGetZonePoints) {
  if (!candidates.length) return null;
  let best = null;
  let bestArea = Infinity;
  for (const zone of candidates) {
    const area = polygonArea(getZonePoints(zone));
    if (area < bestArea) {
      bestArea = area;
      best = zone;
    }
  }
  return best;
}

function sampleSegmentPoints(prev, next, count = TRAVERSE_SAMPLES) {
  const samples = [];
  const steps = Math.max(2, count);
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    samples.push({
      xp: prev.xp + (next.xp - prev.xp) * t,
      yp: prev.yp + (next.yp - prev.yp) * t,
    });
  }
  return samples;
}

function segmentTraversesZone(prev, next, zone, getZonePoints) {
  const points = getZonePoints(zone);
  if (points.length < 3) return false;
  const prevIn = isPointInPolygon(prev.xp, prev.yp, points);
  const nextIn = isPointInPolygon(next.xp, next.yp, points);
  if (prevIn && nextIn) return false;
  if (!prevIn && nextIn) return true;
  const samples = sampleSegmentPoints(prev, next);
  let wasInside = prevIn;
  for (const sample of samples) {
    const inside = isPointInPolygon(sample.xp, sample.yp, points);
    if (!wasInside && inside) return true;
    wasInside = inside;
  }
  return false;
}

/**
 * @param {object[]} zones
 * @param {number} xPct
 * @param {number} yPct
 * @param {{ getZonePoints?: Function, isZoneEligible?: Function }} [options]
 */
export function pickZoneAtPctGeneric(zones, xPct, yPct, options = {}) {
  const getZonePoints = options.getZonePoints || defaultGetZonePoints;
  const isZoneEligible = options.isZoneEligible || (() => true);
  if (!Array.isArray(zones) || zones.length === 0) return null;
  const hits = zones.filter((zone) => {
    if (!isZoneEligible(zone)) return false;
    return isPointInPolygon(xPct, yPct, getZonePoints(zone));
  });
  return pickSmallestZone(hits, getZonePoints);
}

/**
 * @param {{ xp: number, yp: number }} prev
 * @param {{ xp: number, yp: number }} next
 * @param {object[]} zones
 * @param {{ getZonePoints?: Function, isZoneEligible?: Function }} [options]
 */
export function findZoneTriggeredOnMoveGeneric(prev, next, zones, options = {}) {
  const getZonePoints = options.getZonePoints || defaultGetZonePoints;
  const isZoneEligible = options.isZoneEligible || (() => true);
  if (!prev || !next || !Array.isArray(zones) || zones.length === 0) return null;
  const candidates = zones.filter((zone) => {
    if (!isZoneEligible(zone)) return false;
    const points = getZonePoints(zone);
    const prevIn = isPointInPolygon(prev.xp, prev.yp, points);
    const nextIn = isPointInPolygon(next.xp, next.yp, points);
    if (nextIn && !prevIn) return true;
    return segmentTraversesZone(prev, next, zone, getZonePoints);
  });
  return pickSmallestZone(candidates, getZonePoints);
}
