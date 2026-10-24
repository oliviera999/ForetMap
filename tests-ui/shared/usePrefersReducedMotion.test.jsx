import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  getPrefersReducedMotion,
  subscribePrefersReducedMotion,
  usePrefersReducedMotion,
} from '../../src/shared/hooks/usePrefersReducedMotion.js';

const QUERY = '(prefers-reduced-motion: reduce)';
const originalMatchMedia = window.matchMedia;

/** `matchMedia` dont la requête de mouvement réduit répond `reduced` et émet `change` à la main. */
function installMatchMedia(reduced) {
  const listeners = new Set();
  const mq = {
    matches: reduced,
    media: QUERY,
    addEventListener: vi.fn((type, fn) => listeners.add(fn)),
    removeEventListener: vi.fn((type, fn) => listeners.delete(fn)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn((query) =>
    query === QUERY ? mq : { ...mq, matches: false, media: query },
  );
  return {
    mq,
    listeners,
    change(next) {
      mq.matches = next;
      listeners.forEach((fn) => fn());
    },
  };
}

afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('usePrefersReducedMotion', () => {
  test('un matchMedia remplacé après la première lecture est relu', () => {
    installMatchMedia(false);
    expect(getPrefersReducedMotion()).toBe(false);
    installMatchMedia(true);
    expect(getPrefersReducedMotion()).toBe(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  test('le remplacement détache l’écouteur de l’ancienne requête', () => {
    const first = installMatchMedia(false);
    getPrefersReducedMotion();
    expect(first.listeners.size).toBe(1);
    installMatchMedia(false);
    getPrefersReducedMotion();
    expect(first.mq.removeEventListener).toHaveBeenCalledTimes(1);
    expect(first.listeners.size).toBe(0);
  });

  test('un changement de préférence parvient au hook et aux abonnés', () => {
    const media = installMatchMedia(false);
    const seen = vi.fn();
    const unsubscribe = subscribePrefersReducedMotion(seen);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => media.change(true));
    expect(result.current).toBe(true);
    expect(seen).toHaveBeenLastCalledWith(true);
    unsubscribe();
    act(() => media.change(false));
    expect(seen).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });
});
