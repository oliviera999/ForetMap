// Logique pure du panneau catalogue QCM du GL (GLQcmCatalogPanel).
// Construction des chaînes de requête d'export et de liste de questions ;
// aucune dépendance React.

/**
 * Construit la query string d'export du catalogue.
 *
 * Reproduit la logique historique : `statut=all` uniquement si l'export
 * « tous les statuts » est demandé ; scope (clé dynamique) et catégorie
 * ajoutés seulement si renseignés (après trim).
 *
 * @param {Object} opts
 * @param {string} opts.exportStatut - 'actif' ou 'all'.
 * @param {string} opts.scopeQueryKey - nom du paramètre de scope (ex. 'biomeSlug').
 * @param {string} opts.scopeSlug - valeur de scope saisie.
 * @param {string} opts.categorieSlug - valeur de catégorie saisie.
 * @returns {string} la query string sans le `?` initial ('' si aucun param).
 */
export function buildExportQuery({ exportStatut, scopeQueryKey, scopeSlug, categorieSlug }) {
  const params = new URLSearchParams();
  if (exportStatut === 'all') params.set('statut', 'all');
  if (scopeSlug?.trim()) params.set(scopeQueryKey, scopeSlug.trim());
  if (categorieSlug?.trim()) params.set('categorieSlug', categorieSlug.trim());
  return params.toString();
}

/**
 * Construit la query string de la liste des questions filtrées.
 *
 * Scope (clé dynamique), catégorie et recherche (`q`) ajoutés uniquement si
 * renseignés (après trim).
 *
 * @param {Object} opts
 * @param {string} opts.scopeQueryKey - nom du paramètre de scope.
 * @param {string} opts.scopeSlug - valeur de scope saisie.
 * @param {string} opts.categorieSlug - valeur de catégorie saisie.
 * @param {string} opts.search - terme de recherche.
 * @returns {string} la query string sans le `?` initial ('' si aucun param).
 */
export function buildQuestionsListQuery({ scopeQueryKey, scopeSlug, categorieSlug, search }) {
  const params = new URLSearchParams();
  if (scopeSlug?.trim()) params.set(scopeQueryKey, scopeSlug.trim());
  if (categorieSlug?.trim()) params.set('categorieSlug', categorieSlug.trim());
  if (search?.trim()) params.set('q', search.trim());
  return params.toString();
}
