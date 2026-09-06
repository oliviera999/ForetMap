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
  test('un seul appel réseau au montage (ni compteur séparé, ni réglages publics)', async () => {
    // Chaque section montée émettait trois requêtes : la liste d'aperçu, un second appel
    // `page_size=1` pour le seul compteur, et `GET /api/settings/public` pour les emojis de
    // réaction. Sur un écran de liste — catalogue biodiversité, tuiles de tâches, tutoriels —
    // cela se multipliait par le nombre d'éléments affichés et pouvait épuiser le plafond de
    // requêtes d'un établissement (docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, B1/P1/P2).
    // Le total et le commentaire le plus récent sont dans la réponse de la liste ; les
    // emojis viennent du contexte des réglages publics.
    const { api } = await import('../../src/services/api.js');
    api.mockClear();
    listContextComments.mockResolvedValue({ items: makeComments(2), total: 2, page: 1 });

    render(<ContextComments contextType="plant" contextId="42" title="Commentaires" />);

    await waitFor(() => expect(listContextComments).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(listContextComments).toHaveBeenCalledTimes(1);
    expect(listContextComments.mock.calls[0][0]).toMatchObject({
      contextType: 'plant',
      contextId: '42',
      page: 1,
    });
    expect(api).not.toHaveBeenCalled();
  });

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

  test('section repliée sans commentaire : pas d’aperçu ni de message vide', async () => {
    listContextComments.mockResolvedValue({ items: [], total: 0, page: 1 });

    render(<ContextComments contextType="task" contextId="t1" title="Commentaires" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Commentaires/ })).toBeTruthy();
    });
    expect(screen.queryByText(/Aucun commentaire/)).toBeNull();
    expect(document.querySelector('.context-comments-preview')).toBeNull();
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
