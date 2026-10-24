import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { EXIT_ANIMATION_MS, useExitAnimation } from '../../src/shared/hooks/useExitAnimation.js';

describe('useExitAnimation', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pose « closing » puis ferme au minuteur de secours', () => {
    const close = vi.fn();
    const { result } = renderHook(() => useExitAnimation({ reducedMotion: false }));
    act(() => result.current.runExit(close));
    expect(result.current.closing).toBe(true);
    expect(close).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(EXIT_ANIMATION_MS + 100));
    expect(close).toHaveBeenCalledTimes(1);
    expect(result.current.closing).toBe(false);
  });

  it('ferme dès la fin de l’animation attendue, une seule fois', () => {
    const close = vi.fn();
    const { result } = renderHook(() =>
      useExitAnimation({ reducedMotion: false, animationName: 'fmExitFadeShrink' }),
    );
    act(() => result.current.runExit(close));
    const target = {};
    // Fin d'une autre animation (entrée, enfant) : ignorée.
    act(() =>
      result.current.onAnimationEnd({ target, currentTarget: target, animationName: 'popIn' }),
    );
    act(() => result.current.onAnimationEnd({ target: {}, currentTarget: target }));
    expect(close).not.toHaveBeenCalled();
    act(() =>
      result.current.onAnimationEnd({
        target,
        currentTarget: target,
        animationName: 'fmExitFadeShrink',
      }),
    );
    expect(close).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(EXIT_ANIMATION_MS + 100));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('ignore une seconde demande pendant la fermeture', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result } = renderHook(() => useExitAnimation({ reducedMotion: false }));
    act(() => result.current.runExit(first));
    act(() => result.current.runExit(second));
    act(() => vi.advanceTimersByTime(EXIT_ANIMATION_MS + 100));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('mouvement réduit : ferme tout de suite, sans état intermédiaire', () => {
    const close = vi.fn();
    const { result } = renderHook(() => useExitAnimation({ reducedMotion: true }));
    act(() => result.current.runExit(close));
    expect(close).toHaveBeenCalledTimes(1);
    expect(result.current.closing).toBe(false);
  });

  it('démonté pendant la fermeture : n’appelle plus close', () => {
    const close = vi.fn();
    const { result, unmount } = renderHook(() => useExitAnimation({ reducedMotion: false }));
    act(() => result.current.runExit(close));
    unmount();
    act(() => vi.advanceTimersByTime(EXIT_ANIMATION_MS + 100));
    expect(close).not.toHaveBeenCalled();
  });
});
