import { isPointInPolygon, polygonArea } from './glPointInPolygon.js';

const TRAVERSE_SAMPLES = 10;

function zonePoints(zone) {
  return Array.isArray(zone?.points) ? zone.points : [];
}

export function zoneHasPopoverContent(zone) {
  const markdown = String(zone?.popoverMarkdown ?? zone?.popover_markdown ?? '').trim();
  if (markdown.length > 0) return true;
  const images = zone?.popoverImages ?? zone?.popover_images;
  return Array.isArray(images) && images.some((img) => String(img?.url || '').trim());
}

function pickSmallestZone(candidates) {
  if (!candidates.length) return null;
  let best = null;
  let bestArea = Infinity;
  for (const zone of candidates) {
    const area = polygonArea(zonePoints(zone));
    if (area < bestArea) {
      bestArea = area;
      best = zone;
    }
  }
  return best;
}

export function pickContentZoneAtPct(zones, xPct, yPct) {
  if (!Array.isArray(zones) || zones.length === 0) return null;
  const hits = zones.filter((zone) => {
    if (!zoneHasPopoverContent(zone)) return false;
    return isPointInPolygon(xPct, yPct, zonePoints(zone));
  });
  return pickSmallestZone(hits);
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

function segmentTraversesZone(prev, next, zone) {
  const points = zonePoints(zone);
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

export function findZoneTriggeredOnMove(prev, next, zones) {
  if (!prev || !next || !Array.isArray(zones) || zones.length === 0) return null;
  const candidates = zones.filter((zone) => {
    if (!zoneHasPopoverContent(zone)) return false;
    const points = zonePoints(zone);
    const prevIn = isPointInPolygon(prev.xp, prev.yp, points);
    const nextIn = isPointInPolygon(next.xp, next.yp, points);
    if (nextIn && !prevIn) return true;
    return segmentTraversesZone(prev, next, zone);
  });
  return pickSmallestZone(candidates);
}
