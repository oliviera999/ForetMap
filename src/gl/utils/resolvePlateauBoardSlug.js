/**
 * Résout le slug médiathèque du fond de plateau pour un numéro 1–5.
 * Priorité : plateau-N_fond (canonique), sinon premier slug plateau-N_* (hors _variante).
 */
export function resolvePlateauBoardSlug(plateauNumber, knownSlugs = []) {
  const n = Number(plateauNumber);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;

  const slugs = new Set(
    (Array.isArray(knownSlugs) ? knownSlugs : Object.keys(knownSlugs || {}))
      .map((slug) => String(slug || '').trim())
      .filter(Boolean),
  );

  const exact = `plateau-${n}_fond`;
  if (slugs.has(exact)) return exact;

  const prefix = `plateau-${n}_`;
  const candidates = [...slugs]
    .filter((slug) => slug.startsWith(prefix) && !slug.includes('_variante'))
    .sort();

  return candidates[0] ?? null;
}
