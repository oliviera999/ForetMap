function collectRawFallbacks(mapRecord) {
  if (!mapRecord || typeof mapRecord !== 'object') return [];
  const fromArray = Array.isArray(mapRecord.fallback_image_urls)
    ? mapRecord.fallback_image_urls
    : Array.isArray(mapRecord.fallback_urls)
      ? mapRecord.fallback_urls
      : null;
  if (fromArray) return fromArray;
  const raw = String(mapRecord.fallback_image_urls || mapRecord.fallback_urls || '').trim();
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/g)
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function pushUnique(list, seen, value) {
  const normalized = String(value || '').trim();
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  list.push(normalized);
}

/**
 * Construit une liste de fallback d'image de carte indépendante d'IDs historiques.
 */
export function buildMapImageCandidates(mapRecord) {
  const out = [];
  const seen = new Set();
  pushUnique(out, seen, mapRecord?.map_image_url);
  for (const fallbackUrl of collectRawFallbacks(mapRecord)) {
    pushUnique(out, seen, fallbackUrl);
  }
  // Fallback ultime pour rester compatible avec les installations historiques.
  pushUnique(out, seen, '/map.png');
  return out;
}
