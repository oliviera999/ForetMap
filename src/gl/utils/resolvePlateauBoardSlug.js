/**
 * Résout le slug médiathèque du fond de plateau pour un numéro 1–5.
 * Priorité : plateau-N_fond (canonique), sinon premier slug plateau-N_* image (hors _variante, hors audio).
 */
export function resolvePlateauBoardSlug(plateauNumber, knownSlugs = [], keyIndex = null) {
  const n = Number(plateauNumber);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;

  const index = keyIndex && typeof keyIndex === 'object' ? keyIndex : null;

  const slugs = new Set(
    (Array.isArray(knownSlugs) ? knownSlugs : Object.keys(knownSlugs || {}))
      .map((slug) => String(slug || '').trim())
      .filter(Boolean),
  );

  function isBoardSlug(slug) {
    if (!index) return true;
    const rel = index[slug]?.relativePath;
    if (!rel) return true;
    return !String(rel).replace(/\\/g, '/').includes('/audio/');
  }

  const exact = `plateau-${n}_fond`;
  if (slugs.has(exact) && isBoardSlug(exact)) return exact;

  const prefix = `plateau-${n}_`;
  const candidates = [...slugs]
    .filter((slug) => slug.startsWith(prefix) && !slug.includes('_variante') && isBoardSlug(slug))
    .sort();

  return candidates[0] ?? null;
}
