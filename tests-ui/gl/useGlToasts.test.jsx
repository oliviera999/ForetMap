import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  GL_TOAST_LONG_MS,
  GL_TOAST_SHORT_MS,
  useGlToasts,
  useTimedToastState,
} from '../../src/gl/hooks/useGlToasts.js';

describe('useTimedToastState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('démarre à null et expose un setter', () => {
    const { result } = renderHook(() => useTimedToastState(4000));
    expect(result.current[0]).toBeNull();
    expect(typeof result.current[1]).toBe('function');
  });

  it('efface automatiquement le toast après la durée demandée', () => {
    const { result } = renderHook(() => useTimedToastState(4000));
    act(() => {
      result.current[1]({ text: 'coucou', ts: 1 });
    });
    expect(result.current[0]).toEqual({ text: 'coucou', ts: 1 });
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(result.current[0]).toEqual({ text: 'coucou', ts: 1 });
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current[0]).toBeNull();
  });

  it('réarme le timer quand une nouvelle valeur remplace la précédente', () => {
    const { result } = renderHook(() => useTimedToastState(4000));
    act(() => {
      result.current[1]({ ts: 1 });
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      result.current[1]({ ts: 2 });
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    // 6 s après le premier toast, mais 3 s seulement après le second : toujours visible.
    expect(result.current[0]).toEqual({ ts: 2 });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current[0]).toBeNull();
  });

  it('ne programme aucun timer pour une valeur falsy et nettoie au démontage', () => {
    const { result, unmount } = renderHook(() => useTimedToastState(4000));
    act(() => {
      result.current[1](null);
    });
    expect(vi.getTimerCount()).toBe(0);
    act(() => {
      result.current[1]({ ts: 1 });
    });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useGlToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expose les 4 toasts à null par défaut avec leurs setters', () => {
    const { result } = renderHook(() => useGlToasts());
    expect(result.current.narrationToast).toBeNull();
    expect(result.current.turnToast).toBeNull();
    expect(result.current.roundToast).toBeNull();
    expect(result.current.spellRejectedToast).toBeNull();
    expect(typeof result.current.setNarrationToast).toBe('function');
    expect(typeof result.current.setTurnToast).toBe('function');
    expect(typeof result.current.setRoundToast).toBe('function');
    expect(typeof result.current.setSpellRejectedToast).toBe('function');
  });

  it('applique les durées historiques : 6 s (narration, sort refusé) et 4 s (tour, round)', () => {
    expect(GL_TOAST_LONG_MS).toBe(6000);
    expect(GL_TOAST_SHORT_MS).toBe(4000);
    const { result } = renderHook(() => useGlToasts());
    act(() => {
      result.current.setNarrationToast({ text: 'n', ts: 1 });
      result.current.setTurnToast({ teamId: 2, ts: 1 });
      result.current.setRoundToast({ roundNumber: 3, ts: 1 });
      result.current.setSpellRejectedToast({ spellName: 's', ts: 1 });
    });
    act(() => {
      vi.advanceTimersByTime(GL_TOAST_SHORT_MS);
    });
    // À 4 s : les toasts courts sont effacés, les longs restent visibles.
    expect(result.current.turnToast).toBeNull();
    expect(result.current.roundToast).toBeNull();
    expect(result.current.narrationToast).toEqual({ text: 'n', ts: 1 });
    expect(result.current.spellRejectedToast).toEqual({ spellName: 's', ts: 1 });
    act(() => {
      vi.advanceTimersByTime(GL_TOAST_LONG_MS - GL_TOAST_SHORT_MS);
    });
    expect(result.current.narrationToast).toBeNull();
    expect(result.current.spellRejectedToast).toBeNull();
  });

  it('chaque toast est indépendant des autres', () => {
    const { result } = renderHook(() => useGlToasts());
    act(() => {
      result.current.setTurnToast({ teamId: 1, ts: 1 });
    });
    expect(result.current.turnToast).toEqual({ teamId: 1, ts: 1 });
    expect(result.current.narrationToast).toBeNull();
    expect(result.current.roundToast).toBeNull();
    expect(result.current.spellRejectedToast).toBeNull();
    act(() => {
      vi.advanceTimersByTime(GL_TOAST_SHORT_MS);
    });
    expect(result.current.turnToast).toBeNull();
  });
});
