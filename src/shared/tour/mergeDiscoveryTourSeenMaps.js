/**
 * Fusion de cartes « parcours déjà vu » (union des clés vraies).
 * Partagé ForetMap / G&L — aucune dépendance produit.
 *
 * @param {Record<string, unknown>|null|undefined} a
 * @param {Record<string, unknown>|null|undefined} b
 * @returns {Record<string, true>}
 */
export function mergeDiscoveryTourSeenMaps(a, b) {
  const out = {};
  for (const src of [a, b]) {
    if (!src || typeof src !== 'object') continue;
    for (const [key, flag] of Object.entries(src)) {
      if (!key) continue;
      if (flag === true || flag === 1 || flag === '1' || flag === 'true') {
        out[key] = true;
      }
    }
  }
  return out;
}
