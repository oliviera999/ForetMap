// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SharedForumView } from '../../../src/shared/forum/SharedForumView.jsx';

const STORAGE_KEY = 'foretmap:forumThreadRead:test:student:u1';

const THREAD_A = {
  id: 'a',
  title: 'Sujet A',
  author_display_name: 'Prof',
  posts_count: 2,
  is_locked: 0,
  is_pinned: 0,
  created_at: '2026-09-01T10:00:00.000Z',
  last_post_at: '2026-09-02T10:00:00.000Z',
  last_other_post_at: '2026-09-02T10:00:00.000Z',
};
const THREAD_B = {
  ...THREAD_A,
  id: 'b',
  title: 'Sujet B',
  last_other_post_at: '2026-09-03T10:00:00.000Z',
};

const POSTS_A = [
  {
    id: 'p1',
    body: 'Où planter les fraisiers ?',
    author_user_type: 'teacher',
    author_user_id: 't1',
    author_display_name: 'Prof',
    is_deleted: 0,
    reactions: [],
    image_urls: [],
    created_at: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'p2',
    body: 'Près de la mare.',
    author_user_type: 'student',
    author_user_id: 'u1',
    author_display_name: 'Moi',
    is_deleted: 0,
    reactions: [],
    image_urls: [],
    created_at: '2026-09-02T10:00:00.000Z',
  },
];

function fakeAdapter({ threads = [THREAD_A], thread = THREAD_A, posts = POSTS_A, caps } = {}) {
  return {
    capabilities: { groups: false, moderatorCanReplyLocked: false, hasConfig: false, ...caps },
    listThreads: vi.fn().mockResolvedValue({ items: threads, total: threads.length, page: 1 }),
    getThread: vi.fn((id) =>
      Promise.resolve({
        thread: threads.find((t) => t.id === id) || thread,
        posts,
        total_posts: posts.length,
        page: 1,
      }),
    ),
    createThread: vi.fn().mockResolvedValue({ thread: null, firstPostId: null }),
    reply: vi.fn().mockResolvedValue({}),
    editPost: vi.fn((id, body) => Promise.resolve({ id, body, edited_at: '2026-09-04' })),
    deletePost: vi.fn().mockResolvedValue({}),
    toggleReaction: vi.fn().mockResolvedValue({ reacted: true }),
    report: vi.fn().mockResolvedValue({}),
    setLocked: vi.fn().mockResolvedValue({}),
    setPinned: vi.fn().mockResolvedValue({}),
    listReports: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    resolveReport: vi.fn().mockResolvedValue({}),
    fetchConfig: vi.fn().mockResolvedValue(null),
  };
}

const STUDENT = { userType: 'student', userId: 'u1' };

function renderView(adapter, props = {}) {
  return render(
    <SharedForumView
      adapter={adapter}
      currentUser={STUDENT}
      unreadStorageKey={STORAGE_KEY}
      reactionEmojis={['👍', '🌱']}
      {...props}
    />,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('SharedForumView — citer et modifier', () => {
  test('Citer insère le message cité dans le champ de réponse', async () => {
    const adapter = fakeAdapter();
    renderView(adapter);
    await screen.findByText('Où planter les fraisiers ?');

    const firstPost = screen.getByText('Où planter les fraisiers ?').closest('article');
    fireEvent.click(within(firstPost).getByRole('button', { name: 'Citer' }));

    expect(screen.getByLabelText('Répondre').value).toBe(
      '> **Prof** a écrit :\n> Où planter les fraisiers ?\n\n',
    );
  });

  test('Modifier n’est proposé que sur ses propres messages et met à jour sur place', async () => {
    const adapter = fakeAdapter();
    renderView(adapter);
    await screen.findByText('Près de la mare.');

    const [other, mine] = screen.getAllByRole('article');
    expect(within(other).queryByRole('button', { name: 'Modifier' })).toBeNull();
    fireEvent.click(within(mine).getByRole('button', { name: 'Modifier' }));
    fireEvent.change(screen.getByLabelText('Modifier le message'), {
      target: { value: 'Près de la mare, au soleil.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await screen.findByText('Près de la mare, au soleil.');
    expect(adapter.editPost).toHaveBeenCalledWith('p2', 'Près de la mare, au soleil.');
    expect(adapter.getThread).toHaveBeenCalledTimes(1);
  });
});

describe('SharedForumView — sujets verrouillés et épinglés', () => {
  test('modérateur : Épingler appelle l’adaptateur puis recharge', async () => {
    const adapter = fakeAdapter();
    renderView(adapter, { canModerate: true });
    fireEvent.click(await screen.findByRole('button', { name: 'Épingler' }));
    await waitFor(() => expect(adapter.setPinned).toHaveBeenCalledWith('a', true));
    await waitFor(() => expect(adapter.listThreads.mock.calls.length).toBeGreaterThan(1));
  });

  test('non modérateur : ni Épingler ni Verrouiller ni Signalements', async () => {
    renderView(fakeAdapter());
    await screen.findByText('Près de la mare.');
    expect(screen.queryByRole('button', { name: 'Épingler' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Verrouiller' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Signalements/ })).toBeNull();
  });

  test('sujet épinglé : badge « Épinglé » dans la liste', async () => {
    const pinned = { ...THREAD_A, is_pinned: 1 };
    renderView(fakeAdapter({ threads: [pinned], thread: pinned }));
    const list = await screen.findByRole('region', { name: 'Sujets du forum' });
    await waitFor(() => expect(within(list).getByText('Épinglé')).toBeTruthy());
  });

  test('sujet verrouillé : le modérateur répond encore si le produit le permet (MJ G&L)', async () => {
    const locked = { ...THREAD_A, is_locked: 1 };
    renderView(
      fakeAdapter({
        threads: [locked],
        thread: locked,
        caps: { moderatorCanReplyLocked: true },
      }),
      { canModerate: true },
    );
    await screen.findByText(/seuls les modérateurs peuvent encore répondre/);
    expect(screen.getByLabelText('Répondre')).toBeTruthy();
  });

  test('sujet verrouillé : réponse fermée pour un modérateur ForetMap', async () => {
    const locked = { ...THREAD_A, is_locked: 1 };
    renderView(fakeAdapter({ threads: [locked], thread: locked }), { canModerate: true });
    await screen.findByText(/les réponses sont fermées/);
    expect(screen.queryByLabelText('Répondre')).toBeNull();
  });
});

describe('SharedForumView — non-lus par sujet', () => {
  test('première ouverture : aucune pastille (tout ce qui est visible est lu)', async () => {
    renderView(fakeAdapter({ threads: [THREAD_A, THREAD_B] }));
    await screen.findByText('Près de la mare.');
    expect(screen.queryByLabelText('Nouveaux messages')).toBeNull();
  });

  test('pastille sur un sujet où quelqu’un a écrit depuis la dernière lecture', async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ baseline: '2026-09-02T10:00:00.000Z', threads: {} }),
    );
    renderView(fakeAdapter({ threads: [THREAD_A, THREAD_B] }));
    await screen.findByText('Près de la mare.');

    const itemB = screen.getByRole('button', { name: /Sujet B/ });
    expect(within(itemB).getByLabelText('Nouveaux messages')).toBeTruthy();
    const itemA = screen.getByRole('button', { name: /Sujet A/ });
    expect(within(itemA).queryByLabelText('Nouveaux messages')).toBeNull();

    fireEvent.click(itemB);
    await waitFor(() => expect(within(itemB).queryByLabelText('Nouveaux messages')).toBeNull());
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(stored.threads.b).toBe('2026-09-03T10:00:00.000Z');
  });
});

describe('SharedForumView — panneau Signalements', () => {
  const REPORT = {
    id: 9,
    post_id: 'p1',
    thread_id: 'a',
    thread_title: 'Sujet A',
    reason: 'Hors sujet',
    reporter_display_name: 'Élève',
    post_author_display_name: 'Prof',
    post_excerpt: 'Où planter les fraisiers ?',
    post_is_deleted: 0,
    created_at: '2026-09-02T10:00:00.000Z',
  };

  test('compteur, ouverture, « Classer sans suite » puis rechargement', async () => {
    const adapter = fakeAdapter();
    adapter.listReports
      .mockResolvedValueOnce({ items: [REPORT], total: 1 })
      .mockResolvedValueOnce({ items: [REPORT], total: 1 })
      .mockResolvedValue({ items: [], total: 0 });
    renderView(adapter, { canModerate: true });

    fireEvent.click(await screen.findByRole('button', { name: 'Signalements (1)' }));
    const panel = await screen.findByRole('region', { name: /Signalements à traiter/ });
    expect(within(panel).getByText('« Hors sujet »')).toBeTruthy();

    fireEvent.click(within(panel).getByRole('button', { name: 'Classer sans suite' }));
    await waitFor(() => expect(adapter.resolveReport).toHaveBeenCalledWith(9, 'dismissed'));
    await screen.findByText('Aucun signalement en attente.');
    expect(screen.getByRole('button', { name: 'Signalements (0)' })).toBeTruthy();
  });

  test('« Voir le sujet » ouvre la discussion signalée et referme le panneau', async () => {
    const adapter = fakeAdapter({ threads: [THREAD_B, THREAD_A] });
    adapter.listReports.mockResolvedValue({ items: [REPORT], total: 1 });
    renderView(adapter, { canModerate: true });

    fireEvent.click(await screen.findByRole('button', { name: 'Signalements (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Voir le sujet' }));
    await waitFor(() => expect(adapter.getThread).toHaveBeenCalledWith('a', expect.anything()));
    expect(screen.queryByRole('region', { name: /Signalements à traiter/ })).toBeNull();
  });
});
