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

  it('mémorise l’onglet courant dans le localStorage', () => {
    const onToast = vi.fn();
    renderHook(() => useAppStoragePersistence({ tab: 'map', onToast }));
    expect(localStorage.getItem(TAB_KEY)).toBe('map');
  });

  it('met à jour le stockage quand l’onglet change', () => {
    const onToast = vi.fn();
    const { rerender } = renderHook(({ tab }) => useAppStoragePersistence({ tab, onToast }), {
      initialProps: { tab: 'map' },
    });
    rerender({ tab: 'tasks' });
    expect(localStorage.getItem(TAB_KEY)).toBe('tasks');
  });

  /**
   * Régression : ce hook mémorisait aussi `activeMapId`, y compris les plans posés par
   * la résolution automatique (carte par défaut des réglages, repli sur le premier plan
   * visible). Le plan ainsi figé sur l'appareil neutralisait ensuite définitivement le
   * réglage « plan ouvert par défaut ». La mémoire n'est plus écrite que sur choix
   * explicite (`rememberLastViewedMapId`).
   */
  it('n’écrit jamais la carte active', () => {
    const onToast = vi.fn();
    const { rerender } = renderHook(({ tab }) => useAppStoragePersistence({ tab, onToast }), {
      initialProps: { tab: 'map' },
    });
    rerender({ tab: 'tasks' });
    expect(localStorage.getItem(MAP_KEY)).toBeNull();
  });

  it('consomme le drapeau de mise à jour SW une seule fois et émet le toast', () => {
    sessionStorage.setItem(SW_KEY, '1');
    const onToast = vi.fn();
    const { rerender } = renderHook(() => useAppStoragePersistence({ tab: 'map', onToast }));
    expect(onToast).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith('Nouvelle version installée.');
    expect(sessionStorage.getItem(SW_KEY)).toBeNull();
    // L’effet de montage ne se rejoue pas : pas de second toast au re-rendu.
    rerender();
    expect(onToast).toHaveBeenCalledTimes(1);
  });

  it('n’émet aucun toast sans drapeau SW', () => {
    const onToast = vi.fn();
    renderHook(() => useAppStoragePersistence({ tab: 'map', onToast }));
    expect(onToast).not.toHaveBeenCalled();
  });
});
