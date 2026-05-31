'use strict';

const { buildCanonicalChoices, CHOICE_LETTERS, presentQuestion } = require('./glQcmChoices');

const FULL_QUESTION_SELECT = `
  SELECT question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
         choix_a, choix_b, choix_c, choix_d, choix_e,
         reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
         notes_pedagogiques, tags, mots_cles,
         photo_url, photo_url_hd, photo_description_url, photo_filename, photo_credit,
         photo_licence, photo_licence_url, photo_legende, photo_sujet,
         wikipedia_title, wikipedia_url, photo_method, statut
    FROM gl_qcm_questions
`;

function isPresentableQuestionRow(row) {
  if (!row?.question_code) return false;
  const canonical = buildCanonicalChoices(row);
  if (canonical.length < 2) return false;
  const correctLetter = String(row.reponse_correcte || '').trim().toUpperCase();
  if (!CHOICE_LETTERS.includes(correctLetter)) return false;
  return canonical.some((choice) => choice.letter === correctLetter);
}

async function loadActiveQuestion(deps, code) {
  const questionCode = String(code || '').trim().toUpperCase();
  if (!questionCode) return null;
  return deps.queryOne(
    `${FULL_QUESTION_SELECT} WHERE question_code = ? AND statut = 'actif' LIMIT 1`,
    [questionCode]
  );
}

async function loadPresentableQuestion(deps, code) {
  const row = await loadActiveQuestion(deps, code);
  if (!row || !isPresentableQuestionRow(row)) return null;
  return row;
}

function presentableQuestionError(code) {
  const label = String(code || '').trim().toUpperCase() || 'inconnue';
  return `Question ${label} : choix de réponse incomplets dans le catalogue QCM (au moins 2 choix et une bonne réponse requis)`;
}

function buildPresentation(questionRow, glossaryTerms = []) {
  if (!isPresentableQuestionRow(questionRow)) {
    throw new Error(presentableQuestionError(questionRow?.question_code));
  }
  return presentQuestion(questionRow, glossaryTerms);
}

module.exports = {
  FULL_QUESTION_SELECT,
  isPresentableQuestionRow,
  loadActiveQuestion,
  loadPresentableQuestion,
  presentableQuestionError,
  buildPresentation,
};
