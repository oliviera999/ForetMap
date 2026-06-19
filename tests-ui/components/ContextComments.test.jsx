import React from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ContextComments } from '../../src/components/context-comments.jsx';

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

beforeEach(() => {
  listContextComments.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ContextComments', () => {
  test('affiche les 2 premiers commentaires sans déplier la section', async () => {
    listContextComments.mockImplementation(async ({ pageSize }) => {
      const all = makeComments(3);
      return {
        items: all.slice(0, pageSize),
        total: 3,
        page: 1,
      };
    });

    render(<ContextComments contextType="task" contextId="t1" title="Commentaires" />);

    await waitFor(() => {
      expect(screen.getByText('Message 3')).toBeTruthy();
      expect(screen.getByText('Message 2')).toBeTruthy();
    });
    expect(screen.queryByText('Message 1')).toBeNull();
    expect(screen.getByRole('button', { name: /1 commentaire de plus/ })).toBeTruthy();
  });

  test('bouton « de plus » déplie la liste complète', async () => {
    listContextComments.mockImplementation(async ({ pageSize }) => {
      const all = makeComments(3);
      return {
        items: all.slice(0, pageSize),
        total: 3,
        page: 1,
      };
    });

    render(<ContextComments contextType="task" contextId="t1" title="Commentaires" />);

    await waitFor(() => expect(screen.getByText('Message 2')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /1 commentaire de plus/ }));

    await waitFor(() => {
      expect(screen.getByText('Message 1')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Publier' })).toBeTruthy();
    });
  });

  test('indicateur non lu sur le toggle quand de nouveaux commentaires arrivent', async () => {
    listContextComments.mockImplementation(async ({ pageSize }) => ({
      items: makeComments(pageSize === 1 ? 1 : 2),
      total: 2,
      page: 1,
    }));

    render(<ContextComments contextType="task" contextId="t1" title="Commentaires" />);

    await waitFor(() => expect(screen.getByText('Message 2')).toBeTruthy());

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
  });
});
