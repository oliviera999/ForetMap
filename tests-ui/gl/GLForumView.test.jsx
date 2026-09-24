import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GLForumView } from '../../src/gl/components/GLForumView.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

const socketHandlers = new Map();
const releaseMock = vi.fn();
vi.mock('../../src/gl/realtime/glSocketClient.js', () => ({
  acquireGlSocket: vi.fn(() => ({
    socket: {
      on: (event, fn) => socketHandlers.set(event, fn),
      off: (event) => socketHandlers.delete(event),
    },
    release: releaseMock,
  })),
}));

vi.mock('../../src/utils/realtimeRefreshDelay', () => ({
  jitteredRefreshDelay: () => 0,
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

const THREAD = {
  id: 7,
  title: 'Où trouver des glands ?',
  author_display_name: 'Lulu',
  posts_count: 2,
  is_locked: 0,
  created_at: '2026-09-20T09:00:00.000Z',
  updated_at: '2026-09-21T09:00:00.000Z',
};

const POSTS = [
  {
    id: 1,
    body: 'Ligne 1\nLigne 2',
    author_user_type: 'gl_player',
    author_user_id: '12',
    author_display_name: 'Lulu',
    is_deleted: 0,
    created_at: '2026-09-20T09:00:00.000Z',
  },
  {
    id: 2,
    body: 'Réponse',
    author_user_type: 'gl_player',
    author_user_id: '99',
    author_display_name: 'Momo',
    is_deleted: 0,
    created_at: '2026-09-21T09:00:00.000Z',
  },
];

function mockForum({ locked = false, config = {} } = {}) {
  vi.mocked(apiGL).mockImplementation((path) => {
    const url = String(path);
    if (url.startsWith('/api/gl/forum/config')) {
      return Promise.resolve({ reaction_emojis: '🦄,🍄', reports_enabled: true, ...config });
    }
    if (url.startsWith('/api/gl/forum/threads/7')) {
      return Promise.resolve({ thread: { ...THREAD, is_locked: locked ? 1 : 0 }, posts: POSTS });
    }
    if (url.startsWith('/api/gl/forum/threads')) {
      return Promise.resolve({ items: [{ ...THREAD, is_locked: locked ? 1 : 0 }], total: 1 });
    }
    return Promise.resolve({});
  });
}

const PLAYER_AUTH = { userType: 'gl_player', userId: '12' };

function listCalls() {
  return vi
    .mocked(apiGL)
    .mock.calls.filter(([p]) => String(p).startsWith('/api/gl/forum/threads?'));
}

describe('GLForumView', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
    socketHandlers.clear();
    releaseMock.mockReset();
    window.localStorage.clear();
  });

  test('affiche le pseudo de l’auteur et la date, pas l’identifiant technique', async () => {
    mockForum();
    render(<GLForumView canModerate={false} auth={PLAYER_AUTH} />);
    fireEvent.click(await screen.findByRole('button', { name: /Où trouver des glands/ }));

    await waitFor(() => expect(screen.getByText('Momo')).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/gl_player#/);
    expect(document.querySelectorAll('.forum-post time').length).toBe(2);
  });

  test('Supprimer seulement sur ses propres messages (joueur)', async () => {
    mockForum();
    render(<GLForumView canModerate={false} auth={PLAYER_AUTH} />);
    fireEvent.click(await screen.findByRole('button', { name: /Où trouver des glands/ }));
    await waitFor(() => expect(screen.getByText('Momo')).toBeTruthy());

    const items = document.querySelectorAll('.forum-post');
    expect(within(items[0]).queryByRole('button', { name: 'Supprimer' })).toBeTruthy();
    expect(within(items[1]).queryByRole('button', { name: 'Supprimer' })).toBeNull();
  });

  test('choisir un sujet bascule sur la discussion, « Tous les sujets » revient', async () => {
    mockForum();
    const { container } = render(<GLForumView canModerate={false} auth={PLAYER_AUTH} />);
    const root = container.querySelector('.forum-view');
    expect(root).toHaveClass('forum-view--pane-list');
    fireEvent.click(await screen.findByRole('button', { name: /Où trouver des glands/ }));
    expect(root).toHaveClass('forum-view--pane-detail');
    fireEvent.click(await screen.findByRole('button', { name: /Tous les sujets/ }));
    expect(root).toHaveClass('forum-view--pane-list');
  });

  test('sujet verrouillé : pas de formulaire de réponse pour un joueur', async () => {
    mockForum({ locked: true });
    render(<GLForumView canModerate={false} auth={PLAYER_AUTH} />);
    fireEvent.click(await screen.findByRole('button', { name: /Où trouver des glands/ }));
    await waitFor(() => expect(screen.getByText(/les réponses sont fermées/)).toBeTruthy());
    expect(screen.queryByLabelText('Répondre')).toBeNull();
  });

  test('sujet verrouillé : le MJ peut encore répondre', async () => {
    mockForum({ locked: true });
    render(<GLForumView canModerate auth={{ userType: 'gl_admin', userId: '1' }} />);
    await screen.findByText(/seuls les modérateurs peuvent encore répondre/);
    expect(screen.getByLabelText('Répondre')).toBeTruthy();
  });

  test('les emojis de réaction viennent de GET /config', async () => {
    mockForum();
    const { container } = render(<GLForumView canModerate={false} auth={PLAYER_AUTH} />);
    await waitFor(() => expect(screen.getByText('Momo')).toBeTruthy());
    await waitFor(() => expect(container.textContent).toContain('🦄'));
  });

  test('invité : lecture seule, ni nouveau sujet ni réponse', async () => {
    mockForum();
    render(<GLForumView canModerate={false} auth={{ userType: 'gl_guest', userId: 'g1' }} />);
    await screen.findByText(/Mode invité/);
    await waitFor(() => expect(screen.getByText('Momo')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Nouveau sujet/ })).toBeNull();
    expect(screen.queryByLabelText('Répondre')).toBeNull();
  });

  test('temps réel : gl:forum:changed recharge la liste sans « Chargement… »', async () => {
    mockForum();
    const { unmount } = render(
      <GLForumView canModerate={false} auth={PLAYER_AUTH} token="jeton" />,
    );
    await waitFor(() => expect(screen.getByText('Momo')).toBeTruthy());
    const before = listCalls().length;
    expect(socketHandlers.has('gl:forum:changed')).toBe(true);

    await act(async () => {
      socketHandlers.get('gl:forum:changed')({ action: 'post_created', thread_id: 7 });
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    await waitFor(() => expect(listCalls().length).toBe(before + 1));
    expect(screen.queryByText('Chargement…')).toBeNull();

    unmount();
    expect(releaseMock).toHaveBeenCalled();
    expect(socketHandlers.has('gl:forum:changed')).toBe(false);
  });
});
