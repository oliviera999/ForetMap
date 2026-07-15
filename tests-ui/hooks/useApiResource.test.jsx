// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useApiResource } from '../../src/hooks/useApiResource.js';

// On mocke `../services/api` pour fournir une `AccountDeletedError` légère
// (même contrat que la vraie : propriété `deleted: true`) sans tirer toute la
// couche transport, comme le fait le test `useVisitSeenSync`.
vi.mock('../../src/services/api', () => ({
  AccountDeletedError: class AccountDeletedError extends Error {
    constructor() {
      super('Compte supprimé');
      this.deleted = true;
    }
  },
}));

// Import après le mock : récupère la classe mockée pour l'utiliser dans les tests.
import { AccountDeletedError } from '../../src/services/api';

// Petit utilitaire : une promesse dont on contrôle la résolution manuellement,
// pour orchestrer les scénarios d'anti-course.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('useApiResource', () => {
  it('chargement OK : loading vrai puis data renseignée, error null', async () => {
    const fetcher = vi.fn(async () => ({ ok: 1 }));
    const { result } = renderHook(() => useApiResource(fetcher, []));

    // Au montage, le fetch est lancé : loading vrai, pas encore de donnée.
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(null);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ ok: 1 });
    expect(result.current.error).toBe(null);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('erreur : error renseigné, data inchangée, loading retombe', async () => {
    const boom = new Error('boom');
    const fetcher = vi.fn(async () => {
      throw boom;
    });
    const { result } = renderHook(() => useApiResource(fetcher, []));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(boom);
    expect(result.current.data).toBe(null);
  });

  it('changement de deps : relance le fetch et applique la nouvelle donnée', async () => {
    const fetcher = vi.fn(async (id) => ({ id }));
    let dep = 1;
    const { result, rerender } = renderHook(() => useApiResource(() => fetcher(dep), [dep]));

    await waitFor(() => expect(result.current.data).toEqual({ id: 1 }));
    expect(fetcher).toHaveBeenCalledTimes(1);

    dep = 2;
    rerender();

    await waitFor(() => expect(result.current.data).toEqual({ id: 2 }));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('anti-course : une réponse obsolète (deps périmées) est ignorée', async () => {
    const first = deferred();
    const second = deferred();
    let dep = 1;
    // Le fetcher renvoie la promesse contrôlée correspondant à la valeur de dep.
    const fetcher = vi.fn(() => (dep === 1 ? first.promise : second.promise));
    const { result, rerender } = renderHook(() => useApiResource(fetcher, [dep]));

    // Change les deps avant que le 1er fetch ne réponde → nouveau chargement.
    dep = 2;
    rerender();

    // Le 2e (courant) répond d'abord, puis le 1er (obsolète) répond.
    await act(async () => {
      second.resolve({ id: 2 });
      first.resolve({ id: 1 });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // La réponse obsolète { id: 1 } ne doit pas écraser la donnée courante.
    expect(result.current.data).toEqual({ id: 2 });
  });

  it('reload() relance manuellement le fetch', async () => {
    let value = 'a';
    const fetcher = vi.fn(async () => value);
    const { result } = renderHook(() => useApiResource(fetcher, []));

    await waitFor(() => expect(result.current.data).toBe('a'));
    expect(fetcher).toHaveBeenCalledTimes(1);

    value = 'b';
    await act(async () => {
      result.current.reload();
    });

    await waitFor(() => expect(result.current.data).toBe('b'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('compte supprimé (AccountDeletedError) : appelle onForceLogout, pas d’error', async () => {
    const onForceLogout = vi.fn();
    const fetcher = vi.fn(async () => {
      throw new AccountDeletedError();
    });
    const { result } = renderHook(() => useApiResource(fetcher, [], { onForceLogout }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(onForceLogout).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(null);
    expect(result.current.data).toBe(null);
  });

  it('compte supprimé (deleted:true) : appelle aussi onForceLogout', async () => {
    const onForceLogout = vi.fn();
    const err = Object.assign(new Error('supprimé'), { deleted: true });
    const fetcher = vi.fn(async () => {
      throw err;
    });
    const { result } = renderHook(() => useApiResource(fetcher, [], { onForceLogout }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(onForceLogout).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe(null);
  });
});
