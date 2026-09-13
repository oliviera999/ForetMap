import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ContextComments } from '../../src/components/context-comments.jsx';
import { PublicSettingsProvider } from '../../src/contexts/PublicSettingsContext.jsx';

const listContextComments = vi.fn();
const getAuthClaims = vi.fn(() => ({
  userType: 'student',
  canonicalUserId: 's1',
  userId: 's1',
}));

vi.mock('../../src/services/api.js', () => ({
  api: vi.fn(async () => ({ settings: {} })),
  getAuthClaims: (...args) => getAuthClaims(...args),
  listContextComments: (...args) => listContextComments(...args),
  createContextComment: vi.fn(),
  deleteContextComment: vi.fn(),
  reportContextComment: vi.fn(),
  toggleContextCommentReaction: vi.fn(),
}));

function makeComments(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: count - i,
    author_display_name: `Auteur ${count - i}`,
    body: `Message ${count - i}`,
    created_at: `2026-06-1${i}T10:00:00.000Z`,
    is_deleted: 0,
    image_urls: [],
    reactions: [],
  }));
}

function renderComments(props = {}) {
  return render(
    <PublicSettingsProvider value={{ modules: { reports_enabled: true } }}>
      <ContextComments contextType="task" contextId="t1" title="Commentaires" {...props} />
    </PublicSettingsProvider>,
  );
}

beforeEach(() => {
  listContextComments.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ContextComments (D1 — charge à l’ouverture)', () => {
  test('aucun appel réseau tant que la section est fermée', async () => {
    renderComments();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(listContextComments).not.toHaveBeenCalled();
    expect(screen.queryByText(/Aucun commentaire/)).toBeNull();
    expect(document.querySelector('.context-comments-preview')).toBeNull();
  });

  test('un seul appel liste complet à l’ouverture', async () => {
    listContextComments.mockResolvedValue({ items: makeComments(2), total: 2, page: 1 });

    renderComments();
    fireEvent.click(screen.getByRole('button', { name: /Commentaires/ }));

    await waitFor(() => expect(listContextComments).toHaveBeenCalledTimes(1));
    expect(listContextComments.mock.calls[0][0]).toMatchObject({
      contextType: 'task',
      contextId: 't1',
      page: 1,
      pageSize: 10,
    });
    await waitFor(() => {
      expect(screen.getByText('Message 2')).toBeTruthy();
      expect(screen.getByText('Message 1')).toBeTruthy();
    });
  });

  test('repli : conserve le total affiché sans nouvel appel', async () => {
    listContextComments.mockResolvedValue({ items: makeComments(3), total: 3, page: 1 });

    renderComments();
    const toggle = () => screen.getByRole('button', { name: /Commentaires/ });
    fireEvent.click(toggle());
    await waitFor(() => expect(listContextComments).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Message 3')).toBeTruthy());

    fireEvent.click(toggle());
    await waitFor(() => expect(screen.queryByText('Message 3')).toBeNull());
    expect(listContextComments).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.context-comments-count')?.textContent).toBe('3');
  });

  test('temps réel section fermée : point non lu sans fetch', async () => {
    renderComments();
    expect(listContextComments).not.toHaveBeenCalled();

    window.dispatchEvent(
      new CustomEvent('foretmap_realtime', {
        detail: {
          domain: 'context_comments',
          payload: { contextType: 'task', contextId: 't1' },
        },
      }),
    );

    await waitFor(() => {
      expect(document.querySelector('.context-comments-unread-dot')).toBeTruthy();
    });
    expect(listContextComments).not.toHaveBeenCalled();
  });

  test('defaultOpen charge la liste au montage', async () => {
    listContextComments.mockResolvedValue({ items: makeComments(1), total: 1, page: 1 });

    renderComments({ defaultOpen: true });

    await waitFor(() => expect(listContextComments).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Message 1')).toBeTruthy());
  });
});
