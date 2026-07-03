import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../src/components/TutorialReadAcknowledge', () => ({
  fetchTutorialReadIds: vi.fn(),
}));

import { fetchTutorialReadIds } from '../../src/components/TutorialReadAcknowledge';
import { useTutorialReadIds } from '../../src/hooks/useTutorialReadIds.js';

describe('useTutorialReadIds', () => {
  beforeEach(() => {
    fetchTutorialReadIds.mockReset();
    fetchTutorialReadIds.mockResolvedValue([1, 2]);
  });

  it('charge les ids lus au montage et expose un Set', async () => {
    const { result } = renderHook(() => useTutorialReadIds([{ id: 1 }, { id: 2 }]));
    await waitFor(() => expect(result.current.readIds.has(1)).toBe(true));
    expect(result.current.readIds.has(2)).toBe(true);
    expect(result.current.readIds.has(3)).toBe(false);
    expect(fetchTutorialReadIds).toHaveBeenCalledTimes(1);
  });

  it('markRead ajoute localement un id sans refetch', async () => {
    const { result } = renderHook(() => useTutorialReadIds([]));
    await waitFor(() => expect(result.current.readIds.size).toBe(2));
    act(() => result.current.markRead(9));
    expect(result.current.readIds.has(9)).toBe(true);
    expect(fetchTutorialReadIds).toHaveBeenCalledTimes(1);
  });

  it('ne refetch pas quand la référence du tableau change à ids constants (poll global)', async () => {
    const { result, rerender } = renderHook(({ tutorials }) => useTutorialReadIds(tutorials), {
      initialProps: { tutorials: [{ id: 1 }, { id: 2 }] },
    });
    await waitFor(() => expect(result.current.readIds.size).toBe(2));
    rerender({ tutorials: [{ id: 1 }, { id: 2 }] }); // nouvelle référence, mêmes ids
    expect(fetchTutorialReadIds).toHaveBeenCalledTimes(1);
  });

  it('refetch quand l’ensemble des tutoriels change réellement', async () => {
    const { result, rerender } = renderHook(({ tutorials }) => useTutorialReadIds(tutorials), {
      initialProps: { tutorials: [{ id: 1 }] },
    });
    await waitFor(() => expect(result.current.readIds.size).toBe(2));
    rerender({ tutorials: [{ id: 1 }, { id: 3 }] });
    await waitFor(() => expect(fetchTutorialReadIds).toHaveBeenCalledTimes(2));
  });

  it('refetch sur foretmap_session_changed et se désabonne au démontage', async () => {
    const { result, unmount } = renderHook(() => useTutorialReadIds([]));
    await waitFor(() => expect(result.current.readIds.size).toBe(2));
    fetchTutorialReadIds.mockResolvedValue([5]);
    await act(async () => {
      window.dispatchEvent(new Event('foretmap_session_changed'));
    });
    await waitFor(() => expect(result.current.readIds.has(5)).toBe(true));
    expect(fetchTutorialReadIds).toHaveBeenCalledTimes(2);
    unmount();
    window.dispatchEvent(new Event('foretmap_session_changed'));
    expect(fetchTutorialReadIds).toHaveBeenCalledTimes(2);
  });
});
