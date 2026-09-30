import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGLVirtualDice } from '../../src/gl/hooks/useGLVirtualDice.js';

// Audit sécurité 2026-09-30 (GL4) : en partie, le résultat affiché est celui tiré par le
// serveur (`resolveRoll`), jamais un tirage local envoyé ensuite au serveur.
describe('useGLVirtualDice — tirage serveur', () => {
  it('affiche le résultat renvoyé par resolveRoll', async () => {
    const resolveRoll = vi.fn(async (count) => ({
      values: Array(count).fill(4),
      total: 4 * count,
    }));
    const { result } = renderHook(() =>
      useGLVirtualDice({ prefersReducedMotion: true, resolveRoll }),
    );
    act(() => {
      result.current.startRoll();
    });
    await waitFor(() => expect(result.current.phase).toBe('result'));
    expect(resolveRoll).toHaveBeenCalledWith(result.current.diceCount);
    expect(result.current.lastRoll.values.every((v) => v === 4)).toBe(true);
    expect(result.current.lastRoll.total).toBe(4 * result.current.diceCount);
  });

  it('revient au repos si le serveur refuse le jet', async () => {
    const resolveRoll = vi.fn(async () => null);
    const { result } = renderHook(() =>
      useGLVirtualDice({ prefersReducedMotion: true, resolveRoll }),
    );
    act(() => {
      result.current.startRoll();
    });
    await waitFor(() => expect(resolveRoll).toHaveBeenCalled());
    await waitFor(() => expect(result.current.phase).toBe('idle'));
    expect(result.current.lastRoll).toBeNull();
  });

  it('sans resolveRoll, tire localement (démo)', async () => {
    const { result } = renderHook(() => useGLVirtualDice({ prefersReducedMotion: true }));
    act(() => {
      result.current.startRoll();
    });
    await waitFor(() => expect(result.current.phase).toBe('result'));
    expect(result.current.lastRoll.values.length).toBe(result.current.diceCount);
  });
});
