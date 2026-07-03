import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useMascotPackBulkImageActions } from '../../src/components/mascot/useMascotPackBulkImageActions.js';
import { api, AccountDeletedError } from '../../src/services/api';
import { fileToPngDataUrl } from '../../src/utils/image.js';

vi.mock('../../src/services/api', () => {
  class MockAccountDeletedError extends Error {}
  return { api: vi.fn(), AccountDeletedError: MockAccountDeletedError };
});

vi.mock('../../src/utils/image.js', () => ({
  fileToPngDataUrl: vi.fn().mockResolvedValue('data:image/png;base64,MOCK'),
}));

const PACK_UUID = '123e4567-e89b-42d3-a456-426614174000';

function buildAssetsMock() {
  return {
    deletePackAssetSilent: vi.fn().mockResolvedValue(undefined),
    deleteMapAssetSilent: vi.fn().mockResolvedValue(undefined),
    deletePublicAssetSilent: vi.fn().mockResolvedValue(undefined),
    loadPackAssets: vi.fn().mockResolvedValue(undefined),
    loadLibrary: vi.fn().mockResolvedValue(undefined),
    loadGlobalAssets: vi.fn().mockResolvedValue(undefined),
    setPackAssetsMessage: vi.fn(),
    setLibMessage: vi.fn(),
    setGlobalAssetsMessage: vi.fn(),
  };
}

function setup(overrides = {}) {
  const assets = overrides.assets || buildAssetsMock();
  const showInsertFeedback = overrides.showInsertFeedback || vi.fn();
  const setEditorPack = overrides.setEditorPack || vi.fn();
  const onForceLogout = overrides.onForceLogout || vi.fn();
  const editorPack = overrides.editorPack || {
    stateFrames: { idle: { files: ['a.png'], fps: 8 } },
  };
  const hook = renderHook(() =>
    useMascotPackBulkImageActions({
      selectedId: PACK_UUID,
      mapId: 'foret',
      editorPack,
      setEditorPack,
      onForceLogout,
      showInsertFeedback,
      assets,
    }),
  );
  return { hook, assets, showInsertFeedback, setEditorPack, onForceLogout };
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useMascotPackBulkImageActions', () => {
  describe('bulkDeleteImages', () => {
    it('route chaque entrée vers la suppression silencieuse de sa portée puis recharge', async () => {
      const { hook, assets, showInsertFeedback } = setup();
      await act(async () => {
        await hook.result.current.bulkDeleteImages([
          { canDelete: true, deleteScope: 'pack', filename: 'p.png' },
          { canDelete: true, deleteScope: 'map', filename: 'm.png' },
          { canDelete: true, deleteScope: 'public', filename: 'g.png', url: '/uploads/g.png' },
          { canDelete: false, deleteScope: 'pack', filename: 'ignore.png' },
        ]);
      });
      expect(assets.deletePackAssetSilent).toHaveBeenCalledWith('p.png');
      expect(assets.deleteMapAssetSilent).toHaveBeenCalledWith('m.png');
      expect(assets.deletePublicAssetSilent).toHaveBeenCalledWith('/uploads/g.png');
      expect(assets.loadPackAssets).toHaveBeenCalledTimes(1);
      expect(assets.loadLibrary).toHaveBeenCalledTimes(1);
      expect(assets.loadGlobalAssets).toHaveBeenCalledTimes(1);
      expect(showInsertFeedback).toHaveBeenCalledWith('3 sprite(s) supprimé(s).', 4000);
      expect(hook.result.current.imageBulkBusy).toBe(false);
    });

    it('avertit dans le confirm quand des fichiers sont encore référencés dans le pack', async () => {
      const { hook } = setup({
        editorPack: { stateFrames: { idle: { files: ['a.png'], fps: 8 } } },
      });
      await act(async () => {
        await hook.result.current.bulkDeleteImages([
          { canDelete: true, deleteScope: 'pack', filename: 'a.png' },
        ]);
      });
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('encore référencés'));
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('a.png'));
    });

    it('confirm refusé → aucune suppression', async () => {
      window.confirm.mockReturnValue(false);
      const { hook, assets } = setup();
      await act(async () => {
        await hook.result.current.bulkDeleteImages([
          { canDelete: true, deleteScope: 'pack', filename: 'p.png' },
        ]);
      });
      expect(assets.deletePackAssetSilent).not.toHaveBeenCalled();
    });

    it('échec partiel → compte les échecs et publie le détail', async () => {
      const assets = buildAssetsMock();
      assets.deletePackAssetSilent.mockRejectedValueOnce(new Error('nope'));
      const { hook, showInsertFeedback } = setup({ assets });
      await act(async () => {
        await hook.result.current.bulkDeleteImages([
          { canDelete: true, deleteScope: 'pack', filename: 'ko.png' },
          { canDelete: true, deleteScope: 'map', filename: 'ok.png' },
        ]);
      });
      expect(showInsertFeedback).toHaveBeenCalledWith('1 supprimé(s), 1 échec(s).', 4000);
      expect(assets.setPackAssetsMessage).toHaveBeenLastCalledWith('ko.png');
    });

    it('AccountDeletedError → onForceLogout et arrêt de la boucle', async () => {
      const assets = buildAssetsMock();
      assets.deletePackAssetSilent.mockRejectedValueOnce(new AccountDeletedError('deleted'));
      const { hook, onForceLogout } = setup({ assets });
      await act(async () => {
        await hook.result.current.bulkDeleteImages([
          { canDelete: true, deleteScope: 'pack', filename: 'a.png' },
          { canDelete: true, deleteScope: 'map', filename: 'b.png' },
        ]);
      });
      expect(onForceLogout).toHaveBeenCalledTimes(1);
      expect(assets.deleteMapAssetSilent).not.toHaveBeenCalled();
    });
  });

  describe('bulkRenameImages', () => {
    it('PATCH par portée et réécrit les références dans les stateFrames du pack', async () => {
      api.mockResolvedValue({});
      const { hook, setEditorPack, showInsertFeedback, assets } = setup({
        editorPack: { stateFrames: { idle: { files: ['a.png', 'z.png'], fps: 8 } } },
      });
      await act(async () => {
        await hook.result.current.bulkRenameImages([
          { entry: { deleteScope: 'pack', filename: 'a.png' }, newFilename: 'b.png' },
          { entry: { deleteScope: 'map', filename: 'm.png' }, newFilename: 'n.png' },
          { entry: { deleteScope: 'public', filename: 'g.png' }, newFilename: 'h.png' },
          { entry: { deleteScope: 'pack', filename: 'same.png' }, newFilename: 'same.png' },
        ]);
      });
      expect(api).toHaveBeenCalledTimes(2);
      expect(api).toHaveBeenNthCalledWith(
        1,
        `/api/visit/mascot-packs/${PACK_UUID}/assets/a.png`,
        'PATCH',
        { new_filename: 'b.png' },
      );
      expect(api).toHaveBeenNthCalledWith(
        2,
        '/api/visit/mascot-sprite-library/foret/assets/m.png',
        'PATCH',
        { new_filename: 'n.png' },
      );
      const nextPack = setEditorPack.mock.calls.at(-1)[0];
      expect(nextPack.stateFrames.idle.files).toEqual(['b.png', 'z.png']);
      expect(assets.loadPackAssets).toHaveBeenCalled();
      expect(assets.loadLibrary).toHaveBeenCalled();
      expect(showInsertFeedback).toHaveBeenLastCalledWith('2 fichier(s) renommé(s).', 4000);
    });

    it('échec d’un PATCH → pack inchangé pour cette entrée et feedback avec échecs', async () => {
      api.mockRejectedValueOnce(new Error('conflit'));
      const { hook, setEditorPack, showInsertFeedback } = setup({
        editorPack: { stateFrames: { idle: { files: ['a.png'], fps: 8 } } },
      });
      await act(async () => {
        await hook.result.current.bulkRenameImages([
          { entry: { deleteScope: 'pack', filename: 'a.png' }, newFilename: 'b.png' },
        ]);
      });
      const nextPack = setEditorPack.mock.calls.at(-1)[0];
      expect(nextPack.stateFrames.idle.files).toEqual(['a.png']);
      expect(showInsertFeedback).toHaveBeenLastCalledWith('0 renommé(s), 1 échec(s).', 4000);
    });
  });

  describe('bulkReplaceImages', () => {
    it('reconvertit chaque fichier en PNG et POSTe sur la bonne portée', async () => {
      api.mockResolvedValue({});
      const { hook, showInsertFeedback, assets } = setup();
      const f1 = new Blob(['1'], { type: 'image/png' });
      const f2 = new Blob(['2'], { type: 'image/png' });
      await act(async () => {
        await hook.result.current.bulkReplaceImages(
          [
            { deleteScope: 'pack', filename: 'p.png' },
            { deleteScope: 'map', filename: 'm.png' },
            { deleteScope: 'public', filename: 'ignore.png' },
          ],
          [f1, f2],
        );
      });
      expect(fileToPngDataUrl).toHaveBeenCalledTimes(2);
      expect(api).toHaveBeenNthCalledWith(
        1,
        `/api/visit/mascot-packs/${PACK_UUID}/assets`,
        'POST',
        {
          filename: 'p.png',
          image_data: 'data:image/png;base64,MOCK',
        },
      );
      expect(api).toHaveBeenNthCalledWith(
        2,
        '/api/visit/mascot-sprite-library/foret/assets',
        'POST',
        { filename: 'm.png', image_data: 'data:image/png;base64,MOCK' },
      );
      expect(assets.loadPackAssets).toHaveBeenCalled();
      expect(assets.loadLibrary).toHaveBeenCalled();
      expect(showInsertFeedback).toHaveBeenCalledWith('2 sprite(s) remplacé(s).', 4000);
    });

    it('confirm refusé ou listes vides → aucun appel', async () => {
      const { hook } = setup();
      await act(async () => {
        await hook.result.current.bulkReplaceImages([], []);
      });
      expect(window.confirm).not.toHaveBeenCalled();
      window.confirm.mockReturnValue(false);
      await act(async () => {
        await hook.result.current.bulkReplaceImages(
          [{ deleteScope: 'pack', filename: 'p.png' }],
          [new Blob(['x'])],
        );
      });
      expect(api).not.toHaveBeenCalled();
    });
  });
});
