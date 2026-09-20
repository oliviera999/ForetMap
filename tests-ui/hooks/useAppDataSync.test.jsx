// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

/**
 * Cycle de rafraîchissement global (`useAppDataSync`) face à une coupure serveur.
 *
 * Ce qui est vérifié ici est un comportement observé en production : une requête de
 * domaine en échec appliquait sa valeur de repli `[]` à l'état — la carte, les tâches
 * et les plantes se vidaient à l'écran le temps d'une coupure, ce que l'utilisateur
 * lit comme une déconnexion. Et comme l'erreur était avalée, le compteur d'échecs
 * restait à zéro : le bandeau « Serveur indisponible » n'apparaissait pas.
 */

vi.mock('../../src/services/api', () => ({
  api: vi.fn(),
  AccountDeletedError: class AccountDeletedError extends Error {
    constructor() {
      super('Compte supprimé');
      this.deleted = true;
    }
  },
}));

import { api, AccountDeletedError } from '../../src/services/api';
import { useAppDataSync } from '../../src/hooks/useAppDataSync.js';

const MAPS = [{ id: 'm1', name: 'Forêt' }];
const ZONES = [{ id: 'z1', name: 'Zone A' }];
const PLANTS = [{ id: 'p1', name: 'Pommier' }];
const MARKERS = [{ id: 'k1' }];

/** Contexte stable (le hook exige un instantané mémoïsé). */
const CONTEXT = Object.freeze({
  effectiveIsTeacher: true,
  showPublicVisit: false,
  canManageTutorials: false,
  defaultMapStudent: '',
  defaultMapTeacher: 'm1',
  defaultMapVisit: '',
});

/** Réponses nominales, par préfixe de chemin. */
function nominalResponse(path) {
  if (path.startsWith('/api/sync-state')) return { bootId: 'boot-1', writes: 1 };
  if (path.startsWith('/api/maps')) return MAPS;
  if (path.startsWith('/api/zones')) return ZONES;
  if (path.startsWith('/api/tasks')) return [];
  if (path.startsWith('/api/task-projects')) return [];
  if (path.startsWith('/api/plants')) return PLANTS;
  if (path.startsWith('/api/map/markers')) return MARKERS;
  if (path.startsWith('/api/tutorials')) return [];
  return [];
}

function mountSync() {
  const studentRef = { current: null };
  return renderHook(() =>
    useAppDataSync({
      context: CONTEXT,
      contextReady: true,
      hasAuthenticatedShell: true,
      studentRef,
      forceLogout: () => {},
      mergeAuthMeResponse: () => {},
    }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem('foretmap_active_map', 'm1');
  api.mockImplementation(async (path) => nominalResponse(path));
  // Le hook journalise les échecs : on ne pollue pas la sortie des tests.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useAppDataSync — coupure serveur', () => {
  it('charge les données nominales au montage', async () => {
    const { result } = mountSync();
    await waitFor(() => expect(result.current.zones).toEqual(ZONES));
    expect(result.current.plants).toEqual(PLANTS);
    expect(result.current.markers).toEqual(MARKERS);
    expect(result.current.serverDown).toBe(false);
  });

  it('un domaine en échec conserve les données déjà affichées (jamais de vidage)', async () => {
    const { result } = mountSync();
    await waitFor(() => expect(result.current.zones).toEqual(ZONES));

    // À partir d'ici, seules les zones tombent : le reste du cycle réussit.
    api.mockImplementation(async (path) => {
      if (path.startsWith('/api/zones')) throw new Error('Erreur serveur (HTTP 503)');
      return nominalResponse(path);
    });
    await act(async () => {
      await result.current.fetchAll();
    });

    expect(result.current.zones).toEqual(ZONES);
    expect(result.current.plants).toEqual(PLANTS);
  });

  it('une panne de /api/maps ne vide pas la carte ni les domaines qui en dépendent', async () => {
    const { result } = mountSync();
    await waitFor(() => expect(result.current.zones).toEqual(ZONES));

    api.mockImplementation(async (path) => {
      if (path.startsWith('/api/maps')) throw new Error('Erreur serveur (HTTP 502)');
      return nominalResponse(path);
    });
    await act(async () => {
      await result.current.fetchAll();
    });

    expect(result.current.maps).toEqual(MAPS);
    expect(result.current.activeMapId).toBe('m1');
    expect(result.current.zones).toEqual(ZONES);
  });

  it('trois cycles en échec lèvent « serveur indisponible » et espacent le polling', async () => {
    const { result } = mountSync();
    await waitFor(() => expect(result.current.zones).toEqual(ZONES));
    expect(result.current.refreshMs).toBe(60000);

    api.mockImplementation(async (path) => {
      if (path.startsWith('/api/sync-state')) throw new Error('injoignable');
      throw new Error('Erreur serveur (HTTP 503)');
    });
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await result.current.fetchAll();
      });
    }

    await waitFor(() => expect(result.current.serverDown).toBe(true));
    expect(result.current.refreshMs).toBe(120000);
    // Les données d'avant la coupure sont toujours là.
    expect(result.current.zones).toEqual(ZONES);
  });

  it('un domaine en 4xx persistant ne lève pas « serveur indisponible » (le serveur répond)', async () => {
    const { result } = mountSync();
    await waitFor(() => expect(result.current.plants).toEqual(PLANTS));

    api.mockImplementation(async (path) => {
      if (path.startsWith('/api/plants')) {
        const err = new Error('Accès refusé (HTTP 403)');
        err.status = 403;
        throw err;
      }
      return nominalResponse(path);
    });
    for (let i = 0; i < 4; i += 1) {
      await act(async () => {
        await result.current.fetchAll();
      });
    }

    expect(result.current.serverDown).toBe(false);
    expect(result.current.refreshMs).toBe(60000);
    // Les plantes d'avant l'échec sont conservées (jamais de vidage).
    expect(result.current.plants).toEqual(PLANTS);
  });

  it('le retour du serveur efface le bandeau et rétablit la cadence nominale', async () => {
    const { result } = mountSync();
    await waitFor(() => expect(result.current.zones).toEqual(ZONES));

    api.mockImplementation(async (path) => {
      if (path.startsWith('/api/sync-state')) throw new Error('injoignable');
      throw new Error('Erreur serveur (HTTP 503)');
    });
    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await result.current.fetchAll();
      });
    }
    await waitFor(() => expect(result.current.serverDown).toBe(true));

    api.mockImplementation(async (path) => nominalResponse(path));
    await act(async () => {
      await result.current.retryServerNow();
    });

    await waitFor(() => expect(result.current.serverDown).toBe(false));
    expect(result.current.refreshMs).toBe(60000);
    expect(result.current.zones).toEqual(ZONES);
  });

  it('un compte supprimé détecté par la sonde /api/sync-state déconnecte la session', async () => {
    const forceLogout = vi.fn();
    const studentRef = { current: null };
    const { result } = renderHook(() =>
      useAppDataSync({
        context: CONTEXT,
        contextReady: true,
        hasAuthenticatedShell: true,
        studentRef,
        forceLogout,
        mergeAuthMeResponse: () => {},
      }),
    );
    await waitFor(() => expect(result.current.zones).toEqual(ZONES));

    // La sonde est le premier appel du cycle : un 401 « compte supprimé » y était traité
    // comme une simple sonde muette, et la session restait ouverte.
    api.mockImplementation(async (path) => {
      if (path.startsWith('/api/sync-state')) throw new AccountDeletedError();
      return nominalResponse(path);
    });
    await act(async () => {
      await result.current.fetchAll();
    });

    expect(forceLogout).toHaveBeenCalled();
  });

  it('un vide légitime (aucune carte active) reste appliqué', async () => {
    window.localStorage.setItem('foretmap_active_map', '');
    api.mockImplementation(async (path) => {
      if (path.startsWith('/api/sync-state')) return { bootId: 'boot-1', writes: 1 };
      if (path.startsWith('/api/maps')) return [];
      return [];
    });
    const { result } = mountSync();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.zones).toEqual([]);
    expect(result.current.serverDown).toBe(false);
  });
});

/**
 * Porte des réglages publics (`contextReady`) avant tout chargement.
 *
 * `fetchAll` résout la carte active à partir des cartes par défaut du contexte. Tant que
 * le premier chargement n'était pas gardé, il tournait avant la réponse de
 * `/api/settings/public`, donc sur les valeurs codées en dur côté front (`'foret'`) :
 * la carte ainsi posée était mémorisée sur l'appareil et le réglage « plan ouvert par
 * défaut » de l'administrateur ne s'appliquait plus jamais.
 */
describe('useAppDataSync — porte des réglages publics', () => {
  /** Contexte « avant réponse » : les défauts codés en dur du front. */
  const CONTEXT_FRONT_DEFAULTS = Object.freeze({
    ...CONTEXT,
    defaultMapTeacher: 'm1',
  });
  /** Contexte « après réponse » : le plan par défaut réglé par l'administrateur. */
  const CONTEXT_FROM_SETTINGS = Object.freeze({
    ...CONTEXT,
    defaultMapTeacher: 'm2',
  });
  const TWO_MAPS = [
    { id: 'm1', name: 'Forêt' },
    { id: 'm2', name: 'N3' },
  ];

  function mountGated(initialProps) {
    const studentRef = { current: null };
    return renderHook(
      ({ context, contextReady }) =>
        useAppDataSync({
          context,
          contextReady,
          hasAuthenticatedShell: true,
          studentRef,
          forceLogout: () => {},
          mergeAuthMeResponse: () => {},
        }),
      { initialProps },
    );
  }

  beforeEach(() => {
    // Aucun plan mémorisé : c'est le cas où le réglage doit décider.
    window.localStorage.clear();
    api.mockImplementation(async (path) =>
      path.startsWith('/api/maps') ? TWO_MAPS : nominalResponse(path),
    );
  });

  it('ne charge rien tant que les réglages publics n’ont pas répondu', async () => {
    mountGated({ context: CONTEXT_FRONT_DEFAULTS, contextReady: false });
    // Au-delà du debounce du cycle automatique (250 ms) : toujours aucune requête.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(api).not.toHaveBeenCalled();
  });

  it('résout la carte sur le réglage administrateur, pas sur le défaut du front', async () => {
    const { result, rerender } = mountGated({
      context: CONTEXT_FRONT_DEFAULTS,
      contextReady: false,
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    // Réponse de /api/settings/public : le contexte devient celui des réglages.
    rerender({ context: CONTEXT_FROM_SETTINGS, contextReady: true });
    await waitFor(() => expect(result.current.activeMapId).toBe('m2'));
    // Et rien n'a été mémorisé sur l'appareil : le réglage reste maître au prochain boot.
    expect(window.localStorage.getItem('foretmap_active_map')).toBeNull();
  });
});
