'use strict';

/**
 * Longueur maximale des réglages `ui.*.default_category_ids` / `ui.*.hidden_category_ids`.
 * Un identifiant de catégorie fait jusqu'à 64 caractères (souvent un UUID de 36) : à 512,
 * cocher une quinzaine de catégories suffisait à faire refuser l'enregistrement.
 */
const CATEGORY_IDS_SETTING_MAX_LENGTH = 8192;

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
  CATEGORY_IDS_SETTING_MAX_LENGTH,
  parseCategoryIdsSetting,
  placeSurvivesHiddenCategories,
};
