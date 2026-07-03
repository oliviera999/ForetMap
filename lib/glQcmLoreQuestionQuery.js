'use strict';

const { createQuestionQuery } = require('./shared/questionQueryFactory');

/**
 * Requêtes du catalogue QCM « lore » (table `gl_qcm_lore_questions`).
 * Adaptateur mince sur la fabrique partagée `lib/shared/questionQueryFactory.js`
 * (logique commune avec le catalogue biomes) ; exports historiques inchangés.
 * Spécificité lore : `buildLorePresentation` enrichit la présentation avec
 * `qcmSet: 'lore'` et `loreGlossaryTerms`.
 */

const FULL_LORE_QUESTION_SELECT = `
  SELECT question_code, chapitre_slug, categorie_slug, numero_dans_categorie, tier_lore, question,
         choix_a, choix_b, choix_c, choix_d, choix_e,
         reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
         notes_pedagogiques, source_lore, tags, mots_cles, statut,
         feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e
    FROM gl_qcm_lore_questions
`;

const {
  isPresentableQuestionRow: isPresentableLoreQuestionRow,
  loadActiveQuestion: loadActiveLoreQuestion,
  loadPresentableQuestion: loadPresentableLoreQuestion,
  presentableQuestionError: presentableLoreQuestionError,
  buildPresentation,
} = createQuestionQuery({ select: FULL_LORE_QUESTION_SELECT, catalogLabel: 'QCM lore' });

function buildLorePresentation(questionRow, loreGlossaryTerms = []) {
  const presentation = buildPresentation(questionRow, loreGlossaryTerms);
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
