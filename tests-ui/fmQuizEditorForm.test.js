import { describe, test, expect } from 'vitest';
import {
  questionToForm,
  formToPayload,
  filterQuizItems,
  sortQuizItems,
} from '../src/utils/fmQuizEditorForm.js';

describe('fmQuizEditorForm', () => {
  test('questionToForm normalise les valeurs par défaut', () => {
    const form = questionToForm({
      question_code: 'QF0001',
      categorie_slug: 'vivant_classification',
      numero_dans_categorie: 2,
      question: 'Test ?',
      reponse_correcte: 'B',
      niveau: 'lycee',
      statut: 'inactif',
    });
    expect(form.question_code).toBe('QF0001');
    expect(form.numero_dans_categorie).toBe('2');
    expect(form.reponse_correcte).toBe('B');
    expect(form.niveau).toBe('lycee');
    expect(form.statut).toBe('inactif');
  });

  test('formToPayload convertit les champs numériques', () => {
    const payload = formToPayload({
      question_code: ' qf0099 ',
      categorie_slug: ' Vivant_Classification ',
      numero_dans_categorie: '3',
      difficulte: '2',
      question: 'Q?',
      choix_a: 'A',
      choix_b: 'B',
      choix_c: 'C',
      reponse_correcte: 'A',
    });
    expect(payload.question_code).toBe('QF0099');
    expect(payload.categorie_slug).toBe('vivant_classification');
    expect(payload.numero_dans_categorie).toBe(3);
    expect(payload.difficulte).toBe(2);
  });

  test('filterQuizItems et sortQuizItems', () => {
    const items = [
      { question_code: 'QF0002', theme: 'sciences', categorie_slug: 'b', question: 'deux' },
      { question_code: 'QF0001', theme: 'jardinage', categorie_slug: 'a', question: 'un' },
    ];
    expect(filterQuizItems(items, { filterTheme: 'sciences' })).toHaveLength(1);
    expect(sortQuizItems(items, 'code')[0].question_code).toBe('QF0001');
    expect(sortQuizItems(items, 'code_desc')[0].question_code).toBe('QF0002');
  });
});
