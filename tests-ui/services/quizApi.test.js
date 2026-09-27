import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Client API du quiz (`src/services/quizApi.js`) : les URL doivent rester exactement celles
 * qu'écrivaient les composants avant l'étape B2 (ordre des paramètres, valeurs vides
 * omises, `?` toujours présent sur le tirage).
 */

const apiMock = vi.fn(async () => ({}));
vi.mock('../../src/services/api', () => ({ api: (...args) => apiMock(...args) }));

const {
  quizApi,
  quizApiPaths,
  fetchQuizCategories,
  drawQuizQuestion,
  presentQuizQuestion,
  answerQuizQuestion,
  fetchQuizProgress,
  fetchQuizAttemptStats,
} = await import('../../src/services/quizApi.js');

beforeEach(() => apiMock.mockClear());

describe('quizApi', () => {
  it('catégories : sans filtre, pas de « ? » ; filtres dans l’ordre, vides omis', async () => {
    await fetchQuizCategories();
    await fetchQuizCategories({ theme: '', niveau: 'college', notionNiveau: 'cycle3,cycle4' });
    expect(apiMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/quiz/categories',
      '/api/quiz/categories?niveau=college&notionNiveau=cycle3%2Ccycle4',
    ]);
  });

  it('tirage : « ? » toujours présent, false / null / vide omis', async () => {
    await drawQuizQuestion();
    await drawQuizQuestion({
      categorieSlug: 'vivant',
      niveau: '',
      difficulte: '2',
      illustrated: '1',
      notionId: null,
    });
    await drawQuizQuestion({ notionId: 'C4-VIV' });
    expect(apiMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/quiz/draw?',
      '/api/quiz/draw?categorieSlug=vivant&difficulte=2&illustrated=1',
      '/api/quiz/draw?notionId=C4-VIV',
    ]);
  });

  it('présentation et réponse : code encodé, corps limité au jeton et au choix', async () => {
    await presentQuizQuestion('QF 1');
    await answerQuizQuestion('QF0042', { presentationToken: 't', choiceId: 2, extra: 'x' });
    expect(apiMock.mock.calls).toEqual([
      ['/api/quiz/questions/QF%201/present'],
      ['/api/quiz/questions/QF0042/answer', 'POST', { presentationToken: 't', choiceId: 2 }],
    ]);
  });

  it('progression, statistiques et chemins des panneaux partagés', async () => {
    await fetchQuizProgress();
    await fetchQuizAttemptStats();
    expect(apiMock.mock.calls.map((c) => c[0])).toEqual([
      '/api/quiz/me/progress',
      '/api/quiz/stats',
    ]);
    expect(quizApiPaths.adminBase).toBe('/api/quiz/admin');
    expect(quizApiPaths.adminQuestions).toBe('/api/quiz/admin/questions');
    expect(quizApiPaths.categories()).toBe('/api/quiz/categories');
    expect(quizApiPaths.answer('a/b')).toBe('/api/quiz/questions/a%2Fb/answer');
    expect(quizApi.draw).toBe(drawQuizQuestion);
  });
});
