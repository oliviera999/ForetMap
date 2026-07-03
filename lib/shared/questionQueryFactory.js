'use strict';

const { buildCanonicalChoices, CHOICE_LETTERS, presentQuestion } = require('../glQcmChoices');

/**
 * Fabrique générique de « question query » QCM (audit §4.2, paire 1.3).
 *
 * Les modules `lib/glQcmQuestionQuery.js` (catalogue biomes, table
 * `gl_qcm_questions`) et `lib/glQcmLoreQuestionQuery.js` (catalogue lore,
 * table `gl_qcm_lore_questions`) étaient identiques hors : liste de colonnes
 * SELECT, table, et libellé du catalogue dans le message d'erreur. Cette
 * fabrique porte la logique commune ; les deux fichiers deviennent des
 * adaptateurs minces qui conservent leurs exports historiques.
 *
 * @param {object} options
 * @param {string} options.select — SELECT complet (colonnes + FROM), sans WHERE.
 * @param {string} options.catalogLabel — libellé du catalogue pour les messages
 *   d'erreur (ex. « QCM », « QCM lore »).
 */
function createQuestionQuery({ select, catalogLabel }) {
  function isPresentableQuestionRow(row) {
    if (!row?.question_code) return false;
    const canonical = buildCanonicalChoices(row);
    if (canonical.length < 2) return false;
    const correctLetter = String(row.reponse_correcte || '')
      .trim()
      .toUpperCase();
    if (!CHOICE_LETTERS.includes(correctLetter)) return false;
    return canonical.some((choice) => choice.letter === correctLetter);
  }

  async function loadActiveQuestion(deps, code) {
    const questionCode = String(code || '')
      .trim()
      .toUpperCase();
    if (!questionCode) return null;
    return deps.queryOne(`${select} WHERE question_code = ? AND statut = 'actif' LIMIT 1`, [
      questionCode,
    ]);
  }

  async function loadPresentableQuestion(deps, code) {
    const row = await loadActiveQuestion(deps, code);
    if (!row || !isPresentableQuestionRow(row)) return null;
    return row;
  }

  function presentableQuestionError(code) {
    const label =
      String(code || '')
        .trim()
        .toUpperCase() || 'inconnue';
    return `Question ${label} : choix de réponse incomplets dans le catalogue ${catalogLabel} (au moins 2 choix et une bonne réponse requis)`;
  }

  function buildPresentation(questionRow, glossaryTerms = []) {
    if (!isPresentableQuestionRow(questionRow)) {
      throw new Error(presentableQuestionError(questionRow?.question_code));
    }
    return presentQuestion(questionRow, glossaryTerms);
  }

  return {
    isPresentableQuestionRow,
    loadActiveQuestion,
    loadPresentableQuestion,
    presentableQuestionError,
    buildPresentation,
  };
}

module.exports = { createQuestionQuery };
