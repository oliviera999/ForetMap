/**
 * Numérotation stable des zones feuillets (admin / édition plateau).
 * Tri par code feuillet puis zone_id (suffixe numérique).
 */

export function sortFeuilletZonesForDisplay(zones = []) {
  if (!Array.isArray(zones) || zones.length === 0) return [];
  return [...zones].sort((a, b) => {
    const codeA = String(a?.feuilletCode || a?.feuillet_code || '').trim();
    const codeB = String(b?.feuilletCode || b?.feuillet_code || '').trim();
    if (codeA && codeB && codeA !== codeB) {
      return codeA.localeCompare(codeB, 'fr', { sensitivity: 'base' });
    }
    return String(a?.zoneId || a?.zone_id || '').localeCompare(
      String(b?.zoneId || b?.zone_id || ''),
      'fr',
      { numeric: true, sensitivity: 'base' },
    );
  });
}

/** Numéros affichés (1, 2, 3… par défaut). */
export function buildFeuilletZoneNumberMap(sortedZones, startIndex = 1) {
  const map = new Map();
  const offset = startIndex === 1 ? 1 : 0;
  sortedZones.forEach((zone, idx) => {
    const id = String(zone?.zoneId || zone?.zone_id || '').trim();
    if (id) map.set(id, idx + offset);
  });
  return map;
}
