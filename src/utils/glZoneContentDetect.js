import {
  findZoneTriggeredOnMoveGeneric,
  pickZoneAtPctGeneric,
} from './glMapZoneDetect.js';

function zonePoints(zone) {
  return Array.isArray(zone?.points) ? zone.points : [];
}

export function zoneHasPopoverContent(zone) {
  const markdown = String(zone?.popoverMarkdown ?? zone?.popover_markdown ?? '').trim();
  if (markdown.length > 0) return true;
  const images = zone?.popoverImages ?? zone?.popover_images;
  return Array.isArray(images) && images.some((img) => String(img?.url || '').trim());
}

const kingdomZoneOptions = {
  getZonePoints: zonePoints,
  isZoneEligible: zoneHasPopoverContent,
};

export function pickContentZoneAtPct(zones, xPct, yPct) {
  return pickZoneAtPctGeneric(zones, xPct, yPct, kingdomZoneOptions);
}

export function findZoneTriggeredOnMove(prev, next, zones) {
  return findZoneTriggeredOnMoveGeneric(prev, next, zones, kingdomZoneOptions);
}
