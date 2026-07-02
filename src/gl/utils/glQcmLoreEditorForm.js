// Logique pure du panneau d'édition QCM lore GL.
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
  'source_lore',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
  'mots_cles',
  'tags',
]);

export const EMPTY_FORM = {
  question_code: '',
  chapitre_slug: 'tous',
  categorie_slug: '',
  numero_dans_categorie: '1',
  tier_lore: 'recit',
  question: '',
  choix_a: '',
  choix_b: '',
  choix_c: '',
  choix_d: '',
  choix_e: '',
  reponse_correcte: 'A',
  reponse_texte: '',
  niveau: '',
  difficulte: '',
  difficulte_label: '',
  notes_pedagogiques: '',
  source_lore: '',
  tags: '',
  mots_cles: '',
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
  'chapitre_slug',
  'categorie_slug',
  'numero_dans_categorie',
  'tier_lore',
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
  'source_lore',
  'tags',
  'mots_cles',
];

export const questionToForm = createQuestionToForm({
  emptyForm: EMPTY_FORM,
  defaults: {
    numero_dans_categorie: '1',
    reponse_correcte: 'A',
    chapitre_slug: 'tous',
    tier_lore: 'recit',
    statut: 'actif',
  },
});

export const formToPayload = createFormToPayload({
  slugFields: ['chapitre_slug', 'categorie_slug'],
  transform: (payload, form) => ({
    ...payload,
    tier_lore: String(form.tier_lore || 'recit').toLowerCase(),
  }),
});

export const filterQcmItems = createFilterItems({
  matchers: [
    { filterKey: 'filterChapitre', itemKey: 'chapitre_slug' },
    { filterKey: 'filterCategorie', itemKey: 'categorie_slug' },
    { filterKey: 'filterTier', itemKey: 'tier_lore' },
  ],
});

export const sortQcmItems = createSortItems({
  groupKey: 'chapitre_slug',
  extraComparators: {
    tier: (a, b) => {
      const tier = String(a.tier_lore || '').localeCompare(String(b.tier_lore || ''));
      if (tier !== 0) return tier;
      return String(a.question_code).localeCompare(String(b.question_code));
    },
  },
});
