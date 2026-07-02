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
} from '../../utils/glQcmEditorForm.js';
import { mergeAutoSaveForm } from '../../utils/mergeAutoSaveForm.js';
import { GLButton } from '../ui/GLButton.jsx';
import { GLField } from '../ui/GLField.jsx';
import { GLInput } from '../ui/GLInput.jsx';
import { GLSelect } from '../ui/GLSelect.jsx';

// Panneau d'édition des questions QCM biomes GL : adaptateur mince du panneau générique
// partagé `src/shared/qcm/QuestionEditorPanel.jsx` (client HTTP apiGL injecté).

function GLTextarea(props) {
  return <textarea className="gl-input" rows={3} {...props} />;
}

const NIVEAU_OPTIONS = [
  { value: 'base', label: 'Base' },
  { value: 'approfondissement', label: 'Approfondissement' },
  { value: 'avance', label: 'Avancé' },
];

const GL_QCM_EDITOR_CONFIG = {
  api: apiGL,
  title: 'Édition des questions QCM biomes',
  questionsBase: '/api/gl/admin/qcm/questions',
  formModule: { EMPTY_FORM, FORM_FIELDS, TEXTAREA_FIELDS, questionToForm, formToPayload },
  clientFilter: (items, f) =>
    filterQcmItems(items, {
      filterBiome: f.biome,
      filterCategorie: f.categorie,
      filterQ: f.filterQ,
    }),
  clientSort: sortQcmItems,
  references: [
    { key: 'biomes', load: (api) => api('/api/gl/biomes') },
    { key: 'categories', load: (api) => api('/api/gl/qcm/categories') },
  ],
  filters: [
    {
      key: 'biome',
      label: 'Biome',
      param: 'biomeSlug',
      initial: '',
      options: ({ refs }) => [
        { value: '', label: 'Tous' },
        ...refs.biomes.map((biome) => ({ value: biome.slug, label: biome.nom })),
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
      key: 'statut',
      label: 'Statut',
      initial: 'actif',
      options: () => [
        { value: 'actif', label: 'Actives' },
        { value: 'inactif', label: 'Inactives' },
        { value: 'all', label: 'Toutes' },
      ],
    },
    {
      key: 'niveau',
      label: 'Niveau',
      param: 'niveau',
      initial: '',
      options: () => [{ value: '', label: 'Tous' }, ...NIVEAU_OPTIONS],
    },
  ],
  sort: {
    initial: 'biome',
    options: [
      { value: 'biome', label: 'Biome / catégorie' },
      { value: 'code', label: 'Code A→Z' },
      { value: 'code_desc', label: 'Code Z→A' },
      { value: 'category', label: 'Catégorie' },
      { value: 'difficulte', label: 'Difficulté' },
    ],
  },
  autoSave: { merge: mergeAutoSaveForm },
  scopeFilter: { filterKey: 'biome', questionField: 'biome_slug' },
  newQuestionDefaults: ({ filters, refs }) => ({
    biome_slug: filters.biome || refs.biomes[0]?.slug || '',
    categorie_slug: filters.categorie || refs.categories[0]?.slug || '',
  }),
  categorieOptions: ({ refs }) => refs.categories,
  fieldRenderers: {
    biome_slug: ({ form, setField, refs }) => (
      <GLField label="Biome">
        <GLSelect value={form.biome_slug} onChange={(e) => setField('biome_slug', e.target.value)}>
          <option value="">— Choisir —</option>
          {refs.biomes.map((biome) => (
            <option key={biome.slug} value={biome.slug}>
              {biome.nom} ({biome.slug})
            </option>
          ))}
        </GLSelect>
      </GLField>
    ),
    niveau: ({ form, setField }) => (
      <GLField label="Niveau">
        <GLSelect value={form.niveau} onChange={(e) => setField('niveau', e.target.value)}>
          {NIVEAU_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </GLSelect>
      </GLField>
    ),
  },
  itemMeta: (item) => `${item.biome_slug} / ${item.categorie_slug}`,
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

export function GLQcmQuestionEditorPanel({ initialQuestionCode = null }) {
  return (
    <QuestionEditorPanel config={GL_QCM_EDITOR_CONFIG} initialQuestionCode={initialQuestionCode} />
  );
}
