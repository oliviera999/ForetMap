import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import useAmbientMascotBehavior from '../../src/hooks/useAmbientMascotBehavior.js';

const entry = {
  customTriggers: [
    {
      key: 'amb',
      label: 'Bâille',
      type: 'periodic',
      state: 'yawn',
      durationMs: 1200,
      everyMs: 5000,
      dialog: ['Hmm...'],
    },
    { key: 'tap', label: 'T', type: 'tap', state: 'dance', durationMs: 900 },
  ],
};

describe('useAmbientMascotBehavior', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('joue le déclencheur périodique à everyMs et affiche la bulle', () => {
    const trigger = vi.fn();
    const showDialog = vi.fn();
    renderHook(() =>
      useAmbientMascotBehavior({ entry, triggerTransientState: trigger, showDialog }),
    );
    expect(trigger).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(trigger).toHaveBeenCalledWith('yawn', 1200);
    expect(showDialog).toHaveBeenCalledWith(['Hmm...']);
    vi.advanceTimersByTime(5000);
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it('désactivé si prefersReducedMotion', () => {
    const trigger = vi.fn();
    renderHook(() =>
      useAmbientMascotBehavior({
        entry,
        triggerTransientState: trigger,
        prefersReducedMotion: true,
      }),
    );
    vi.advanceTimersByTime(20000);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('désactivé si enabled=false', () => {
    const trigger = vi.fn();
    renderHook(() =>
      useAmbientMascotBehavior({ entry, triggerTransientState: trigger, enabled: false }),
    );
    vi.advanceTimersByTime(20000);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('nettoie les intervalles au démontage', () => {
    const trigger = vi.fn();
    const { unmount } = renderHook(() =>
      useAmbientMascotBehavior({ entry, triggerTransientState: trigger }),
    );
    vi.advanceTimersByTime(5000);
    expect(trigger).toHaveBeenCalledTimes(1);
    unmount();
    vi.advanceTimersByTime(20000);
    expect(trigger).toHaveBeenCalledTimes(1);
  });
});
