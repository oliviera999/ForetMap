import React from 'react';
import { apiGL } from '../../services/apiGL.js';
import { QuestionEditorPanel } from '../../../shared/qcm/QuestionEditorPanel.jsx';
import {
  EMPTY_FORM,
  FORM_FIELDS,
  TEXTAREA_FIELDS,
  filterQcmItems,
  formToPayload,
  questionToForm,
  sortQcmItems,
} from '../../utils/glQcmLoreEditorForm.js';
import { mergeAutoSaveForm } from '../../utils/mergeAutoSaveForm.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

// Panneau d'édition des questions QCM lore GL : adaptateur mince du panneau générique
// partagé `src/shared/qcm/QuestionEditorPanel.jsx` (client HTTP apiGL injecté).

function GLTextarea(props) {
  return <textarea className="gl-input" rows={3} {...props} />;
}

const TIER_OPTIONS = [
  { value: 'cle', label: 'Clé' },
  { value: 'recit', label: 'Récit' },
];

const GL_QCM_LORE_EDITOR_CONFIG = {
  api: apiGL,
  title: 'Édition des questions QCM lore',
  questionsBase: '/api/gl/lore/admin/qcm/questions',
  formModule: { EMPTY_FORM, FORM_FIELDS, TEXTAREA_FIELDS, questionToForm, formToPayload },
  clientFilter: (items, f) =>
    filterQcmItems(items, {
      filterChapitre: f.chapitre,
      filterCategorie: f.categorie,
      filterTier: f.tier,
      filterQ: f.filterQ,
    }),
  clientSort: sortQcmItems,
  references: [
    { key: 'scopes', load: (api) => api('/api/gl/lore/qcm/scopes') },
    { key: 'categories', load: (api) => api('/api/gl/lore/qcm/categories') },
  ],
  filters: [
    {
      key: 'chapitre',
      label: 'Chapitre',
      param: 'chapitreSlug',
      initial: '',
      options: ({ refs }) => [
        { value: '', label: 'Tous' },
        ...refs.scopes.map((scope) => ({ value: scope.slug, label: scope.nom })),
      ],
    },
    {
      key: 'categorie',
      label: 'Catégorie',
      param: 'categorieSlug',
      initial: '',
      options: ({ refs }) => [
        { value: '', label: 'Toutes' },
        ...refs.categories.map((cat) => ({ value: cat.slug, label: cat.nom })),
      ],
    },
    {
      key: 'tier',
      label: 'Tier',
      param: 'tierLore',
      initial: '',
      options: () => [{ value: '', label: 'Tous' }, ...TIER_OPTIONS],
    },
    {
      key: 'statut',
      label: 'Statut',
      initial: 'actif',
      options: () => [
        { value: 'actif', label: 'Actives' },
        { value: 'inactif', label: 'Inactives' },
        { value: 'all', label: 'Toutes' },
      ],
    },
  ],
  sort: {
    initial: 'chapitre',
    options: [
      { value: 'chapitre', label: 'Chapitre / catégorie' },
      { value: 'code', label: 'Code A→Z' },
      { value: 'code_desc', label: 'Code Z→A' },
      { value: 'category', label: 'Catégorie' },
      { value: 'difficulte', label: 'Difficulté' },
      { value: 'tier', label: 'Tier lore' },
    ],
  },
  autoSave: { merge: mergeAutoSaveForm },
  scopeFilter: { filterKey: 'chapitre', questionField: 'chapitre_slug' },
  newQuestionDefaults: ({ filters, refs }) => ({
    chapitre_slug: filters.chapitre || refs.scopes[0]?.slug || 'tous',
    categorie_slug: filters.categorie || refs.categories[0]?.slug || '',
  }),
  categorieOptions: ({ refs }) => refs.categories,
  fieldRenderers: {
    chapitre_slug: ({ form, setField, refs }) => (
      <GLField label="Chapitre lore">
        <GLSelect
          value={form.chapitre_slug}
          onChange={(e) => setField('chapitre_slug', e.target.value)}
        >
          {refs.scopes.map((scope) => (
            <option key={scope.slug} value={scope.slug}>
              {scope.nom} ({scope.slug})
            </option>
          ))}
        </GLSelect>
      </GLField>
    ),
    tier_lore: ({ form, setField }) => (
      <GLField label="Tier lore">
        <GLSelect value={form.tier_lore} onChange={(e) => setField('tier_lore', e.target.value)}>
          {TIER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </GLSelect>
      </GLField>
    ),
  },
  itemMeta: (item) =>
    `${item.chapitre_slug} / ${item.categorie_slug} / ${item.tier_lore || 'recit'}`,
  ui: { Button: GLButton, Field: GLField, Input: GLInput, Select: GLSelect, Textarea: GLTextarea },
  classes: {
    section: 'gl-admin-section fade-in gl-qcm-editor',
    hint: 'gl-hint',
    error: 'gl-error',
    grid: 'gl-qcm-editor__grid',
    listPane: 'gl-qcm-editor__list-pane',
    filters: 'gl-qcm__filters',
    listActions: 'gl-inline-actions',
    list: 'gl-qcm-admin-list gl-qcm-editor__list',
    listItem: 'gl-qcm-editor__list-item',
    formPane: 'gl-qcm-editor__form',
    fields: 'gl-qcm-editor__fields',
  },
};

export function GLQcmLoreQuestionEditorPanel({ initialQuestionCode = null }) {
  return (
    <QuestionEditorPanel
      config={GL_QCM_LORE_EDITOR_CONFIG}
      initialQuestionCode={initialQuestionCode}
    />
  );
}
