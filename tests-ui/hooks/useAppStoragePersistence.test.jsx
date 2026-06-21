import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAppStoragePersistence } from '../../src/hooks/useAppStoragePersistence';

const TAB_KEY = 'foretmap_active_tab';
const MAP_KEY = 'foretmap_active_map';
const SW_KEY = 'foretmap_sw_updated';

describe('useAppStoragePersistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('mémorise la carte active et l’onglet dans le localStorage', () => {
    const onToast = vi.fn();
    renderHook(() => useAppStoragePersistence({ activeMapId: 'mapA', tab: 'map', onToast }));
    expect(localStorage.getItem(MAP_KEY)).toBe('mapA');
    expect(localStorage.getItem(TAB_KEY)).toBe('map');
  });

  it('met à jour le stockage quand la carte ou l’onglet change', () => {
    const onToast = vi.fn();
    const { rerender } = renderHook(
      ({ activeMapId, tab }) => useAppStoragePersistence({ activeMapId, tab, onToast }),
      { initialProps: { activeMapId: 'mapA', tab: 'map' } },
    );
    rerender({ activeMapId: 'mapB', tab: 'tasks' });
    expect(localStorage.getItem(MAP_KEY)).toBe('mapB');
    expect(localStorage.getItem(TAB_KEY)).toBe('tasks');
  });

  it('consomme le drapeau de mise à jour SW une seule fois et émet le toast', () => {
    sessionStorage.setItem(SW_KEY, '1');
    const onToast = vi.fn();
    const { rerender } = renderHook(() =>
      useAppStoragePersistence({ activeMapId: 'mapA', tab: 'map', onToast }),
    );
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('Nouvelle version installée.');
    expect(sessionStorage.getItem(SW_KEY)).toBeNull();
    // L’effet de montage ne se rejoue pas : pas de second toast au re-rendu.
    rerender();
    expect(onToast).toHaveBeenCalledTimes(1);
  });

  it('n’émet aucun toast sans drapeau SW', () => {
    const onToast = vi.fn();
    renderHook(() => useAppStoragePersistence({ activeMapId: 'mapA', tab: 'map', onToast }));
    expect(onToast).not.toHaveBeenCalled();
  });
});
