// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Chantier collège (novembre 2026), flux C6 — le quiz en affichage collège : tirage et
 * compteurs bornés au palier de l'élève (`palierMax`), catégories sans question à ce
 * palier masquées, description collège de la catégorie affichée si elle est renseignée.
 * Lycée : inchangé (aucun `palierMax`, toutes les catégories, aucune description).
 */

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

vi.mock('../../../src/hooks/useGlossaryLinkIndex.js', () => ({
  useGlossaryLinkIndex: () => [],
  resetGlossaryLinkIndexCache: () => {},
}));

vi.mock('../../../src/shared/components/LearningQuizPopover.jsx', () => ({
  LearningQuizPopover: () => null,
}));

import {
  QuizView,
  visibleQuizCategories,
  collegeCategoryDescription,
} from '../../../src/components/pedago/QuizView.jsx';
import { BiodivPedagoProvider } from '../../../src/contexts/BiodivPedagoContext.jsx';
import { resetCurriculumNotionsCache } from '../../../src/hooks/useCurriculumNotions.js';

const CATEGORIES = [
  {
    slug: 'vivant',
    nom: 'Le vivant',
    emoji: '',
    description: 'Description savante',
    description_college: 'Les êtres vivants de la forêt et leurs besoins.',
    questionCount: 4,
  },
  { slug: 'sol', nom: 'Le sol', emoji: '', description_college: null, questionCount: 0 },
];

beforeEach(() => {
  apiMock.mockReset();
  resetCurriculumNotionsCache();
  apiMock.mockImplementation((path) => {
    if (path.startsWith('/api/curriculum/notions')) return Promise.resolve({ items: [] });
    if (path.startsWith('/api/quiz/me/progress')) return Promise.resolve(null);
    if (path.startsWith('/api/quiz/categories')) {
      return Promise.resolve({ categories: CATEGORIES });
    }
    if (path.startsWith('/api/quiz/draw')) return Promise.resolve({ question_code: 'QF0001' });
    if (path.includes('/present')) {
      return Promise.resolve({ question: 'Question ?', choices: [], presentationToken: 't' });
    }
    return Promise.resolve({});
  });
});

function renderWith(providerProps) {
  return render(
    <BiodivPedagoProvider {...providerProps}>
      <QuizView />
    </BiodivPedagoProvider>,
  );
}

const calls = (prefix) =>
  apiMock.mock.calls.map(([p]) => String(p)).filter((p) => p.startsWith(prefix));

describe('fonctions pures du quiz collège', () => {
  it('visibleQuizCategories masque les catégories vides au collège seulement', () => {
    expect(visibleQuizCategories(CATEGORIES, 1).map((c) => c.slug)).toEqual(['vivant']);
    expect(visibleQuizCategories(CATEGORIES, null).map((c) => c.slug)).toEqual(['vivant', 'sol']);
    expect(visibleQuizCategories([{ slug: 'x' }], 2).map((c) => c.slug)).toEqual(['x']);
    expect(visibleQuizCategories(null, 2)).toEqual([]);
  });

  it('collegeCategoryDescription : seulement au collège et si renseignée', () => {
    expect(collegeCategoryDescription(CATEGORIES[0], 2)).toBe(
      'Les êtres vivants de la forêt et leurs besoins.',
    );
    expect(collegeCategoryDescription(CATEGORIES[0], null)).toBe(null);
    expect(collegeCategoryDescription(CATEGORIES[1], 2)).toBe(null);
    expect(collegeCategoryDescription({ description_college: '   ' }, 2)).toBe(null);
    expect(collegeCategoryDescription(undefined, 2)).toBe(null);
  });
});

describe('QuizView — affichage collège', () => {
  it('6e : palierMax=1 sur les catégories et le tirage, catégorie vide masquée', async () => {
    renderWith({ groupLevels: ['college'], classCurriculumNiveaux: ['cycle3'] });
    await waitFor(() => expect(calls('/api/quiz/categories').length).toBeGreaterThan(0));
    expect(calls('/api/quiz/categories').every((p) => p.includes('palierMax=1'))).toBe(true);
    const select = screen.getByLabelText('Catégorie');
    await waitFor(() => expect(select.querySelectorAll('option').length).toBe(2));
    expect(screen.queryByRole('option', { name: /Le sol/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Tirer une question' }));
    await waitFor(() => expect(calls('/api/quiz/draw').length).toBe(1));
    expect(calls('/api/quiz/draw')[0]).toContain('palierMax=1');
  });

  it('3e : palierMax=2 ; description collège de la catégorie choisie', async () => {
    renderWith({ groupLevels: ['college'], classCurriculumNiveaux: ['cycle4'] });
    await waitFor(() => expect(calls('/api/quiz/categories').length).toBeGreaterThan(0));
    expect(calls('/api/quiz/categories').every((p) => p.includes('palierMax=2'))).toBe(true);
    const select = screen.getByLabelText('Catégorie');
    await waitFor(() => expect(select.querySelectorAll('option').length).toBe(2));
    expect(screen.queryByText('Les êtres vivants de la forêt et leurs besoins.')).toBeNull();
    fireEvent.change(select, { target: { value: 'vivant' } });
    expect(screen.getByText('Les êtres vivants de la forêt et leurs besoins.')).toBeTruthy();
    expect(screen.queryByText('Description savante')).toBeNull();
  });

  it('lycée : aucun palierMax, toutes les catégories, aucune description collège', async () => {
    renderWith({ groupLevels: ['lycee'], classCurriculumNiveaux: ['seconde'] });
    await waitFor(() => expect(calls('/api/quiz/categories').length).toBeGreaterThan(0));
    expect(calls('/api/quiz/categories').some((p) => p.includes('palierMax'))).toBe(false);
    const select = screen.getByLabelText('Catégorie');
    await waitFor(() => expect(select.querySelectorAll('option').length).toBe(3));
    fireEvent.change(select, { target: { value: 'vivant' } });
    expect(screen.queryByText('Les êtres vivants de la forêt et leurs besoins.')).toBeNull();
  });
});
