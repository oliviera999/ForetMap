// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  toggleForumPostReaction: vi.fn(),
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
