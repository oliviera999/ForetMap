'use strict';

/**
 * Questions « posées en partie » de « Tenir à deux » (`gl_qcm_questions.usage_tenir`).
 *
 * La migration 345 a retiré du tirage les questions de taxonomie générée (« À quelle famille
 * appartient… », « … nom scientifique … ») : un nom à réciter, sans intérêt pour des élèves de
 * 6e. Ce module porte le même critère pour le code, afin qu'une question créée APRÈS la
 * migration (import XLSX, chargeur des questions vives) suive la même règle au lieu de
 * retomber sur `usage_tenir = 1` par défaut de colonne.
 */

const TAXONOMIE_DEBUT_RE = /^a quelle famille appartient/i;
const TAXONOMIE_PARTOUT_RE = /nom scientifique/i;

/**
 * Vrai si l'énoncé relève de la taxonomie générée (même critère que la migration 345).
 * Les accents sont ignorés, comme le `LIKE` de la migration sous une collation `_ci`
 * (« A quelle famille… » sans accent est donc reconnu aussi).
 */
function isQuestionTaxonomie(question) {
  const text = String(question ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
  if (!text) return false;
  return TAXONOMIE_DEBUT_RE.test(text) || TAXONOMIE_PARTOUT_RE.test(text);
}

module.exports = { isQuestionTaxonomie };
