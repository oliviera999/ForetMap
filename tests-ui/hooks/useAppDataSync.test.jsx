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

import { api } from '../../src/services/api';
import { useAppDataSync } from '../../src/hooks/useAppDataSync.js';

const MAPS = [{ id: 'm1', name: 'Forêt' }];
const ZONES = [{ id: 'z1', name: 'Zone A' }];
const PLANTS = [{ id: 'p1', name: 'Pommier' }];
const MARKERS = [{ id: 'k1' }];

/** Contexte stable (le hook exige un instantané mémoïsé). */
const CONTEXT = Object.freeze({
  effectiveIsTeacher: true,
  showPublicVisit: false,
  studentAffiliation: null,
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
