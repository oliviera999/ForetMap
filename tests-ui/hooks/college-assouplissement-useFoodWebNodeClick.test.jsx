// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { nodeActivation, useFoodWebNodeClick } from '../../src/hooks/useFoodWebNodeClick.js';
import { ENV_NODE_ID } from '../../src/components/pedago/foodWebGraphModel.js';

/** Clic de nœud extrait de `FoodWebGraph.jsx` (chantier collège du 22/11/2026, lots 2 et 7). */

describe('nodeActivation', () => {
  it('isoler par défaut, ajouter avec ⌘/Ctrl ; panneau au collège ; environnement inerte', () => {
    expect(nodeActivation('isolate')).toBe('isolate');
    expect(nodeActivation('isolate', { additive: true })).toBe('isolate-add');
    expect(nodeActivation('panel', { additive: true })).toBe('panel');
    expect(nodeActivation('panel', { isEnv: true })).toBe('none');
  });
});

describe('useFoodWebNodeClick', () => {
  it('mode isoler : toggleFocus, sans panneau', () => {
    const toggleFocus = vi.fn();
    const { result } = renderHook(() => useFoodWebNodeClick({ toggleFocus }));
    act(() => result.current.activate(5, { ctrlKey: true }));
    expect(toggleFocus).toHaveBeenCalledWith(5, true);
    expect(result.current.panelNodeId).toBeNull();
  });

  it('mode panneau : ouvre, ferme et rend le focus au nœud', () => {
    const toggleFocus = vi.fn();
    const focusNode = vi.fn();
    const { result } = renderHook(() =>
      useFoodWebNodeClick({ mode: 'panel', toggleFocus, focusNode, nodeIds: [5, ENV_NODE_ID] }),
    );
    act(() => result.current.activate(5));
    expect(result.current.panelNodeId).toBe(5);
    expect(toggleFocus).not.toHaveBeenCalled();
    act(() => result.current.closePanel());
    expect(result.current.panelNodeId).toBeNull();
    expect(focusNode).toHaveBeenCalledWith(5);
    act(() => result.current.activate(ENV_NODE_ID));
    expect(result.current.panelNodeId).toBeNull();
  });

  it('clavier : Entrée active, Maj+Entrée ouvre la fiche (jamais pour l’environnement)', () => {
    const onOpenPlant = vi.fn();
    const { result } = renderHook(() =>
      useFoodWebNodeClick({ mode: 'panel', toggleFocus: vi.fn(), onOpenPlant }),
    );
    const evt = (extra) => ({ key: 'Enter', preventDefault: vi.fn(), ...extra });
    act(() => {
      result.current.onActivateKey(evt({ shiftKey: true }), 7);
    });
    expect(onOpenPlant).toHaveBeenCalledWith(7);
    act(() => {
      result.current.onActivateKey(evt(), 7);
    });
    expect(result.current.panelNodeId).toBe(7);
    expect(result.current.onActivateKey({ key: 'a', preventDefault: vi.fn() }, 7)).toBe(false);
    result.current.openPlant(ENV_NODE_ID);
    expect(onOpenPlant).toHaveBeenCalledTimes(1);
  });

  it('le panneau se ferme si son nœud disparaît', () => {
    const { result, rerender } = renderHook((p) => useFoodWebNodeClick(p), {
      initialProps: { mode: 'panel', toggleFocus: vi.fn(), nodeIds: [5] },
    });
    act(() => result.current.activate(5));
    rerender({ mode: 'panel', toggleFocus: vi.fn(), nodeIds: [6] });
    expect(result.current.panelNodeId).toBeNull();
  });
});
