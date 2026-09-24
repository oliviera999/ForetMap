import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { GLForumView } from '../../src/gl/components/GLForumView.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
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

function mockForum({ locked = false } = {}) {
  vi.mocked(apiGL).mockImplementation((path) => {
    const url = String(path);
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

describe('GLForumView', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
  });

  test('affiche le pseudo de l’auteur et la date, pas l’identifiant technique', async () => {
    mockForum();
    render(<GLForumView canModerate={false} auth={PLAYER_AUTH} />);
    fireEvent.click(await screen.findByRole('button', { name: /Où trouver des glands/ }));

    await waitFor(() => expect(screen.getByText('Momo')).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/gl_player#/);
    expect(document.querySelectorAll('.gl-forum-posts time').length).toBe(2);
  });

  test('Supprimer seulement sur ses propres messages (joueur)', async () => {
    mockForum();
    render(<GLForumView canModerate={false} auth={PLAYER_AUTH} />);
    fireEvent.click(await screen.findByRole('button', { name: /Où trouver des glands/ }));
    await waitFor(() => expect(screen.getByText('Momo')).toBeTruthy());

    const items = document.querySelectorAll('.gl-forum-posts > li');
    expect(within(items[0]).queryByRole('button', { name: 'Supprimer' })).toBeTruthy();
    expect(within(items[1]).queryByRole('button', { name: 'Supprimer' })).toBeNull();
  });

  test('choisir un sujet bascule sur la discussion, « Tous les sujets » revient', async () => {
    mockForum();
    const { container } = render(<GLForumView canModerate={false} auth={PLAYER_AUTH} />);
    const root = container.querySelector('.gl-forum');
    expect(root).toHaveClass('gl-forum--pane-list');
    fireEvent.click(await screen.findByRole('button', { name: /Où trouver des glands/ }));
    expect(root).toHaveClass('gl-forum--pane-detail');
    fireEvent.click(await screen.findByRole('button', { name: /Tous les sujets/ }));
    expect(root).toHaveClass('gl-forum--pane-list');
  });

  test('sujet verrouillé : pas de formulaire de réponse pour un joueur', async () => {
    mockForum({ locked: true });
    render(<GLForumView canModerate={false} auth={PLAYER_AUTH} />);
    fireEvent.click(await screen.findByRole('button', { name: /Où trouver des glands/ }));
    await waitFor(() => expect(screen.getByText(/les réponses sont fermées/)).toBeTruthy());
    expect(screen.queryByText('Répondre')).toBeNull();
  });
});
