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

function resolveQcmSetFromCode(code) {
  return isLoreQuestionCode(code) ? 'lore' : 'biome';
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

function buildAnyPresentation(questionRow, glossaryTerms = []) {
  if (!questionRow) throw new Error('Question requise');
  if (isLoreQuestionCode(questionRow.question_code)) {
    return buildLorePresentation(questionRow, glossaryTerms);
  }
  const presentation = buildPresentation(questionRow, glossaryTerms);
  return { ...presentation, qcmSet: 'biome' };
}

module.exports = {
  isLoreQuestionCode,
  resolveQcmSetFromCode,
  loadAnyActiveQuestion,
  loadAnyPresentableQuestion,
  buildAnyPresentation,
};
