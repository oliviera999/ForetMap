// @vitest-environment jsdom
import { describe, test, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useTimedToastState,
  TIMED_TOAST_SHORT_MS,
} from '../../src/shared/hooks/useTimedToastState.js';
import { useGlToasts, GL_TOAST_SHORT_MS } from '../../src/gl/hooks/useGlToasts.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('useTimedToastState (kit partagé)', () => {
  test('le toast s’efface seul après la durée, et une nouvelle valeur relance la minuterie', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTimedToastState(1000));
    act(() => result.current[1]({ text: 'a' }));
    expect(result.current[0]).toEqual({ text: 'a' });
    act(() => vi.advanceTimersByTime(700));
    act(() => result.current[1]({ text: 'b' }));
    act(() => vi.advanceTimersByTime(700));
    expect(result.current[0]).toEqual({ text: 'b' });
    act(() => vi.advanceTimersByTime(400));
    expect(result.current[0]).toBeNull();
  });

  test('useGlToasts s’appuie sur le hook partagé (durées alias)', () => {
    expect(GL_TOAST_SHORT_MS).toBe(TIMED_TOAST_SHORT_MS);
    vi.useFakeTimers();
    const { result } = renderHook(() => useGlToasts());
    act(() => result.current.setTurnToast({ teamId: 1 }));
    expect(result.current.turnToast).toEqual({ teamId: 1 });
    act(() => vi.advanceTimersByTime(GL_TOAST_SHORT_MS + 10));
    expect(result.current.turnToast).toBeNull();
  });
});
