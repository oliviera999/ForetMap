import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useMascotPackAssets } from '../../src/components/mascot/useMascotPackAssets.js';
import { api, AccountDeletedError } from '../../src/services/api';

vi.mock('../../src/services/api', () => {
  class MockAccountDeletedError extends Error {}
  return { api: vi.fn(), AccountDeletedError: MockAccountDeletedError };
});

const PACK_UUID = '123e4567-e89b-42d3-a456-426614174000';

afterEach(() => {
  vi.clearAllMocks();
});

function setup(overrides = {}) {
  return renderHook(() =>
    useMascotPackAssets({ mapId: 'foret', selectedId: PACK_UUID, ...overrides }),
  );
}

describe('useMascotPackAssets', () => {
  it('charge les trois sources (bibliothèque carte, assets site, médiathèque pack)', async () => {
    api.mockResolvedValueOnce({ assets: [{ filename: 'lib.png' }] });
    api.mockResolvedValueOnce({ assets: [{ url: '/global.png' }] });
    api.mockResolvedValueOnce({ assets: [{ filename: 'pack.png' }] });
    const { result } = setup();

    await act(async () => {
      await result.current.loadLibrary();
      await result.current.loadGlobalAssets();
      await result.current.loadPackAssets();
    });

    expect(api).toHaveBeenNthCalledWith(1, '/api/visit/mascot-sprite-library/foret/assets');
    expect(api).toHaveBeenNthCalledWith(2, '/api/visit/mascot-assets');
    expect(api).toHaveBeenNthCalledWith(3, `/api/visit/mascot-packs/${PACK_UUID}/assets`);
    expect(result.current.libAssets).toEqual([{ filename: 'lib.png' }]);
    expect(result.current.globalAssets).toEqual([{ url: '/global.png' }]);
    expect(result.current.packAssets).toEqual([{ filename: 'pack.png' }]);
    expect(result.current.libLoading).toBe(false);
    expect(result.current.packAssetsLoading).toBe(false);
    expect(result.current.libMessage).toBe('');
  });

  it('erreur réseau → message dédié par source et liste vidée', async () => {
    api.mockRejectedValueOnce(new Error('boom lib'));
    api.mockRejectedValueOnce(new Error(''));
    const { result } = setup();

    await act(async () => {
      await result.current.loadLibrary();
      await result.current.loadGlobalAssets();
    });

    expect(result.current.libMessage).toBe('boom lib');
    expect(result.current.libAssets).toEqual([]);
    // Message de repli quand l'erreur n'a pas de message.
    expect(result.current.globalAssetsMessage).toBe('Impossible de charger les assets globaux');
    expect(result.current.libLoading).toBe(false);
  });

  it('AccountDeletedError → onForceLogout, sans message d’erreur', async () => {
    const onForceLogout = vi.fn();
    api.mockRejectedValueOnce(new AccountDeletedError('deleted'));
    const { result } = setup({ onForceLogout });

    await act(async () => {
      await result.current.loadPackAssets();
    });

    expect(onForceLogout).toHaveBeenCalledTimes(1);
    expect(result.current.packAssetsMessage).toBe('');
    expect(result.current.packAssets).toEqual([]);
  });

  it('loadPackAssets sans UUID valide → vide la liste sans appel réseau', async () => {
    const { result } = setup({ selectedId: 'pas-un-uuid' });
    await act(async () => {
      await result.current.loadPackAssets();
    });
    expect(api).not.toHaveBeenCalled();
    expect(result.current.packAssets).toEqual([]);
  });

  it('loadLibrary sans mapId → aucun appel réseau', async () => {
    const { result } = setup({ mapId: '  ' });
    await act(async () => {
      await result.current.loadLibrary();
    });
    expect(api).not.toHaveBeenCalled();
  });

  it('reloadAllImages recharge les trois sources', async () => {
    api.mockResolvedValue({ assets: [] });
    const { result } = setup();
    await act(async () => {
      result.current.reloadAllImages();
    });
    const urls = api.mock.calls.map((c) => c[0]).sort();
    expect(urls).toEqual(
      [
        '/api/visit/mascot-assets',
        `/api/visit/mascot-packs/${PACK_UUID}/assets`,
        '/api/visit/mascot-sprite-library/foret/assets',
      ].sort(),
    );
  });

  it('suppressions silencieuses : URLs et garde-fous', async () => {
    api.mockResolvedValue({});
    const { result } = setup();
    await act(async () => {
      await result.current.deletePackAssetSilent('a.png');
      await result.current.deleteMapAssetSilent('b.png');
      await result.current.deletePublicAssetSilent('/uploads/c.png');
      await result.current.deletePublicAssetSilent('   ');
    });
    expect(api).toHaveBeenCalledTimes(3);
    expect(api).toHaveBeenNthCalledWith(
      1,
      `/api/visit/mascot-packs/${PACK_UUID}/assets/a.png`,
      'DELETE',
    );
    expect(api).toHaveBeenNthCalledWith(
      2,
      '/api/visit/mascot-sprite-library/foret/assets/b.png',
      'DELETE',
    );
    expect(api).toHaveBeenNthCalledWith(3, '/api/visit/mascot-assets/public', 'DELETE', {
      url: '/uploads/c.png',
    });
  });
});
