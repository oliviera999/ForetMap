import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useGLOverlays } from '../../src/gl/hooks/useGLOverlays.js';

describe('useGLOverlays', () => {
  it('expose les deux modales fermées par défaut + leurs setters', () => {
    const { result } = renderHook(() => useGLOverlays());
    expect(result.current.showProfile).toBe(false);
    expect(result.current.showPlayerStats).toBe(false);
    expect(typeof result.current.setShowProfile).toBe('function');
    expect(typeof result.current.setShowPlayerStats).toBe('function');
  });

  it('ouvre puis ferme la modale profil sans impacter les stats', () => {
    const { result } = renderHook(() => useGLOverlays());
    act(() => {
      result.current.setShowProfile(true);
    });
    expect(result.current.showProfile).toBe(true);
    expect(result.current.showPlayerStats).toBe(false);
    act(() => {
      result.current.setShowProfile(false);
    });
    expect(result.current.showProfile).toBe(false);
  });

  it('ouvre puis ferme la modale statistiques sans impacter le profil', () => {
    const { result } = renderHook(() => useGLOverlays());
    act(() => {
      result.current.setShowPlayerStats(true);
    });
    expect(result.current.showPlayerStats).toBe(true);
    expect(result.current.showProfile).toBe(false);
    act(() => {
      result.current.setShowPlayerStats(false);
    });
    expect(result.current.showPlayerStats).toBe(false);
  });

  it('supporte les setters fonctionnels (toggle)', () => {
    const { result } = renderHook(() => useGLOverlays());
    act(() => {
      result.current.setShowProfile((prev) => !prev);
    });
    expect(result.current.showProfile).toBe(true);
  });
});
