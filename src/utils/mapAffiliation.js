const MAP_AFFILIATION_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;

export function allowedMapIdsFromAffiliation(affiliation) {
  const normalized = String(affiliation || 'both').toLowerCase();
  if (normalized === 'n3') return ['n3'];
  if (normalized === 'foret') return ['foret'];
  if (normalized === 'both') return null;
  if (MAP_AFFILIATION_SLUG_RE.test(normalized)) return [normalized];
  return null;
}

export function mapsForAffiliationScope(maps, restrictedMapIds) {
  const safeMaps = Array.isArray(maps) ? maps : [];
  const activeMaps = safeMaps.filter((mp) => mp?.is_active !== false);
  const baseMaps = activeMaps.length > 0 ? activeMaps : safeMaps;
  if (!Array.isArray(restrictedMapIds) || restrictedMapIds.length === 0) return baseMaps;

  const allowed = new Set(restrictedMapIds.map((id) => String(id || '').trim()).filter(Boolean));
  if (allowed.size === 0) return baseMaps;

  const scopedActive = baseMaps.filter((mp) => allowed.has(String(mp?.id || '')));
  if (scopedActive.length > 0) return scopedActive;

  // Ne jamais retomber sur tous les plans : une affiliation mono-plan reste bornée,
  // même si le plan ciblé a été temporairement désactivé.
  return safeMaps.filter((mp) => allowed.has(String(mp?.id || '')));
}
