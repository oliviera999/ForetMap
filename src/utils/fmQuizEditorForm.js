// Logique pure du panneau d'édition des questions Quiz ForetMap.
// Adaptateur mince du cœur partagé `src/shared/qcm/questionEditorFormCore.js`.

import {
  createFilterItems,
  createFormToPayload,
  createQuestionToForm,
  createSortItems,
} from '../shared/qcm/questionEditorFormCore.js';

export const TEXTAREA_FIELDS = new Set([
  'question',
  'notes_pedagogiques',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
  'photo_legende',
]);

export const EMPTY_FORM = {
  question_code: '',
  categorie_slug: '',
  numero_dans_categorie: '1',
  question: '',
  choix_a: '',
  choix_b: '',
  choix_c: '',
  choix_d: '',
  choix_e: '',
  reponse_correcte: 'A',
  reponse_texte: '',
  niveau: 'college',
  difficulte: '',
  difficulte_label: '',
  notes_pedagogiques: '',
  tags: '',
  photo_url: '',
  photo_credit: '',
  photo_licence: '',
  photo_legende: '',
  statut: 'actif',
  feedback_correct: '',
  feedback_a: '',
  feedback_b: '',
  feedback_c: '',
  feedback_d: '',
  feedback_e: '',
};

export const FORM_FIELDS = [
  'question_code',
  'categorie_slug',
  'numero_dans_categorie',
  'niveau',
  'difficulte',
  'difficulte_label',
  'statut',
  'question',
  'choix_a',
  'choix_b',
  'choix_c',
  'choix_d',
  'choix_e',
  'reponse_correcte',
  'reponse_texte',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
  'notes_pedagogiques',
  'tags',
  'photo_url',
  'photo_credit',
  'photo_licence',
  'photo_legende',
];

/**
 * @param {object|null|undefined} question
 * @returns {object}
 */
export const questionToForm = createQuestionToForm({
  emptyForm: EMPTY_FORM,
  defaults: {
    numero_dans_categorie: '1',
    reponse_correcte: 'A',
    niveau: 'college',
    statut: 'actif',
  },
});

/**
 * @param {object} form
 * @returns {object}
 */
export const formToPayload = createFormToPayload({
  slugFields: ['categorie_slug'],
});

/**
 * @param {Array} items
 * @param {{ filterTheme?: string, filterCategorie?: string, filterQ?: string }} filters
 * @returns {Array}
 */
export const filterQuizItems = createFilterItems({
  matchers: [
    { filterKey: 'filterTheme', itemKey: 'theme' },
    { filterKey: 'filterCategorie', itemKey: 'categorie_slug' },
  ],
});

/**
 * @param {Array} items
 * @param {string} sortBy
 * @returns {Array}
 */
export const sortQuizItems = createSortItems({ groupKey: 'theme' });
