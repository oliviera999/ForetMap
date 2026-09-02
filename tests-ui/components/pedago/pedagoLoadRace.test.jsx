// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

/**
 * Anti-course des listes pédagogiques : une réponse lente d’un ancien filtre
 * ne doit pas écraser le résultat du filtre courant.
 */

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

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

vi.mock('../../../src/hooks/useGatingSummary', () => ({
  useGatingSummary: () => ({ summaries: new Map(), refresh: () => {} }),
}));

vi.mock('../../../src/components/pedago/GlossaryTermLearnedAcknowledge.jsx', () => ({
  GlossaryTermLearnedAcknowledgeButton: () => null,
  fetchLearnedGlossaryCodes: async () => [],
}));

vi.mock('../../../src/components/pedago/FoodWebGraph.jsx', () => ({
  FoodWebGraph: ({ items = [] }) => (
    <ul data-testid="foodweb-items">
      {items.map((row) => (
        <li key={row.id}>{row.from_name}</li>
      ))}
    </ul>
  ),
}));

vi.mock('../../../src/shared/components/LearningQuizPopover.jsx', () => ({
  LearningQuizPopover: () => null,
}));

import { GlossaryView } from '../../../src/components/pedago/GlossaryView.jsx';
import { FoodWebView } from '../../../src/components/pedago/FoodWebView.jsx';
import { QuizView } from '../../../src/components/pedago/QuizView.jsx';

beforeEach(() => {
  apiMock.mockReset();
});

describe('GlossaryView — anti-course des termes', () => {
  it('ignore la liste d’un filtre périmé au profit du filtre courant', async () => {
    const first = deferred();
    const second = deferred();
    apiMock.mockImplementation((path) => {
      if (path.startsWith('/api/glossary/categories')) {
        return Promise.resolve({ categories: [] });
      }
      if (path.startsWith('/api/glossary/terms?niveau=base')) {
        return second.promise;
      }
      if (path.startsWith('/api/glossary/terms')) {
        return first.promise;
      }
      return Promise.resolve({});
    });

    render(<GlossaryView />);

    await waitFor(() =>
      expect(apiMock.mock.calls.some(([p]) => p === '/api/glossary/terms')).toBe(true),
    );

    fireEvent.change(screen.getByLabelText('Niveau'), { target: { value: 'base' } });

    await waitFor(() =>
      expect(apiMock.mock.calls.some(([p]) => String(p).includes('niveau=base'))).toBe(true),
    );

    await act(async () => {
      first.resolve({ items: [{ glossary_code: 'OLD', terme: 'Terme périmé' }] });
      await Promise.resolve();
    });
    expect(screen.queryByText('Terme périmé')).toBeNull();

    await act(async () => {
      second.resolve({ items: [{ glossary_code: 'NEW', terme: 'Terme à jour' }] });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Terme à jour')).toBeTruthy());
    expect(screen.queryByText('Terme périmé')).toBeNull();
  });
});

describe('FoodWebView — anti-course du graphe', () => {
  it('ignore la réponse de « toutes les cartes » après un changement de carte', async () => {
    const first = deferred();
    const second = deferred();
    apiMock.mockImplementation((path) => {
      if (path.startsWith('/api/food-web?mapId=m1')) return second.promise;
      if (path.startsWith('/api/food-web')) return first.promise;
      if (path.startsWith('/api/zones')) return Promise.resolve([]);
      if (path.startsWith('/api/plants')) return Promise.resolve([]);
      return Promise.resolve({});
    });

    render(<FoodWebView maps={[{ id: 'm1', label: 'Forêt' }]} />);

    await waitFor(() => expect(apiMock.mock.calls.some(([p]) => p === '/api/food-web')).toBe(true));

    fireEvent.change(screen.getByLabelText('Carte'), { target: { value: 'm1' } });

    await waitFor(() =>
      expect(apiMock.mock.calls.some(([p]) => String(p).includes('mapId=m1'))).toBe(true),
    );

    await act(async () => {
      first.resolve({
        items: [
          {
            id: 1,
            from_id: 10,
            from_name: 'Ancienne espèce',
            to_id: 11,
            to_name: 'Cible',
            interaction_type: 'predation',
          },
        ],
      });
      await Promise.resolve();
    });
    expect(screen.queryByText('Ancienne espèce')).toBeNull();

    await act(async () => {
      second.resolve({
        items: [
          {
            id: 2,
            from_id: 20,
            from_name: 'Espèce actuelle',
            to_id: 21,
            to_name: 'Cible',
            interaction_type: 'predation',
          },
        ],
      });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Espèce actuelle')).toBeTruthy());
    expect(screen.queryByText('Ancienne espèce')).toBeNull();
  });
});

describe('QuizView — anti-course des catégories', () => {
  it('ignore les catégories d’un thème périmé', async () => {
    const first = deferred();
    const second = deferred();
    apiMock.mockImplementation((path) => {
      if (path.startsWith('/api/quiz/me/progress')) {
        return Promise.resolve({ correct: 0, attempts: 0 });
      }
      if (path.startsWith('/api/quiz/categories?theme=sciences')) {
        return second.promise;
      }
      if (path.startsWith('/api/quiz/categories')) {
        return first.promise;
      }
      return Promise.resolve({});
    });

    render(<QuizView />);

    await waitFor(() =>
      expect(apiMock.mock.calls.some(([p]) => p === '/api/quiz/categories')).toBe(true),
    );

    fireEvent.change(screen.getByLabelText('Thème'), { target: { value: 'sciences' } });

    await waitFor(() =>
      expect(apiMock.mock.calls.some(([p]) => String(p).includes('theme=sciences'))).toBe(true),
    );

    await act(async () => {
      first.resolve({ categories: [{ slug: 'old', nom: 'Catégorie périmée' }] });
      await Promise.resolve();
    });
    expect(screen.queryByRole('option', { name: 'Catégorie périmée' })).toBeNull();

    await act(async () => {
      second.resolve({ categories: [{ slug: 'new', nom: 'Catégorie à jour' }] });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Catégorie à jour' })).toBeTruthy(),
    );
    expect(screen.queryByRole('option', { name: 'Catégorie périmée' })).toBeNull();
  });
});
