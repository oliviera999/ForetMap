// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
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

/**
 * Attend qu'une assertion passe en **vidant la file de micro-tâches** à chaque
 * itération, au lieu de scruter sur l'horloge comme `waitFor`.
 *
 * Le flush de la file « vu » est une chaîne de **pures micro-tâches** :
 * `flushVisitSeenQueue` → `api` (mocké, résolu immédiatement) → `setState`.
 * Aucun timer n'y intervient (vérifiable dans `src/utils/visitProgressClient.js`).
 * Une attente sur timers réels y était donc doublement inadaptée : inutile en
 * temps normal, et surtout **expirable** quand la suite Vitest complète (396
 * fichiers en parallèle) prive le worker de CPU — d'où le flake historique de ce
 * fichier, qui échouait en CI malgré des timeouts portés à 10 s.
 *
 * Ici la progression est bornée en **tours de boucle d'événements**, pas en
 * millisecondes : la contention CPU ne peut plus provoquer d'expiration. La
 * dernière erreur d'assertion est relancée telle quelle pour garder un message
 * de diagnostic exploitable.
 *
 * @param {() => void} assertion assertion qui jette tant que la condition est fausse
 * @param {{ maxTicks?: number }} [options] nombre maximum de tours (défaut : 50)
 */
async function settle(assertion, { maxTicks = 50 } = {}) {
  let lastError;
  for (let tick = 0; tick <= maxTicks; tick += 1) {
    try {
      assertion();
      return;
    } catch (err) {
      lastError = err;
    }
    if (tick === maxTicks) break;
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw lastError;
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

    await settle(() => expect(apiRef.current.syncStatus).toBe('synced'));
    expect(apiRef.current.isOnline).toBe(true);
    expect(apiRef.current.pendingSyncCount).toBe(0);
    expect(api).toHaveBeenCalledWith('/api/visit/seen', 'POST', {
      target_type: 'marker',
      target_id: '7',
      seen: true,
    });
  });

  it('fin de chargement en ligne avec file non vide : flush automatique', async () => {
    // L'effet de fin de chargement lance le flush en « fire and forget » : le test
    // n'a pas de prise sur sa promesse. On attend donc via `settle` (drainage de
    // micro-tâches) et non `waitFor` (scrutation sur l'horloge) — cf. le commentaire
    // de `settle` en tête de fichier.
    window.localStorage.setItem(
      VISIT_SEEN_QUEUE_STORAGE_KEY,
      JSON.stringify([{ target_type: 'zone', target_id: 3, seen: true }]),
    );
    const { apiRef, rerenderWith } = renderHarness({ loading: true });
    expect(api).not.toHaveBeenCalled();

    await act(async () => rerenderWith({ loading: false }));

    await settle(() =>
      expect(api).toHaveBeenCalledWith('/api/visit/seen', 'POST', {
        target_type: 'zone',
        target_id: '3',
        seen: true,
      }),
    );
    await settle(() => expect(apiRef.current.pendingSyncCount).toBe(0));
  });
});
