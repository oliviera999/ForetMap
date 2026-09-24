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

describe('ContextComments (résumé fermé + liste à l’ouverture)', () => {
  test('section fermée : un résumé counts, pas de liste', async () => {
    getContextCommentCounts.mockResolvedValue({
      counts: { t1: { total: 4, newestId: 40 } },
    });

    renderComments();

    await waitFor(() => expect(getContextCommentCounts).toHaveBeenCalled());
    expect(listContextComments).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.querySelector('.context-comments-count')?.textContent).toBe('4');
    });
    expect(screen.queryByText(/Aucun commentaire/)).toBeNull();
    expect(document.querySelector('.context-comments-preview')).toBeNull();
  });

  test('section fermée avec commentaires jamais lus : pastille rouge avec tous les non-lus', async () => {
    getContextCommentCounts.mockResolvedValue({
      counts: { t1: { total: 2, newestId: 20 } },
    });

    renderComments();

    await waitFor(() => {
      expect(document.querySelector('.context-comments-count--unread')?.textContent).toBe('2');
    });
  });

  test('section fermée déjà lue : pastille verte avec le total', async () => {
    writeContextCommentReadCursor('student', 's1', 'task', 't1', 20, 2);
    getContextCommentCounts.mockResolvedValue({
      counts: { t1: { total: 2, newestId: 20 } },
    });

    renderComments();

    await waitFor(() => {
      expect(document.querySelector('.context-comments-count--read')?.textContent).toBe('2');
    });
    expect(document.querySelector('.context-comments-count--unread')).toBeNull();
  });

  test('nouveaux commentaires depuis la lecture : seuls les nouveaux sont comptés', async () => {
    writeContextCommentReadCursor('student', 's1', 'task', 't1', 20, 2);
    getContextCommentCounts.mockResolvedValue({
      counts: { t1: { total: 5, newestId: 50 } },
    });

    renderComments();

    await waitFor(() => {
      expect(document.querySelector('.context-comments-count--unread')?.textContent).toBe('3');
    });
  });

  test('aucun commentaire : pas de pastille', async () => {
    renderComments();
    await waitFor(() => expect(getContextCommentCounts).toHaveBeenCalled());
    expect(document.querySelector('.context-comments-count')).toBeNull();
  });

  test('un seul appel liste complet à l’ouverture', async () => {
    getContextCommentCounts.mockResolvedValue({
      counts: { t1: { total: 2, newestId: 2 } },
    });
    listContextComments.mockResolvedValue({ items: makeComments(2), total: 2, page: 1 });

    renderComments();
    await waitFor(() => expect(getContextCommentCounts).toHaveBeenCalled());

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
    expect(document.querySelector('.context-comments-count--unread')).toBeNull();
    expect(document.querySelector('.context-comments-count--read')?.textContent).toBe('2');
  });

  test('repli : conserve le total affiché sans nouvel appel liste', async () => {
    getContextCommentCounts.mockResolvedValue({
      counts: { t1: { total: 3, newestId: 3 } },
    });
    listContextComments.mockResolvedValue({ items: makeComments(3), total: 3, page: 1 });

    renderComments();
    const toggle = () => screen.getByRole('button', { name: /Commentaires/ });
    await waitFor(() => expect(getContextCommentCounts).toHaveBeenCalled());
    fireEvent.click(toggle());
    await waitFor(() => expect(listContextComments).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Message 3')).toBeTruthy());

    const countsBeforeCollapse = getContextCommentCounts.mock.calls.length;
    fireEvent.click(toggle());
    await waitFor(() => expect(screen.queryByText('Message 3')).toBeNull());
    expect(listContextComments).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.context-comments-count')?.textContent).toBe('3');
    // Un second résumé peut partir au repli ; la liste complète ne doit pas être rappelée.
    expect(getContextCommentCounts.mock.calls.length).toBeGreaterThanOrEqual(countsBeforeCollapse);
  });

  test('temps réel section fermée : pastille rouge + refresh résumé', async () => {
    getContextCommentCounts
      .mockResolvedValueOnce({ counts: { t1: { total: 0, newestId: 0 } } })
      .mockResolvedValue({ counts: { t1: { total: 1, newestId: 11 } } });

    renderComments();
    await waitFor(() => expect(getContextCommentCounts).toHaveBeenCalledTimes(1));

    window.dispatchEvent(
      new CustomEvent('foretmap_realtime', {
        detail: {
          domain: 'context_comments',
          payload: { contextType: 'task', contextId: 't1' },
        },
      }),
    );

    await waitFor(() => {
      expect(document.querySelector('.context-comments-count--unread')?.textContent).toBe('1');
    });
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
