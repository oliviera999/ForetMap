import { describe, test, expect } from 'vitest';
import {
  createFilterItems,
  createFormToPayload,
  createQuestionToForm,
  createSortItems,
} from '../../src/shared/qcm/questionEditorFormCore.js';

const EMPTY_FORM = {
  question_code: '',
  scope_slug: 'tous',
  categorie_slug: '',
  numero_dans_categorie: '1',
  question: '',
  reponse_correcte: 'A',
  difficulte: '',
  statut: 'actif',
};

describe('questionEditorFormCore — createQuestionToForm', () => {
  const questionToForm = createQuestionToForm({
    emptyForm: EMPTY_FORM,
    defaults: { numero_dans_categorie: '1', reponse_correcte: 'A', scope_slug: 'tous' },
  });

  test('retourne le formulaire vide sans question', () => {
    expect(questionToForm(null)).toEqual(EMPTY_FORM);
    expect(questionToForm(null)).not.toBe(EMPTY_FORM);
  });

  test('convertit en chaînes et réapplique les valeurs par défaut', () => {
    const form = questionToForm({
      question_code: 'QX0001',
      numero_dans_categorie: 3,
      scope_slug: null,
      difficulte: 2,
    });
    expect(form.question_code).toBe('QX0001');
    expect(form.numero_dans_categorie).toBe('3');
    expect(form.scope_slug).toBe('tous');
    expect(form.reponse_correcte).toBe('A');
    expect(form.difficulte).toBe('2');
  });
});

describe('questionEditorFormCore — createFormToPayload', () => {
  test('normalise code, slugs et champs numériques', () => {
    const formToPayload = createFormToPayload({ slugFields: ['scope_slug', 'categorie_slug'] });
    const payload = formToPayload({
      question_code: ' qx0001 ',
      scope_slug: ' Tous ',
      categorie_slug: ' Faune ',
      numero_dans_categorie: '4',
      difficulte: '',
    });
    expect(payload.question_code).toBe('QX0001');
    expect(payload.scope_slug).toBe('tous');
    expect(payload.categorie_slug).toBe('faune');
    expect(payload.numero_dans_categorie).toBe(4);
    expect(payload.difficulte).toBeNull();
  });

  test('applique la retouche finale et convertit la difficulté', () => {
    const formToPayload = createFormToPayload({
      slugFields: [],
      transform: (payload, form) => ({ ...payload, tier: String(form.tier || 'x').toLowerCase() }),
    });
    const payload = formToPayload({ question_code: 'a', difficulte: '2', tier: 'CLE' });
    expect(payload.difficulte).toBe(2);
    expect(payload.tier).toBe('cle');
  });
});

describe('questionEditorFormCore — createFilterItems', () => {
  const filterItems = createFilterItems({
    matchers: [
      { filterKey: 'filterScope', itemKey: 'scope_slug' },
      { filterKey: 'filterCategorie', itemKey: 'categorie_slug' },
    ],
  });
  const items = [
    { question_code: 'QA1', scope_slug: 'a', categorie_slug: 'x', question: 'alpha', tags: 't1' },
    { question_code: 'QB2', scope_slug: 'b', categorie_slug: 'y', question: 'beta', tags: '' },
  ];

  test('filtre par égalité stricte et par recherche plein texte', () => {
    expect(filterItems(items, { filterScope: 'a' })).toHaveLength(1);
    expect(filterItems(items, { filterCategorie: 'y' })[0].question_code).toBe('QB2');
    expect(filterItems(items, { filterQ: ' ALPHA ' })).toHaveLength(1);
    expect(filterItems(items, { filterQ: 't1' })[0].question_code).toBe('QA1');
    expect(filterItems(items)).toHaveLength(2);
  });
});

describe('questionEditorFormCore — createSortItems', () => {
  const sortItems = createSortItems({
    groupKey: 'scope_slug',
    extraComparators: {
      tier: (a, b) => String(a.tier || '').localeCompare(String(b.tier || '')),
    },
  });
  const items = [
    {
      question_code: 'QB2',
      scope_slug: 'b',
      categorie_slug: 'y',
      numero_dans_categorie: 1,
      difficulte: 1,
      tier: 'recit',
    },
    {
      question_code: 'QA1',
      scope_slug: 'a',
      categorie_slug: 'x',
      numero_dans_categorie: 2,
      difficulte: null,
      tier: 'cle',
    },
  ];

  test('tris communs code / code_desc / category / difficulte', () => {
    expect(sortItems(items, 'code')[0].question_code).toBe('QA1');
    expect(sortItems(items, 'code_desc')[0].question_code).toBe('QB2');
    expect(sortItems(items, 'category')[0].categorie_slug).toBe('x');
    expect(sortItems(items, 'difficulte')[0].question_code).toBe('QB2');
  });

  test('tri par défaut groupé et comparateur additionnel', () => {
    expect(sortItems(items, 'scope')[0].scope_slug).toBe('a');
    expect(sortItems(items, 'tier')[0].tier).toBe('cle');
    expect(sortItems(items, 'code')).not.toBe(items);
  });
});
