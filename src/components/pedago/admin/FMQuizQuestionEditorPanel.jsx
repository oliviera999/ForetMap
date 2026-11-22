import { api } from '../../../services/api.js';
import { quizApiPaths } from '../../../services/quizApi.js';
import { QuestionEditorPanel } from '../../../shared/qcm/QuestionEditorPanel.jsx';
import { questionFieldLabel } from '../../../shared/qcm/questionFieldLabels.js';
import { FMQuizChoiceBar, FMQuizItemStatsSummary } from './FMQuizChoiceStats.jsx';
import { findQuestionStat, sortSuspectFirst } from './fmQuizChoiceStatsModel.js';
import {
  EMPTY_FORM,
  FORM_FIELDS,
  TEXTAREA_FIELDS,
  filterQuizItems,
  formToPayload,
  questionToForm,
  sortQuizItems,
} from '../../../utils/fmQuizEditorForm.js';

// Panneau d'édition des questions Quiz ForetMap : adaptateur mince du panneau générique
// partagé `src/shared/qcm/QuestionEditorPanel.jsx` (client HTTP api injecté, soumission
// manuelle — pas d'autosauvegarde).

function FmButton({ type = 'button', variant, onClick, disabled, children }) {
  const className =
    variant === 'ghost' ? 'btn-ghost' : variant === 'secondary' ? 'btn-ghost' : 'btn-primary';
  return (
    <button type={type} className={className} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function FmField({ label, children }) {
  return (
    <label className="pedago-filter-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FmInput(props) {
  return <input className="form-input" {...props} />;
}

function FmSelect({ children, ...props }) {
  return (
    <select className="form-select" {...props}>
      {children}
    </select>
  );
}

function FmTextarea(props) {
  return <textarea className="form-input" rows={3} {...props} />;
}

/**
 * Tri de la liste : « Suspectes d'abord » s'appuie sur les statistiques d'items (référence
 * `questionStats`) ; les autres tris sont ceux du formulaire quiz.
 */
function sortFmQuizItems(items, sortBy, ctx) {
  if (sortBy === 'suspect') {
    return sortSuspectFirst(items, ctx?.refs?.questionStats, (rows) =>
      sortQuizItems(rows, 'theme'),
    );
  }
  return sortQuizItems(items, sortBy);
}

const CHOICE_LETTER_BY_FIELD = {
  choix_a: 'A',
  choix_b: 'B',
  choix_c: 'C',
  choix_d: 'D',
  choix_e: 'E',
};

/** Champ d'un choix, suivi de la part des réponses qui l'ont retenu (version actuelle). */
function renderChoiceField(key) {
  return function ChoiceField({ form, setField, refs, selectedCode }) {
    const stat = selectedCode ? findQuestionStat(refs.questionStats, selectedCode) : null;
    return (
      <div className="fm-choice-field">
        <FmField label={questionFieldLabel(key)}>
          <FmInput value={form[key]} onChange={(e) => setField(key, e.target.value)} />
        </FmField>
        <FMQuizChoiceBar stat={stat} letter={CHOICE_LETTER_BY_FIELD[key]} />
      </div>
    );
  };
}

function themeOptionsFrom(categories) {
  return [...new Set(categories.map((c) => c.theme).filter(Boolean))].sort();
}

function categoryOptionsFrom(categories, filterTheme) {
  return categories
    .filter((c) => !filterTheme || c.theme === filterTheme)
    .sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
}

const NIVEAU_OPTIONS = [
  { value: 'college', label: 'Collège' },
  { value: 'lycee', label: 'Lycée' },
];

const FM_QUIZ_EDITOR_CONFIG = {
  api,
  title: 'Édition des questions',
  questionsBase: quizApiPaths.adminQuestions,
  formModule: { EMPTY_FORM, FORM_FIELDS, TEXTAREA_FIELDS, questionToForm, formToPayload },
  clientFilter: (items, f) =>
    filterQuizItems(items, {
      filterTheme: f.theme,
      filterCategorie: f.categorie,
      filterQ: f.filterQ,
    }),
  clientSort: sortFmQuizItems,
  references: [
    {
      key: 'categories',
      load: async (apiClient) => {
        const data = await apiClient(quizApiPaths.categories());
        return data?.categories;
      },
    },
    {
      // Statistiques d'items (version actuelle) : barres sous les choix, encart, tri
      // « Suspectes d'abord ». Agrégats seulement, aucun nom d'élève.
      key: 'questionStats',
      load: async (apiClient) => {
        const data = await apiClient(`${quizApiPaths.adminQuestions}/stats?minAttempts=1`);
        return data?.stats;
      },
    },
  ],
  filters: [
    {
      key: 'theme',
      label: 'Thème',
      param: 'theme',
      initial: '',
      options: ({ refs }) => [
        { value: '', label: 'Tous' },
        ...themeOptionsFrom(refs.categories).map((theme) => ({ value: theme, label: theme })),
      ],
    },
    {
      key: 'categorie',
      label: 'Catégorie',
      param: 'categorieSlug',
      initial: '',
      options: ({ refs, filters }) => [
        { value: '', label: 'Toutes' },
        ...categoryOptionsFrom(refs.categories, filters.theme).map((cat) => ({
          value: cat.slug,
          label: cat.nom,
        })),
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
    initial: 'theme',
    options: [
      { value: 'theme', label: 'Thème / catégorie' },
      { value: 'code', label: 'Code A→Z' },
      { value: 'code_desc', label: 'Code Z→A' },
      { value: 'category', label: 'Catégorie' },
      { value: 'difficulte', label: 'Difficulté' },
      { value: 'suspect', label: 'Suspectes d’abord' },
    ],
  },
  autoSave: null,
  scopeFilter: null,
  newQuestionDefaults: ({ filters, refs }) => ({
    categorie_slug:
      filters.categorie || categoryOptionsFrom(refs.categories, filters.theme)[0]?.slug || '',
  }),
  categorieOptions: ({ refs, filters }) => categoryOptionsFrom(refs.categories, filters.theme),
  fieldRenderers: {
    choix_a: renderChoiceField('choix_a'),
    choix_b: renderChoiceField('choix_b'),
    choix_c: renderChoiceField('choix_c'),
    choix_d: renderChoiceField('choix_d'),
    choix_e: renderChoiceField('choix_e'),
    reponse_correcte: ({ form, setField, refs, selectedCode }) => (
      <div className="fm-choice-field">
        <FmField label={questionFieldLabel('reponse_correcte')}>
          <FmSelect
            value={form.reponse_correcte}
            onChange={(e) => setField('reponse_correcte', e.target.value)}
          >
            {['A', 'B', 'C', 'D', 'E'].map((letter) => (
              <option key={letter} value={letter}>
                {letter}
              </option>
            ))}
          </FmSelect>
        </FmField>
        {selectedCode ? (
          <FMQuizItemStatsSummary stat={findQuestionStat(refs.questionStats, selectedCode)} />
        ) : null}
      </div>
    ),
    niveau: ({ form, setField }) => (
      <FmField label="Niveau">
        <FmSelect value={form.niveau} onChange={(e) => setField('niveau', e.target.value)}>
          {NIVEAU_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </FmSelect>
      </FmField>
    ),
  },
  itemMeta: (item) => `${item.theme || '—'} / ${item.categorie_slug}`,
  ui: { Button: FmButton, Field: FmField, Input: FmInput, Select: FmSelect, Textarea: FmTextarea },
  classes: {
    section: 'card pedago-quiz-editor fade-in',
    hint: 'section-sub',
    error: 'pedago-qcm-admin__error',
    grid: 'pedago-quiz-editor__grid',
    listPane: 'pedago-quiz-editor__list-pane',
    filters: 'pedago-filters',
    listActions: 'pedago-quiz-editor__list-actions',
    list: 'pedago-qcm-admin__list pedago-quiz-editor__list',
    listItem: 'pedago-quiz-editor__list-item',
    formPane: 'pedago-quiz-editor__form',
    fields: 'pedago-quiz-editor__fields',
    actions: 'pedago-quiz__actions',
  },
};

export function FMQuizQuestionEditorPanel({ initialQuestionCode = null, onQuestionSaved }) {
  return (
    <QuestionEditorPanel
      config={FM_QUIZ_EDITOR_CONFIG}
      initialQuestionCode={initialQuestionCode}
      onQuestionSaved={onQuestionSaved}
    />
  );
}
