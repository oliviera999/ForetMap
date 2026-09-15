import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLatestRequest } from '../../src/shared/hooks/useLatestRequest.js';

/**
 * Garde anti-course des chargements manuels (audit 2026-09-13 §2.5) : seule la réponse du
 * dernier appel ouvert est « courante » ; un démontage périme tout appel en vol.
 */
describe('useLatestRequest', () => {
  test('le dernier appel ouvert est le seul courant', () => {
    const { result } = renderHook(() => useLatestRequest());
    let first;
    let second;
    act(() => {
      first = result.current();
    });
    expect(first()).toBe(true);
    act(() => {
      second = result.current();
    });
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  test('le démontage périme un appel encore en vol', () => {
    const { result, unmount } = renderHook(() => useLatestRequest());
    let pending;
    act(() => {
      pending = result.current();
    });
    expect(pending()).toBe(true);
    unmount();
    expect(pending()).toBe(false);
  });

  test('la fonction renvoyée est stable entre les rendus', () => {
    const { result, rerender } = renderHook(() => useLatestRequest());
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });
});
