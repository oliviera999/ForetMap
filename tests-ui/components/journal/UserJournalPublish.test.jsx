import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  AccountDeletedError: class AccountDeletedError extends Error {},
  getAuthUserId: () => 'u1',
  isLikelyNetworkTransportFailure: (err) => err?.code === 'NETWORK_UNREACHABLE',
}));

import { UserJournalView } from '../../../src/components/journal/UserJournalView.jsx';

/** Serveur factice : un article créé vide, puis enregistré par `PUT`. */
function fakeServer() {
  const store = new Map();
  let nextId = 40;
  const handler = async (path, method, body) => {
    if (path === '/api/user-journal/me' && !method) {
      return { limits: { maxChars: 0, maxAssets: 0 }, articles: [...store.values()], imports: [] };
    }
    if (path === '/api/user-journal/me/articles' && method === 'POST') {
      const article = {
        id: nextId++,
        title: '',
        bodyMarkdown: '',
        assets: [],
        usage: { charCount: 0, assetCount: 0 },
        createdAt: '2026-11-19T10:00:00Z',
        updatedAt: '2026-11-19T10:00:00Z',
      };
      store.set(article.id, article);
      return { article };
    }
    const m = path.match(/^\/api\/user-journal\/me\/articles\/(\d+)$/);
    if (m && method === 'PUT') {
      const prev = store.get(Number(m[1]));
      const article = {
        ...prev,
        title: String(body.title || '').trim(),
        bodyMarkdown: body.bodyMarkdown,
        usage: { charCount: [...body.bodyMarkdown].length, assetCount: 0 },
        updatedAt: '2026-11-19T10:05:00Z',
      };
      store.set(article.id, article);
      return { article };
    }
    if (path.endsWith('/embeds/resolve')) return { titles: {}, cards: {} };
    throw new Error(`appel inattendu ${method} ${path}`);
  };
  return { store, handler };
}

/**
 * Régression « publication d'article » : après « + Nouvel article », saisie, puis « Terminer »,
 * la carte de lecture affichait l'article tel que créé (vide) — « Article sans titre » et
 * « Article sans texte » — parce que le fil n'apprenait jamais ce que l'éditeur enregistrait.
 */
describe('UserJournalView — publication d’un article', () => {
  let server;
  beforeEach(() => {
    apiMock.mockReset();
    server = fakeServer();
    apiMock.mockImplementation(server.handler);
  });

  test('« Terminer » juste après la saisie affiche le titre et le texte écrits', async () => {
    render(<UserJournalView />);
    await waitFor(() => expect(screen.getByText(/Ton carnet est encore vide/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '+ Nouvel article' }));
    await waitFor(() => expect(screen.getByTestId('journal-article-edit')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Titre de l’article'), {
      target: { value: 'Les champignons' },
    });
    fireEvent.change(screen.getByLabelText('Contenu de l’article'), {
      target: { value: 'J’ai vu un **cèpe** sous le chêne.' },
    });
    // Clic avant la fin du délai d'auto-enregistrement.
    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’édition' }));

    const card = await screen.findByTestId('journal-article-read');
    expect(card).toHaveTextContent('Les champignons');
    expect(card).toHaveTextContent('J’ai vu un cèpe sous le chêne.');
    expect(card).not.toHaveTextContent('Article sans titre');
    expect(card).not.toHaveTextContent('Article sans texte');

    // L'enregistrement de sortie part bien au serveur.
    await waitFor(() => expect(server.store.get(40)?.title).toBe('Les champignons'));
    expect(server.store.get(40).bodyMarkdown).toBe('J’ai vu un **cèpe** sous le chêne.');
  });

  test('« Terminer » après l’auto-enregistrement affiche aussi le contenu enregistré', async () => {
    render(<UserJournalView />);
    await waitFor(() => expect(screen.getByText(/Ton carnet est encore vide/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '+ Nouvel article' }));
    await waitFor(() => expect(screen.getByTestId('journal-article-edit')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Titre de l’article'), {
      target: { value: 'Mare' },
    });
    fireEvent.change(screen.getByLabelText('Contenu de l’article'), {
      target: { value: 'Des têtards.' },
    });
    await waitFor(() => expect(server.store.get(40)?.bodyMarkdown).toBe('Des têtards.'), {
      timeout: 3000,
    });
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'Terminer l’édition' }));
    const card = await screen.findByTestId('journal-article-read');
    expect(card).toHaveTextContent('Mare');
    expect(card).toHaveTextContent('Des têtards.');
  });

  test('la frappe pendant un enregistrement en vol n’est pas écrasée, ni l’espace final du titre', async () => {
    let releasePut = null;
    apiMock.mockImplementation(async (path, method, body) => {
      if (method === 'PUT' && !releasePut) {
        // Premier enregistrement : retenu jusqu'à ce que le test le libère.
        await new Promise((resolve) => {
          releasePut = resolve;
        });
      }
      return server.handler(path, method, body);
    });
    render(<UserJournalView />);
    await waitFor(() => expect(screen.getByText(/Ton carnet est encore vide/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '+ Nouvel article' }));
    await waitFor(() => expect(screen.getByTestId('journal-article-edit')).toBeInTheDocument());

    const titleInput = screen.getByLabelText('Titre de l’article');
    const bodyInput = screen.getByLabelText('Contenu de l’article');
    fireEvent.change(titleInput, { target: { value: 'La mare ' } });
    fireEvent.change(bodyInput, { target: { value: 'Des têtards' } });
    await waitFor(() => expect(releasePut).not.toBeNull(), { timeout: 3000 });

    // L'élève continue d'écrire pendant que l'enregistrement est en vol.
    fireEvent.change(bodyInput, { target: { value: 'Des têtards et une grenouille.' } });
    await act(async () => {
      releasePut();
    });

    expect(titleInput).toHaveValue('La mare ');
    expect(bodyInput).toHaveValue('Des têtards et une grenouille.');
    // L'envoi suivant porte la suite au serveur.
    await waitFor(
      () => expect(server.store.get(40)?.bodyMarkdown).toBe('Des têtards et une grenouille.'),
      { timeout: 3000 },
    );
    expect(server.store.get(40).title).toBe('La mare');
  });
});
