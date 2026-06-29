import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useGLBoardAmbientBehavior } from '../../src/gl/hooks/useGLBoardAmbientBehavior.js';

const teams = [
  { id: 1, mascot_id: 'srv-a' },
  { id: 2, mascot_id: 'gl-builtin' }, // sans déclencheur
];

const entriesById = {
  'srv-a': {
    customTriggers: [
      { key: 'amb', type: 'periodic', state: 'dance', durationMs: 1000, everyMs: 5000 },
    ],
  },
};

function resolveEntry(team) {
  return entriesById[team.mascot_id] || null;
}

describe('useGLBoardAmbientBehavior', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('joue le déclencheur périodique par équipe (avec teamId)', () => {
    const triggerTransient = vi.fn();
    renderHook(() => useGLBoardAmbientBehavior({ teams, resolveEntry, triggerTransient }));
    expect(triggerTransient).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(triggerTransient).toHaveBeenCalledWith(1, 'dance', 1000);
    // l'équipe 2 (sans déclencheur) ne produit rien
    expect(triggerTransient).toHaveBeenCalledTimes(1);
  });

  it('désactivé si prefersReducedMotion', () => {
    const triggerTransient = vi.fn();
    renderHook(() =>
      useGLBoardAmbientBehavior({
        teams,
        resolveEntry,
        triggerTransient,
        prefersReducedMotion: true,
      }),
    );
    vi.advanceTimersByTime(20000);
    expect(triggerTransient).not.toHaveBeenCalled();
  });

  it('nettoie les intervalles au démontage', () => {
    const triggerTransient = vi.fn();
    const { unmount } = renderHook(() =>
      useGLBoardAmbientBehavior({ teams, resolveEntry, triggerTransient }),
    );
    vi.advanceTimersByTime(5000);
    expect(triggerTransient).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(15000);
    expect(triggerTransient).toHaveBeenCalledTimes(1);
  });
});
