// Logique pure du panneau d'édition QCM biomes GL.
// Adaptateur mince du cœur partagé `src/shared/qcm/questionEditorFormCore.js`.

import {
  createFilterItems,
  createFormToPayload,
  createQuestionToForm,
  createSortItems,
} from '../../shared/qcm/questionEditorFormCore.js';

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
  'mots_cles',
  'tags',
]);

export const EMPTY_FORM = {
  question_code: '',
  biome_slug: '',
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
  niveau: 'base',
  difficulte: '',
  difficulte_label: '',
  notes_pedagogiques: '',
  tags: '',
  mots_cles: '',
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
  'biome_slug',
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
  'mots_cles',
  'photo_url',
  'photo_credit',
  'photo_licence',
  'photo_legende',
];

export const questionToForm = createQuestionToForm({
  emptyForm: EMPTY_FORM,
  defaults: {
    numero_dans_categorie: '1',
    reponse_correcte: 'A',
    niveau: 'base',
    statut: 'actif',
  },
});

export const formToPayload = createFormToPayload({
  slugFields: ['biome_slug', 'categorie_slug'],
});

export const filterQcmItems = createFilterItems({
  matchers: [
    { filterKey: 'filterBiome', itemKey: 'biome_slug' },
    { filterKey: 'filterCategorie', itemKey: 'categorie_slug' },
  ],
});

export const sortQcmItems = createSortItems({ groupKey: 'biome_slug' });
