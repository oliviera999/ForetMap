'use strict';

/**
 * Parse des listes d'ids de catégories dans les réglages
 * (`ui.*.default_category_ids`, `ui.*.hidden_category_ids`) : `;` / `,` / espaces.
 * Aligné sur `src/utils/categoryIdsSetting.js` (front ESM).
 *
 * @param {unknown} raw
 * @returns {string[]}
 */
function parseCategoryIdsSetting(raw) {
  return String(raw ?? '')
    .split(/[;,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Un lieu survit-il au masquage de catégories ?
 * - sans aucune catégorie → oui (lieux historiques / entrées) ;
 * - avec catégories → oui s'il en reste au moins une non masquée ;
 * - uniquement des catégories masquées → non (sémantique B).
 *
 * @param {unknown} categoryIds
 * @param {Set<string>|Iterable<string>} hiddenCategoryIds
 * @returns {boolean}
 */
function placeSurvivesHiddenCategories(categoryIds, hiddenCategoryIds) {
  const hidden =
    hiddenCategoryIds instanceof Set
      ? hiddenCategoryIds
      : new Set([...(hiddenCategoryIds || [])].map(String));
  const ids = (Array.isArray(categoryIds) ? categoryIds : []).map(String);
  if (ids.length === 0) return true;
  return ids.some((id) => !hidden.has(id));
}

module.exports = {
  parseCategoryIdsSetting,
  placeSurvivesHiddenCategories,
};
