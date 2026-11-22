// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFoodWebFocus } from '../../src/hooks/useFoodWebFocus.js';

const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }];

describe('useFoodWebFocus (sorti de FoodWebGraph)', () => {
  it('isole l’espèce d’arrivée une fois', () => {
    const { result, rerender } = renderHook((props) => useFoodWebFocus(props), {
      initialProps: { nodes, highlightPlantId: 2 },
    });
    expect([...result.current.focusIds]).toEqual([2]);
    act(() => result.current.clearFocus());
    rerender({ nodes: [...nodes], highlightPlantId: 2 });
    expect(result.current.focusIds.size).toBe(0);
  });

  it('demande de séance : plusieurs espèces à profondeur 0, une fois par nonce', () => {
    const request = { ids: [1, 3, 99], depth: 0, nonce: 5 };
    const { result, rerender } = renderHook((props) => useFoodWebFocus(props), {
      initialProps: { nodes, highlightPlantId: 1, focusRequest: request },
    });
    expect([...result.current.focusIds].sort()).toEqual([1, 3]);
    expect(result.current.focusDepth).toBe(0);
    act(() => result.current.toggleFocus(2));
    rerender({ nodes, highlightPlantId: 1, focusRequest: request });
    expect([...result.current.focusIds]).toEqual([2]);
    rerender({ nodes, highlightPlantId: 1, focusRequest: { ...request, nonce: 6 } });
    expect([...result.current.focusIds].sort()).toEqual([1, 3]);
  });

  it('sélection additive et nœud disparu retiré', () => {
    const { result, rerender } = renderHook((props) => useFoodWebFocus(props), {
      initialProps: { nodes },
    });
    act(() => result.current.toggleFocus(1));
    act(() => result.current.toggleFocus(2, true));
    expect([...result.current.focusIds].sort()).toEqual([1, 2]);
    rerender({ nodes: [{ id: 1 }, { id: 3 }] });
    expect([...result.current.focusIds]).toEqual([1]);
  });
});
