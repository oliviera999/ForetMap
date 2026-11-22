// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

import { useFoodWebSelection } from '../../src/hooks/useFoodWebSelection.js';

/** Chantier collège du 22/11/2026, lot 2 : hook de sélection (remplace l'espèce de départ). */

const ITEMS = [
  {
    id: 1,
    interaction_type: 'predation',
    from_id: 1,
    from_name: 'Renard',
    to_id: 2,
    to_name: 'Lapin',
  },
  {
    id: 2,
    interaction_type: 'herbivorie',
    from_id: 2,
    from_name: 'Lapin',
    to_id: 3,
    to_name: 'Trèfle',
  },
];

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockResolvedValue({ species: [{ plant_id: 3, is_featured: true }] });
  window.sessionStorage.clear();
});

function setup(props = {}) {
  return renderHook((p) => useFoodWebSelection(p), {
    initialProps: { enabled: true, mapId: 'foret', requested: [], profileItems: ITEMS, ...props },
  });
}

describe('useFoodWebSelection', () => {
  it('ajouter, retirer, tout retirer ; profondeur par défaut', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.featured.map((c) => c.id)).toEqual([3]));
    expect(apiMock).toHaveBeenCalledWith('/api/maps/foret/species');
    act(() => result.current.toggle(1));
    expect(result.current.selection).toEqual([1]);
    expect(result.current.depth).toBe(1);
    act(() => result.current.add(2));
    expect(result.current.selection).toEqual([1, 2]);
    expect(result.current.depth).toBe(0);
    act(() => result.current.setDepth(2));
    expect(result.current.depth).toBe(2);
    act(() => result.current.remove(1));
    expect(result.current.selection).toEqual([2]);
    act(() => result.current.clear());
    expect(result.current.selection).toEqual([]);
  });

  it('demande extérieure : pré-remplie, puis modifiable', () => {
    const { result } = setup({ requested: [2], requestKey: 'a' });
    expect(result.current.selection).toEqual([2]);
    act(() => result.current.toggle(3));
    expect(result.current.selection).toEqual([2, 3]);
  });

  it('conservée au changement de carte, mémorisée par carte', () => {
    const { result, rerender } = setup();
    act(() => result.current.add(1));
    rerender({ enabled: true, mapId: 'n3', requested: [], profileItems: ITEMS });
    expect(result.current.selection).toEqual([1]);
    expect(window.sessionStorage.getItem('foretmap.foodweb.selection.n3')).toBe('[1]');
  });

  it('relit la mémoire de session de la carte au montage', () => {
    window.sessionStorage.setItem('foretmap.foodweb.selection.foret', '[2,3]');
    const { result } = setup();
    expect(result.current.selection).toEqual([2, 3]);
  });

  it('désactivé (lycée) : aucun appel, aucun candidat', () => {
    const { result } = setup({ enabled: false });
    expect(apiMock).not.toHaveBeenCalled();
    expect(result.current.candidates).toEqual([]);
  });
});
