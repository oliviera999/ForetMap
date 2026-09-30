'use strict';

const {
  loadActiveQuestion,
  loadPresentableQuestion,
  buildPresentation,
} = require('./glQcmQuestionQuery');
const {
  loadActiveLoreQuestion,
  loadPresentableLoreQuestion,
  buildLorePresentation,
} = require('./glQcmLoreQuestionQuery');

function isLoreQuestionCode(code) {
  return /^LQCM\d+$/i.test(String(code || '').trim());
}

async function loadAnyActiveQuestion(deps, code) {
  const questionCode = String(code || '')
    .trim()
    .toUpperCase();
  if (!questionCode) return null;
  if (isLoreQuestionCode(questionCode)) {
    return loadActiveLoreQuestion(deps, questionCode);
  }
  return loadActiveQuestion(deps, questionCode);
}

async function loadAnyPresentableQuestion(deps, code) {
  const questionCode = String(code || '')
    .trim()
    .toUpperCase();
  if (!questionCode) return null;
  if (isLoreQuestionCode(questionCode)) {
    return loadPresentableLoreQuestion(deps, questionCode);
  }
  return loadPresentableQuestion(deps, questionCode);
}

/**
 * @param {object} [options] transmis à `presentQuestion` (`resource`, `game` — cf. GL2 :
 *   la présentation d'un repère de partie grave partie / équipe / repère dans le jeton).
 */
function buildAnyPresentation(questionRow, glossaryTerms = [], options = {}) {
  if (!questionRow) throw new Error('Question requise');
  if (isLoreQuestionCode(questionRow.question_code)) {
    return buildLorePresentation(questionRow, glossaryTerms, options);
  }
  const presentation = buildPresentation(questionRow, glossaryTerms, options);
  return { ...presentation, qcmSet: 'biome' };
}

module.exports = {
  isLoreQuestionCode,
  loadAnyActiveQuestion,
  loadAnyPresentableQuestion,
  buildAnyPresentation,
};
