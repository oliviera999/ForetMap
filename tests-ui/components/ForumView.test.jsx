// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiMock = vi.fn();
const toggleReactionMock = vi.fn();
vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  toggleForumPostReaction: (...args) => toggleReactionMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

import { ForumView } from '../../src/components/forum-views.jsx';
import { PublicSettingsProvider } from '../../src/contexts/PublicSettingsContext.jsx';

const THREAD = {
  id: 't1',
  title: 'Premier sujet',
  author_display_name: 'Prof',
  created_at: '2026-06-01T10:00:00.000Z',
  posts_count: 1,
};

const POST = {
  id: 'p1',
  author_display_name: 'Prof',
  body: 'Bonjour',
  created_at: '2026-06-01T10:00:00.000Z',
  is_deleted: 0,
  image_urls: [],
  reactions: [],
};

function mockForum() {
  apiMock.mockImplementation((path) => {
    const url = String(path);
    if (url.startsWith('/api/forum/threads/')) {
      return Promise.resolve({ thread: THREAD, posts: [POST], total_posts: 1, page: 1 });
    }
    if (url.startsWith('/api/forum/threads')) {
      return Promise.resolve({ items: [THREAD], total: 1, page: 1 });
    }
    if (url.startsWith('/api/groups/options')) return Promise.resolve({ groups: [] });
    return Promise.resolve({});
  });
}

const CLAIMS = { userType: 'student', canonicalUserId: 's1', userId: 's1' };

beforeEach(() => {
  apiMock.mockReset();
  toggleReactionMock.mockReset();
});

const THREAD_B = { ...THREAD, id: 't2', title: 'Second sujet' };

function listCalls() {
  return apiMock.mock.calls.filter(([p]) => /^\/api\/forum\/threads\?/.test(String(p)));
}
function detailCalls() {
  return apiMock.mock.calls.filter(([p]) => String(p).startsWith('/api/forum/threads/'));
}

function mockTwoThreads() {
  apiMock.mockImplementation((path) => {
    const url = String(path);
    if (url.startsWith('/api/forum/threads/t2')) {
      return Promise.resolve({ thread: THREAD_B, posts: [], total_posts: 0, page: 1 });
    }
    if (url.startsWith('/api/forum/threads/')) {
      return Promise.resolve({ thread: THREAD, posts: [POST], total_posts: 1, page: 1 });
    }
    if (url.startsWith('/api/forum/threads')) {
      return Promise.resolve({ items: [THREAD, THREAD_B], total: 2, page: 1 });
    }
    if (url.startsWith('/api/groups/options')) return Promise.resolve({ groups: [] });
    return Promise.resolve({});
  });
}

function renderForum(settings = { ui: { reactions: { allowed_emojis: '👍,🌱' } } }) {
  return render(
    <PublicSettingsProvider value={settings}>
      <ForumView authClaims={CLAIMS} />
    </PublicSettingsProvider>,
  );
}

describe('ForumView — navigation et rafraîchissements', () => {
  test('choisir un sujet ne recharge pas la liste des sujets', async () => {
    // Régression : `loadThreads` dépendait du sujet sélectionné, donc chaque clic relançait
    // la liste (et la ramenait en page 1).
    mockTwoThreads();
    renderForum();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Premier sujet' })).toBeTruthy(),
    );
    const before = listCalls().length;

    fireEvent.click(screen.getByRole('button', { name: /Second sujet/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Second sujet' })).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(listCalls().length).toBe(before);
  });

  test('choisir un sujet bascule sur la discussion ; « Tous les sujets » revient à la liste', async () => {
    mockTwoThreads();
    const { container } = renderForum();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Premier sujet' })).toBeTruthy(),
    );
    const view = container.querySelector('.forum-view');
    expect(view).toHaveClass('forum-view--pane-list');

    fireEvent.click(screen.getByRole('button', { name: /Second sujet/ }));
    expect(view).toHaveClass('forum-view--pane-detail');

    fireEvent.click(await screen.findByRole('button', { name: /Tous les sujets/ }));
    expect(view).toHaveClass('forum-view--pane-list');
  });

  test('réagir met à jour le message sur place, sans recharger la discussion', async () => {
    mockForum();
    toggleReactionMock.mockResolvedValue({ ok: true, reacted: true, emoji: '🌱' });
    renderForum();
    await waitFor(() => expect(screen.getByText('Bonjour')).toBeTruthy());
    const before = detailCalls().length;

    fireEvent.click(screen.getByTitle('Afficher toutes les réactions'));
    fireEvent.click(screen.getByTitle('Réagir avec 🌱'));

    await waitFor(() => expect(screen.getByTitle('Réagir avec 🌱')).toHaveClass('active'));
    expect(toggleReactionMock).toHaveBeenCalledWith('p1', '🌱');
    expect(detailCalls().length).toBe(before);
    expect(screen.queryByText('Chargement…')).toBeNull();
  });

  test('le formulaire « Nouveau sujet » est replié tant qu’on ne le demande pas', async () => {
    mockForum();
    renderForum();
    await waitFor(() => expect(screen.getByText('Bonjour')).toBeTruthy());
    const titleField = () => document.getElementById('forum-thread-title');
    expect(titleField()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Nouveau sujet/ }));
    expect(titleField()).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(titleField()).toBeNull();
  });

  test('sujet verrouillé : message explicite à la place du formulaire de réponse', async () => {
    apiMock.mockImplementation((path) => {
      const url = String(path);
      if (url.startsWith('/api/forum/threads/')) {
        return Promise.resolve({
          thread: { ...THREAD, is_locked: 1 },
          posts: [POST],
          total_posts: 1,
          page: 1,
        });
      }
      if (url.startsWith('/api/forum/threads')) {
        return Promise.resolve({ items: [{ ...THREAD, is_locked: 1 }], total: 1, page: 1 });
      }
      return Promise.resolve({ groups: [] });
    });
    renderForum();
    await waitFor(() =>
      expect(screen.getByText(/Sujet verrouillé : les réponses sont fermées/)).toBeTruthy(),
    );
    expect(screen.queryByLabelText('Répondre')).toBeNull();
  });
});

describe('ForumView — coût d’ouverture', () => {
  test('ne relit pas les réglages publics : ils viennent du contexte', async () => {
    // Le forum allait chercher `GET /api/settings/public` à chaque ouverture pour en extraire
    // les seuls emojis de réaction, que `PublicSettingsContext` fournit déjà — le geste retiré
    // de ContextComments au lot 2 subsistait ici (docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, T3).
    mockForum();
    render(
      <PublicSettingsProvider value={{ ui: { reactions: { allowed_emojis: '👍,🌱' } } }}>
        <ForumView authClaims={CLAIMS} />
      </PublicSettingsProvider>,
    );

    await waitFor(() => expect(screen.getByText('Premier sujet')).toBeTruthy());
    await new Promise((resolve) => setTimeout(resolve, 20));

    const settingsCalls = apiMock.mock.calls.filter(([p]) =>
      String(p).startsWith('/api/settings/public'),
    );
    expect(settingsCalls).toEqual([]);
  });

  test('les emojis proposés sont bien ceux du contexte, pas la liste par défaut', async () => {
    // Liste choisie pour trancher : elle ne commence PAS par l'emoji de tête de la liste
    // par défaut ('👍'), que l'appel supprimé aurait restitué.
    mockForum();
    const { container } = render(
      <PublicSettingsProvider value={{ ui: { reactions: { allowed_emojis: '🌱,🐛' } } }}>
        <ForumView authClaims={CLAIMS} />
      </PublicSettingsProvider>,
    );

    await waitFor(() => expect(screen.getByText('Premier sujet')).toBeTruthy());
    await waitFor(() => expect(container.textContent).toContain('🌱'));
    expect(container.textContent).not.toContain('👍');
  });
});
