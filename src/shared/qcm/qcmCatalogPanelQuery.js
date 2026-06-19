// Logique pure du panneau catalogue QCM (export / liste filtrée).

/**
 * @param {Object} opts
 * @param {string} opts.exportStatut
 * @param {string} opts.scopeQueryKey
 * @param {string} opts.scopeSlug
 * @param {string} opts.categorieSlug
 * @returns {string}
 */
export function buildExportQuery({ exportStatut, scopeQueryKey, scopeSlug, categorieSlug }) {
  const params = new URLSearchParams();
  if (exportStatut === 'all') params.set('statut', 'all');
  if (scopeSlug?.trim()) params.set(scopeQueryKey, scopeSlug.trim());
  if (categorieSlug?.trim()) params.set('categorieSlug', categorieSlug.trim());
  return params.toString();
}

/**
 * @param {Object} opts
 * @param {string} opts.scopeQueryKey
 * @param {string} opts.scopeSlug
 * @param {string} opts.categorieSlug
 * @param {string} opts.search
 * @returns {string}
 */
export function buildQuestionsListQuery({
  scopeQueryKey,
  scopeSlug,
  categorieSlug,
  search,
  statut,
  niveau,
  sort,
}) {
  const params = new URLSearchParams();
  if (scopeSlug?.trim()) params.set(scopeQueryKey, scopeSlug.trim());
  if (categorieSlug?.trim()) params.set('categorieSlug', categorieSlug.trim());
  if (search?.trim()) params.set('q', search.trim());
  if (statut?.trim()) params.set('statut', statut.trim());
  if (niveau?.trim()) params.set('niveau', niveau.trim());
  if (sort?.trim()) params.set('sort', sort.trim());
  return params.toString();
}
