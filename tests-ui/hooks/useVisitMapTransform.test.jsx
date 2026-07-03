// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { useRef } from 'react';
import {
  useVisitMapTransform,
  VISIT_MAP_TRANSFORM_COMMIT_DEBOUNCE_MS,
} from '../../src/hooks/useVisitMapTransform.js';

/**
 * Harnais reproduisant l'usage réel (visit-views.jsx) : le rendu écrit
 * `style.transform` depuis l'état commité, le hook pilote la valeur vive.
 */
function Harness({ apiRef, renders }) {
  const worldRef = useRef(null);
  const api = useVisitMapTransform(worldRef);
  apiRef.current = api;
  renders.count += 1;
  const t = api.transform;
  return (
    <div
      ref={worldRef}
      data-testid="world"
      style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}
    />
  );
}

describe('useVisitMapTransform', () => {
  let rafQueue;

  const flushRaf = () => {
    const q = rafQueue.splice(0);
    q.forEach((cb) => {
      if (cb) cb(performance.now());
    });
  };

  const setup = () => {
    const apiRef = { current: null };
    const renders = { count: 0 };
    const view = render(<Harness apiRef={apiRef} renders={renders} />);
    const world = view.getByTestId('world');
    return { apiRef, renders, world, ...view };
  };

  beforeEach(() => {
    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => {
      if (id >= 1 && id <= rafQueue.length) rafQueue[id - 1] = null;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('setLive applique le style sous rAF sans re-render ni changement d’état', () => {
    const { apiRef, renders, world } = setup();
    const rendersBefore = renders.count;

    act(() => {
      apiRef.current.setLive({ x: 10, y: 5, s: 2 });
      apiRef.current.setLive({ x: 12, y: 6, s: 2 });
    });
    // Un seul rAF programmé pour la rafale, dernière valeur appliquée.
    expect(rafQueue.filter(Boolean).length).toBe(1);
    act(() => flushRaf());

    expect(world.style.transform).toBe('translate(12px, 6px) scale(2)');
    expect(apiRef.current.transform).toEqual({ x: 0, y: 0, s: 1 });
    expect(renders.count).toBe(rendersBefore);
  });

  it('commit fige la valeur vive dans l’état React (un seul re-render par geste)', () => {
    const { apiRef, renders, world } = setup();
    act(() => {
      apiRef.current.setLive({ x: -20, y: -8, s: 3 });
      flushRaf();
    });
    const rendersBefore = renders.count;

    act(() => apiRef.current.commit());

    expect(apiRef.current.transform).toEqual({ x: -20, y: -8, s: 3 });
    expect(world.style.transform).toBe('translate(-20px, -8px) scale(3)');
    expect(renders.count).toBe(rendersBefore + 1);
  });

  it('commit(next) force la valeur (ref vive + état + style)', () => {
    const { apiRef, world } = setup();

    act(() => apiRef.current.commit({ x: 0, y: 0, s: 1.5 }));

    expect(apiRef.current.liveRef.current).toEqual({ x: 0, y: 0, s: 1.5 });
    expect(apiRef.current.transform).toEqual({ x: 0, y: 0, s: 1.5 });
    expect(world.style.transform).toBe('translate(0px, 0px) scale(1.5)');
  });

  it('commit sans changement effectif ne re-rend pas (tap sans drag)', () => {
    const { apiRef, renders } = setup();
    const rendersBefore = renders.count;

    act(() => apiRef.current.commit());
    act(() => apiRef.current.commit({ x: 0, y: 0, s: 1 }));

    expect(renders.count).toBe(rendersBefore);
  });

  it('scheduleCommit débounce le commit (molette) et chaque appel repousse l’échéance', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { apiRef } = setup();

    act(() => {
      apiRef.current.setLive({ x: 4, y: 2, s: 2 });
      apiRef.current.scheduleCommit();
    });
    act(() => vi.advanceTimersByTime(VISIT_MAP_TRANSFORM_COMMIT_DEBOUNCE_MS - 1));
    expect(apiRef.current.transform).toEqual({ x: 0, y: 0, s: 1 });

    // Nouvel événement molette avant l'échéance : le commit est repoussé.
    act(() => {
      apiRef.current.setLive({ x: 8, y: 4, s: 2.5 });
      apiRef.current.scheduleCommit();
    });
    act(() => vi.advanceTimersByTime(VISIT_MAP_TRANSFORM_COMMIT_DEBOUNCE_MS - 1));
    expect(apiRef.current.transform).toEqual({ x: 0, y: 0, s: 1 });

    act(() => vi.advanceTimersByTime(1));
    expect(apiRef.current.transform).toEqual({ x: 8, y: 4, s: 2.5 });
  });

  it('un re-render pendant le geste ré-applique la valeur vive (pas de saut visuel)', () => {
    const { apiRef, renders, world, rerender } = setup();
    act(() => {
      apiRef.current.setLive({ x: 30, y: 10, s: 2 });
      flushRaf();
    });
    expect(world.style.transform).toBe('translate(30px, 10px) scale(2)');

    // Re-render externe (ex. bulle mascotte) : React réécrit le style depuis l'état
    // commité (0,0,1), puis le layout effect du hook ré-applique la valeur vive.
    rerender(<Harness apiRef={apiRef} renders={renders} />);
    expect(world.style.transform).toBe('translate(30px, 10px) scale(2)');
  });

  it('unmount : annule le rAF en attente et le commit débouncé sans erreur', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { apiRef, unmount } = setup();
    act(() => {
      apiRef.current.setLive({ x: 1, y: 1, s: 2 });
      apiRef.current.scheduleCommit();
    });

    unmount();

    expect(() => {
      flushRaf();
      vi.runAllTimers();
    }).not.toThrow();
  });
});
