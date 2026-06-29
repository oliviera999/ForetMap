// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMascotTransientState } from '../../src/hooks/useMascotTransientState.js';

function setup(cfg = {}) {
  const states = new Map();
  const calls = [];
  const props = {
    setTransient: (key, wanted) => {
      states.set(key, wanted);
      calls.push(['set', key, wanted]);
    },
    clearTransient: (key) => {
      states.set(key, '');
      calls.push(['clear', key]);
    },
    ...cfg,
  };
  const view = renderHook((p) => useMascotTransientState(p), { initialProps: props });
  return { ...view, states, calls };
}

describe('useMascotTransientState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('joue l’état transitoire puis le remet à vide après la durée', () => {
    const { result, states } = setup({ defaultDurationMs: 1000 });
    act(() => result.current.trigger('k', 'wave'));
    expect(states.get('k')).toBe('wave');
    act(() => vi.advanceTimersByTime(999));
    expect(states.get('k')).toBe('wave');
    act(() => vi.advanceTimersByTime(1));
    expect(states.get('k')).toBe('');
  });

  it('garde anti-idle : ignore un état vide ou égal à idleState', () => {
    const { result, calls } = setup({ idleState: 'idle' });
    act(() => result.current.trigger('k', ''));
    act(() => result.current.trigger('k', 'idle'));
    act(() => result.current.trigger('k', '   '));
    expect(calls).toEqual([]);
  });

  it('applique resolveState et idleState personnalisés', () => {
    const { result, states } = setup({
      resolveState: (s) => (s === 'x' ? 'mapped' : 'idle'),
      idleState: 'idle',
    });
    act(() => result.current.trigger('k', 'x'));
    expect(states.get('k')).toBe('mapped');
    act(() => result.current.trigger('k2', 'other'));
    expect(states.has('k2')).toBe(false); // résolu en 'idle' → écarté
  });

  it('gère des timers indépendants par clé (arité N)', () => {
    const { result, states } = setup({ defaultDurationMs: 1000 });
    act(() => result.current.trigger(1, 'a'));
    act(() => {
      vi.advanceTimersByTime(500);
      result.current.trigger(2, 'b');
    });
    expect(states.get(1)).toBe('a');
    expect(states.get(2)).toBe('b');
    act(() => vi.advanceTimersByTime(500)); // t=1000 → clé 1 expire
    expect(states.get(1)).toBe('');
    expect(states.get(2)).toBe('b');
    act(() => vi.advanceTimersByTime(500)); // t=1500 → clé 2 expire
    expect(states.get(2)).toBe('');
  });

  it('re-déclencher la même clé annule le timer précédent', () => {
    const { result, states } = setup({ defaultDurationMs: 1000 });
    act(() => result.current.trigger('k', 'a'));
    act(() => {
      vi.advanceTimersByTime(800);
      result.current.trigger('k', 'b');
    });
    expect(states.get('k')).toBe('b');
    act(() => vi.advanceTimersByTime(999)); // timer relancé à t=800 → expire à 1800
    expect(states.get('k')).toBe('b');
    act(() => vi.advanceTimersByTime(1));
    expect(states.get('k')).toBe('');
  });

  it('reset coupe immédiatement le transitoire (et annule le timer)', () => {
    const { result, states } = setup({ defaultDurationMs: 1000 });
    act(() => result.current.trigger('k', 'a'));
    act(() => result.current.reset('k'));
    expect(states.get('k')).toBe('');
    act(() => vi.advanceTimersByTime(2000)); // pas de re-clear après expiration
    expect(states.get('k')).toBe('');
  });

  it('résout la durée : fallback sur valeur falsy, plancher minDurationMs', () => {
    const { result, states } = setup({
      defaultDurationMs: 1000,
      fallbackDurationMs: 1500,
      minDurationMs: 300,
    });
    // durationMs = 0 (falsy) → fallbackDurationMs (1500)
    act(() => result.current.trigger('k', 'a', 0));
    act(() => vi.advanceTimersByTime(1499));
    expect(states.get('k')).toBe('a');
    act(() => vi.advanceTimersByTime(1));
    expect(states.get('k')).toBe('');
    // durationMs < minDurationMs → plancher 300
    act(() => result.current.trigger('k', 'b', 50));
    act(() => vi.advanceTimersByTime(299));
    expect(states.get('k')).toBe('b');
    act(() => vi.advanceTimersByTime(1));
    expect(states.get('k')).toBe('');
  });

  it('identité stable de trigger/reset entre les rendus', () => {
    const { result, rerender } = setup({ defaultDurationMs: 1000 });
    const firstTrigger = result.current.trigger;
    const firstReset = result.current.reset;
    rerender({
      setTransient: () => {},
      clearTransient: () => {},
      defaultDurationMs: 2000,
    });
    expect(result.current.trigger).toBe(firstTrigger);
    expect(result.current.reset).toBe(firstReset);
  });
});
