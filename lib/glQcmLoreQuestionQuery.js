'use strict';

const { buildCanonicalChoices, CHOICE_LETTERS, presentQuestion } = require('./glQcmChoices');

const FULL_LORE_QUESTION_SELECT = `
  SELECT question_code, chapitre_slug, categorie_slug, numero_dans_categorie, tier_lore, question,
         choix_a, choix_b, choix_c, choix_d, choix_e,
         reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
         notes_pedagogiques, source_lore, tags, mots_cles, statut,
         feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e
    FROM gl_qcm_lore_questions
`;

function isPresentableLoreQuestionRow(row) {
  if (!row?.question_code) return false;
  const canonical = buildCanonicalChoices(row);
  if (canonical.length < 2) return false;
  const correctLetter = String(row.reponse_correcte || '')
    .trim()
    .toUpperCase();
  if (!CHOICE_LETTERS.includes(correctLetter)) return false;
  return canonical.some((choice) => choice.letter === correctLetter);
}

async function loadActiveLoreQuestion(deps, code) {
  const questionCode = String(code || '')
    .trim()
    .toUpperCase();
  if (!questionCode) return null;
  return deps.queryOne(
    `${FULL_LORE_QUESTION_SELECT} WHERE question_code = ? AND statut = 'actif' LIMIT 1`,
    [questionCode],
  );
}

async function loadPresentableLoreQuestion(deps, code) {
  const row = await loadActiveLoreQuestion(deps, code);
  if (!row || !isPresentableLoreQuestionRow(row)) return null;
  return row;
}

function presentableLoreQuestionError(code) {
  const label =
    String(code || '')
      .trim()
      .toUpperCase() || 'inconnue';
  return `Question ${label} : choix de réponse incomplets dans le catalogue QCM lore (au moins 2 choix et une bonne réponse requis)`;
}

function buildLorePresentation(questionRow, loreGlossaryTerms = []) {
  if (!isPresentableLoreQuestionRow(questionRow)) {
    throw new Error(presentableLoreQuestionError(questionRow?.question_code));
  }
  const presentation = presentQuestion(questionRow, loreGlossaryTerms);
  return {
    ...presentation,
    qcmSet: 'lore',
    loreGlossaryTerms: presentation.glossaryTerms || loreGlossaryTerms,
  };
}

module.exports = {
  FULL_LORE_QUESTION_SELECT,
  isPresentableLoreQuestionRow,
  loadActiveLoreQuestion,
  loadPresentableLoreQuestion,
  presentableLoreQuestionError,
  buildLorePresentation,
};
