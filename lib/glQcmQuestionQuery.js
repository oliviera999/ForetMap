'use strict';

const { createQuestionQuery } = require('./shared/questionQueryFactory');

/**
 * Requêtes du catalogue QCM « biomes » (table `gl_qcm_questions`).
 * Adaptateur mince sur la fabrique partagée `lib/shared/questionQueryFactory.js`
 * (logique commune avec le catalogue lore) ; exports historiques inchangés.
 */

const FULL_QUESTION_SELECT = `
  SELECT question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
         choix_a, choix_b, choix_c, choix_d, choix_e,
         reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
         notes_pedagogiques, tags, mots_cles,
         photo_url, photo_url_hd, photo_description_url, photo_filename, photo_credit,
         photo_licence, photo_licence_url, photo_legende, photo_sujet,
         wikipedia_title, wikipedia_url, photo_method, statut,
         feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e
    FROM gl_qcm_questions
`;

const {
  isPresentableQuestionRow,
  loadActiveQuestion,
  loadPresentableQuestion,
  presentableQuestionError,
  buildPresentation,
} = createQuestionQuery({ select: FULL_QUESTION_SELECT, catalogLabel: 'QCM' });

module.exports = {
  FULL_QUESTION_SELECT,
  isPresentableQuestionRow,
  loadActiveQuestion,
  loadPresentableQuestion,
  presentableQuestionError,
  buildPresentation,
};
