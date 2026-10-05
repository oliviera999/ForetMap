import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(),
}));

import { api } from '../../src/services/api';
import { useForumUnread } from '../../src/hooks/useForumUnread.js';
import {
  forumReadCursorKey,
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

const P1 = { id: 'p-1', at: '2026-09-24T10:00:00.000Z' };
const P2 = { id: 'p-2', at: '2026-09-24T11:00:00.000Z' };
const serverMarker = (m) => ({ latest_post_id: m.id, latest_post_at: m.at });

describe('forumUnread (module pur)', () => {
  beforeEach(() => localStorage.clear());

  it('sans message rien ; sans curseur non lu ; même message lu', () => {
    expect(hasUnreadForumPosts('', '')).toBe(false);
    expect(hasUnreadForumPosts(null, P1)).toBe(false);
    expect(hasUnreadForumPosts(P1, '')).toBe(true);
    expect(hasUnreadForumPosts(P1, P1)).toBe(false);
    expect(hasUnreadForumPosts(serverMarker(P1), { id: 'p-1', at: '' })).toBe(false);
  });

  it('compare par date : seul un message plus récent que le curseur est non lu', () => {
    expect(hasUnreadForumPosts(P2, P1)).toBe(true);
    // Le dernier message a été supprimé : le serveur désigne le précédent, déjà vu.
    expect(hasUnreadForumPosts(P1, P2)).toBe(false);
  });

  it('ancien curseur (identifiant seul) : non lu dès que l’identifiant diffère', () => {
    expect(hasUnreadForumPosts(P2, 'p-1')).toBe(true);
    expect(hasUnreadForumPosts(P1, 'p-1')).toBe(false);
  });

  it('curseur propre à chaque utilisateur, ancien format relu', () => {
    writeForumReadCursor('student', 'u-1', P1);
    expect(readForumReadCursor('student', 'u-1')).toEqual(P1);
    expect(readForumReadCursor('student', 'u-2').id).toBe('');
    expect(readForumReadCursor('', 'u-1').id).toBe('');
    localStorage.setItem(forumReadCursorKey('student', 'u-3'), JSON.stringify('p-9'));
    expect(readForumReadCursor('student', 'u-3')).toEqual({ id: 'p-9', at: '' });
  });
});

describe('useForumUnread', () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
    api.mockResolvedValue(serverMarker(P1));
  });

  it('première consultation sur l’appareil : l’existant compte comme lu', async () => {
    const { result } = renderHook(() => useForumUnread(baseParams));
    await waitFor(() => expect(readForumReadCursor('student', 'u-1')).toEqual(P1));
    expect(api).toHaveBeenCalledWith('/api/forum/unread-marker');
    expect(result.current.hasUnread).toBe(false);
  });

  it('allume le point pour un message plus récent que le curseur', async () => {
    writeForumReadCursor('student', 'u-1', P1);
    api.mockResolvedValue(serverMarker(P2));
    const { result } = renderHook(() => useForumUnread(baseParams));
    await waitFor(() => expect(result.current.hasUnread).toBe(true));
  });

  it('suppression du dernier message : le point ne se rallume pas', async () => {
    writeForumReadCursor('student', 'u-1', P2);
    const { result } = renderHook(() => useForumUnread(baseParams));
    await waitFor(() => expect(api).toHaveBeenCalled());
    await act(async () => {});
    expect(result.current.hasUnread).toBe(false);
  });

  it('ouvrir le forum relève le marqueur, marque lu et persiste le curseur', async () => {
    writeForumReadCursor('student', 'u-1', P1);
    api.mockResolvedValue(serverMarker(P2));
    const { result, rerender } = renderHook((props) => useForumUnread(props), {
      initialProps: baseParams,
    });
    await waitFor(() => expect(result.current.hasUnread).toBe(true));
    const callsBefore = api.mock.calls.length;
    rerender({ ...baseParams, isForumOpen: true });
    await waitFor(() => expect(readForumReadCursor('student', 'u-1')).toEqual(P2));
    expect(api.mock.calls.length).toBeGreaterThan(callsBefore);
    rerender(baseParams);
    expect(result.current.hasUnread).toBe(false);
  });

  it('lecture faite dans un autre onglet : le point s’éteint', async () => {
    writeForumReadCursor('student', 'u-1', P1);
    api.mockResolvedValue(serverMarker(P2));
    const { result } = renderHook(() => useForumUnread(baseParams));
    await waitFor(() => expect(result.current.hasUnread).toBe(true));
    const key = forumReadCursorKey('student', 'u-1');
    localStorage.setItem(key, JSON.stringify(P2));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key }));
    });
    expect(result.current.hasUnread).toBe(false);
  });

  it('changement de compte : nouvelle relève pour le nouveau compte', async () => {
    writeForumReadCursor('student', 'u-1', P1);
    writeForumReadCursor('student', 'u-2', P1);
    const { result, rerender } = renderHook((props) => useForumUnread(props), {
      initialProps: baseParams,
    });
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    api.mockResolvedValue(serverMarker(P2));
    rerender({ ...baseParams, userId: 'u-2' });
    await waitFor(() => expect(result.current.hasUnread).toBe(true));
    expect(api).toHaveBeenCalledTimes(2);
  });

  it('module désactivé : aucun appel, aucun point', () => {
    const { result } = renderHook(() => useForumUnread({ ...baseParams, enabled: false }));
    expect(api).not.toHaveBeenCalled();
    expect(result.current.hasUnread).toBe(false);
  });
});
