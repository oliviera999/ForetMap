import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(),
}));

import { api } from '../../src/services/api';
import { useForumUnread } from '../../src/hooks/useForumUnread.js';
import {
  hasUnreadForumPosts,
  readForumReadCursor,
  writeForumReadCursor,
} from '../../src/utils/forumUnread.js';

const baseParams = {
  enabled: true,
  userType: 'student',
  userId: 'u-1',
  isForumOpen: false,
  rtStatus: 'live',
  isTabVisible: true,
};

describe('forumUnread (module pur)', () => {
  beforeEach(() => localStorage.clear());

  it('compare par égalité ; sans message rien ; sans curseur non lu', () => {
    expect(hasUnreadForumPosts('', '')).toBe(false);
    expect(hasUnreadForumPosts(null, 'abc')).toBe(false);
    expect(hasUnreadForumPosts('abc', '')).toBe(true);
    expect(hasUnreadForumPosts('abc', 'abc')).toBe(false);
    expect(hasUnreadForumPosts('def', 'abc')).toBe(true);
  });

  it('curseur propre à chaque utilisateur', () => {
    writeForumReadCursor('student', 'u-1', 'p-9');
    expect(readForumReadCursor('student', 'u-1')).toBe('p-9');
    expect(readForumReadCursor('student', 'u-2')).toBe('');
    expect(readForumReadCursor('', 'u-1')).toBe('');
  });
});

describe('useForumUnread', () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
    api.mockResolvedValue({ latest_post_id: 'p-1', latest_post_at: '2026-09-24T10:00:00.000Z' });
  });

  it('allume le point quand un message d’autrui n’a jamais été vu', async () => {
    const { result } = renderHook(() => useForumUnread(baseParams));
    await waitFor(() => expect(result.current.hasUnread).toBe(true));
    expect(api).toHaveBeenCalledWith('/api/forum/unread-marker');
  });

  it('éteint le point si le curseur correspond déjà au dernier message', async () => {
    writeForumReadCursor('student', 'u-1', 'p-1');
    const { result } = renderHook(() => useForumUnread(baseParams));
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(result.current.hasUnread).toBe(false);
  });

  it('ouvrir le forum marque comme lu et persiste le curseur', async () => {
    const { result, rerender } = renderHook((props) => useForumUnread(props), {
      initialProps: baseParams,
    });
    await waitFor(() => expect(result.current.hasUnread).toBe(true));
    rerender({ ...baseParams, isForumOpen: true });
    await waitFor(() => expect(readForumReadCursor('student', 'u-1')).toBe('p-1'));
    rerender(baseParams);
    expect(result.current.hasUnread).toBe(false);
  });

  it('module désactivé : aucun appel, aucun point', () => {
    const { result } = renderHook(() => useForumUnread({ ...baseParams, enabled: false }));
    expect(api).not.toHaveBeenCalled();
    expect(result.current.hasUnread).toBe(false);
  });
});
