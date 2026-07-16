// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import React from 'react';
import { api } from '../../src/services/api';
import { useVisitSeenSync } from '../../src/hooks/useVisitSeenSync.js';
import { VISIT_SEEN_QUEUE_STORAGE_KEY } from '../../src/utils/visitProgressClient.js';

vi.mock('../../src/services/api', () => ({
  api: vi.fn(async () => ({})),
  AccountDeletedError: class AccountDeletedError extends Error {},
  isLikelyNetworkTransportFailure: (err) => String(err?.message || '').includes('Failed to fetch'),
}));

function Harness({ apiRef, ...params }) {
  apiRef.current = useVisitSeenSync(params);
  return null;
}

function renderHarness(overrides = {}) {
  const apiRef = { current: null };
  const props = {
    apiRef,
    onForceLogout: vi.fn(),
    loading: false,
    selected: { id: 7 },
    selectedType: 'marker',
    closeVisitSelection: vi.fn(),
    onMascotSeenCelebration: vi.fn(),
    ...overrides,
  };
  const view = render(<Harness {...props} />);
  const rerenderWith = (next = {}) => view.rerender(<Harness {...props} {...next} />);
  return { apiRef, props, rerenderWith, ...view };
}

let onLineSpy;
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async () => ({}));
  window.localStorage.clear();
  onLineSpy = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
});
afterEach(() => {
  onLineSpy.mockRestore();
});

describe('useVisitSeenSync', () => {
  it('applyServerProgress construit `seen` depuis la progression serveur + rejoue la file locale', async () => {
    window.localStorage.setItem(
      VISIT_SEEN_QUEUE_STORAGE_KEY,
      JSON.stringify([{ target_type: 'marker', target_id: 9, seen: true }]),
    );
    onLineSpy.mockReturnValue(false); // évite le flush automatique de la file pré-remplie
    const { apiRef } = renderHarness();
    expect(apiRef.current.syncStatus).toBe('pending');
    expect(apiRef.current.pendingSyncCount).toBe(1);

    act(() => {
      apiRef.current.applyServerProgress({ seen: [{ target_type: 'zone', target_id: 1 }] });
    });

    expect(apiRef.current.seen.has('zone:1')).toBe(true);
    expect(apiRef.current.seen.has('marker:9')).toBe(true);
  });

  it('onToggleSeen (en ligne) : optimiste + POST /api/visit/seen + célébration mascotte', async () => {
    const { apiRef, props } = renderHarness();

    await act(async () => apiRef.current.onToggleSeen());

    expect(props.closeVisitSelection).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith('/api/visit/seen', 'POST', {
      target_type: 'marker',
      target_id: 7,
      seen: true,
    });
    expect(apiRef.current.seen.has('marker:7')).toBe(true);
    expect(props.onMascotSeenCelebration).toHaveBeenCalledTimes(1);
    expect(apiRef.current.syncStatus).toBe('idle');
  });

  it('onToggleSeen hors ligne : file locale (pending) sans appel API, célébration conservée', async () => {
    onLineSpy.mockReturnValue(false);
    const { apiRef, props } = renderHarness();

    await act(async () => apiRef.current.onToggleSeen());

    expect(api).not.toHaveBeenCalled();
    expect(apiRef.current.seen.has('marker:7')).toBe(true);
    expect(apiRef.current.pendingSyncCount).toBe(1);
    expect(apiRef.current.syncStatus).toBe('pending');
    expect(props.onMascotSeenCelebration).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(VISIT_SEEN_QUEUE_STORAGE_KEY))).toEqual([
      expect.objectContaining({ target_type: 'marker', target_id: '7', seen: true }),
    ]);
  });

  it('onToggleSeen : erreur API non réseau → alert + rollback de l’état optimiste', async () => {
    api.mockRejectedValueOnce(new Error('interdit'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { apiRef, props } = renderHarness();

    await act(async () => apiRef.current.onToggleSeen());

    expect(alertSpy).toHaveBeenCalledWith('interdit');
    expect(apiRef.current.seen.has('marker:7')).toBe(false);
    expect(props.onMascotSeenCelebration).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('retour en ligne : l’événement `online` déclenche le flush de la file', async () => {
    onLineSpy.mockReturnValue(false);
    const { apiRef } = renderHarness();
    await act(async () => apiRef.current.onToggleSeen());
    expect(apiRef.current.isOnline).toBe(false);

    onLineSpy.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(apiRef.current.syncStatus).toBe('synced'));
    expect(apiRef.current.isOnline).toBe(true);
    expect(apiRef.current.pendingSyncCount).toBe(0);
    expect(api).toHaveBeenCalledWith('/api/visit/seen', 'POST', {
      target_type: 'marker',
      target_id: '7',
      seen: true,
    });
  });

  it('fin de chargement en ligne avec file non vide : flush automatique', async () => {
    // La purge de la file enchaîne plusieurs micro/macro-tâches (POST + setState).
    // Sous la suite Vitest complète (30+ fichiers en parallèle), la contention CPU
    // starve la boucle d'événements et le flush dépasse parfois les timeouts par
    // défaut de `waitFor` → flake observé (le test passe en <2 s en isolation).
    // Les deux `waitFor` reçoivent donc un timeout généreux, dans le budget du test.
    window.localStorage.setItem(
      VISIT_SEEN_QUEUE_STORAGE_KEY,
      JSON.stringify([{ target_type: 'zone', target_id: 3, seen: true }]),
    );
    const { apiRef, rerenderWith } = renderHarness({ loading: true });
    expect(api).not.toHaveBeenCalled();

    await act(async () => rerenderWith({ loading: false }));

    await waitFor(
      () =>
        expect(api).toHaveBeenCalledWith('/api/visit/seen', 'POST', {
          target_type: 'zone',
          target_id: '3',
          seen: true,
        }),
      { timeout: 10000 },
    );
    await waitFor(() => expect(apiRef.current.pendingSyncCount).toBe(0), { timeout: 10000 });
  }, 25000);
});
