import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  AccountDeletedError: class AccountDeletedError extends Error {},
  // Carnet hors ligne (piste D) : compte connecté et détection de panne réseau.
  getAuthUserId: () => 'u1',
  isLikelyNetworkTransportFailure: (err) => err?.code === 'NETWORK_UNREACHABLE',
}));
vi.mock('../../../src/components/journal/UserJournalArticleCard.jsx', () => ({
  UserJournalArticleCard: ({ article }) => (
    <div data-testid="article">{article.title || 'article'}</div>
  ),
}));

import { UserJournalView } from '../../../src/components/journal/UserJournalView.jsx';

const DATA = {
  limits: { maxChars: 0, maxAssets: 0 },
  articles: [
    {
      id: 1,
      title: 'Note sur les renards',
      bodyMarkdown: 'texte',
      createdAt: '2026-05-01T10:00:00Z',
    },
  ],
  imports: [
    {
      id: 2,
      resourceType: 'glossary',
      resourceRef: 'humus',
      title: 'Humus',
      createdAt: '2026-05-02T10:00:00Z',
    },
  ],
};

/** Miroir ForetMap du test G&L « B.7 » : le fil partagé (`useJournalFeed`) filtre, cherche, trie. */
describe('UserJournalView — filtre / recherche / tri sur le fil partagé', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue(DATA);
  });

  test('charge le carnet, filtre par type et recherche', async () => {
    render(<UserJournalView onNavigateTab={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('article')).toBeInTheDocument());
    expect(apiMock).toHaveBeenCalledWith('/api/user-journal/me');
    expect(screen.getByText('Humus')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrer par type d’entrée'), {
      target: { value: 'import' },
    });
    expect(screen.queryByTestId('article')).not.toBeInTheDocument();
    expect(screen.getByText('Humus')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrer par type d’entrée'), {
      target: { value: 'all' },
    });
    fireEvent.change(screen.getByLabelText('Rechercher dans mon carnet'), {
      target: { value: 'renard' },
    });
    expect(screen.getByTestId('article')).toBeInTheDocument();
    expect(screen.queryByText('Humus')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Rechercher dans mon carnet'), {
      target: { value: 'zzzzz' },
    });
    expect(screen.getByText(/Aucune entrée ne correspond/i)).toBeInTheDocument();
  });

  test('« + Nouvel article » crée via l’adaptateur et insère en tête', async () => {
    apiMock.mockImplementation(async (path, method) => {
      if (method === 'POST')
        return { article: { id: 9, title: 'Nouveau', createdAt: '2026-06-01T10:00:00Z' } };
      return DATA;
    });
    render(<UserJournalView onNavigateTab={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('article')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '+ Nouvel article' }));
    await waitFor(() => expect(screen.getAllByTestId('article')).toHaveLength(2));
    expect(apiMock).toHaveBeenCalledWith('/api/user-journal/me/articles', 'POST', {
      bodyMarkdown: '',
    });
  });

  test('erreur de chargement : message et bouton « Réessayer »', async () => {
    apiMock.mockRejectedValueOnce(new Error('Panne'));
    render(<UserJournalView onNavigateTab={() => {}} />);
    await waitFor(() => expect(screen.getByText('Panne')).toBeInTheDocument());
    apiMock.mockResolvedValue(DATA);
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByTestId('article')).toBeInTheDocument());
  });
});
