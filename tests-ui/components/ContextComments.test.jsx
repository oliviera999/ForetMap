import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ContextComments } from '../../src/components/context-comments.jsx';
import { PublicSettingsProvider } from '../../src/contexts/PublicSettingsContext.jsx';
import { resetContextCommentCountsBatch } from '../../src/utils/contextCommentCountsBatch.js';
import { writeContextCommentReadCursor } from '../../src/utils/contextCommentsHelpers.js';

const listContextComments = vi.fn();
const getContextCommentCounts = vi.fn();
const getAuthClaims = vi.fn(() => ({
  userType: 'student',
  canonicalUserId: 's1',
  userId: 's1',
}));

vi.mock('../../src/services/api.js', () => ({
  api: vi.fn(async () => ({ settings: {} })),
  getAuthClaims: (...args) => getAuthClaims(...args),
  listContextComments: (...args) => listContextComments(...args),
  getContextCommentCounts: (...args) => getContextCommentCounts(...args),
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
  getContextCommentCounts.mockReset();
  getContextCommentCounts.mockResolvedValue({
    counts: { t1: { total: 0, newestId: 0 } },
  });
  resetContextCommentCountsBatch();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ContextComments (résumé à l’ouverture + temps réel)', () => {
  test('section fermée au montage : pas d’appel réseau', async () => {
    renderComments();
    await waitFor(() => {
      expect(getContextCommentCounts).not.toHaveBeenCalled();
      expect(listContextComments).not.toHaveBeenCalled();
    });
    expect(document.querySelector('.context-comments-count')).toBeNull();
    expect(screen.queryByText(/Aucun commentaire/)).toBeNull();
  });

  test('ouverture : un seul appel liste, pastille depuis le total', async () => {
    listContextComments.mockResolvedValue({ items: makeComments(4), total: 4, page: 1 });

    renderComments();
    expect(getContextCommentCounts).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Commentaires/ }));

    await waitFor(() => expect(listContextComments).toHaveBeenCalledTimes(1));
    expect(listContextComments.mock.calls[0][0]).toMatchObject({
      contextType: 'task',
      contextId: 't1',
      page: 1,
      pageSize: 10,
    });
    await waitFor(() => {
      expect(screen.getByText('Message 4')).toBeTruthy();
    });
    expect(document.querySelector('.context-comments-count--read')?.textContent).toBe('4');
  });

  test('ouverture déjà lue : pastille verte', async () => {
    writeContextCommentReadCursor('student', 's1', 'task', 't1', 2, 2);
    listContextComments.mockResolvedValue({ items: makeComments(2), total: 2, page: 1 });

    renderComments();
    fireEvent.click(screen.getByRole('button', { name: /Commentaires/ }));

    await waitFor(() => {
      expect(document.querySelector('.context-comments-count--read')?.textContent).toBe('2');
    });
    expect(document.querySelector('.context-comments-count--unread')).toBeNull();
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
    expect(getContextCommentCounts).not.toHaveBeenCalled();
    expect(document.querySelector('.context-comments-count')?.textContent).toBe('3');
  });

  test('temps réel section fermée : pastille rouge + refresh résumé', async () => {
    getContextCommentCounts.mockResolvedValue({
      counts: { t1: { total: 1, newestId: 11 } },
    });

    renderComments();
    expect(getContextCommentCounts).not.toHaveBeenCalled();

    window.dispatchEvent(
      new CustomEvent('foretmap_realtime', {
        detail: {
          domain: 'context_comments',
          payload: { contextType: 'task', contextId: 't1' },
        },
      }),
    );

    await waitFor(() => expect(getContextCommentCounts).toHaveBeenCalledTimes(1));
    await waitFor(
      () => {
        expect(document.querySelector('.context-comments-count--unread')?.textContent).toBe('1');
      },
      { timeout: 3000 },
    );
    expect(listContextComments).not.toHaveBeenCalled();
  });

  test('defaultOpen charge la liste au montage', async () => {
    listContextComments.mockResolvedValue({ items: makeComments(1), total: 1, page: 1 });

    renderComments({ defaultOpen: true });

    await waitFor(() => expect(listContextComments).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Message 1')).toBeTruthy());
    expect(getContextCommentCounts).not.toHaveBeenCalled();
  });
});
