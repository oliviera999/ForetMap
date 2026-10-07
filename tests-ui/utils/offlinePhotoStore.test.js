import { describe, expect, test } from 'vitest';
import {
  OFFLINE_DB_STORES,
  idbGetAll,
  idbPut,
  idbReplaceAll,
  isOfflineDbAvailable,
} from '../../src/utils/offlineDb.js';
import {
  OFFLINE_PHOTOS_PER_ACCOUNT_MAX,
  OFFLINE_PHOTO_MAX_CHARS,
  clearOfflinePhotosForUser,
  deleteOfflinePhoto,
  getOfflinePhoto,
  listOfflinePhotos,
  pruneOrphanOfflinePhotos,
  putOfflinePhoto,
} from '../../src/utils/offlinePhotoStore.js';

const JPEG = 'data:image/jpeg;base64,AAAA';

describe('offlineDb', () => {
  test('IndexedDB disponible (factice) : écriture, lecture, remplacement complet', async () => {
    expect(isOfflineDbAvailable()).toBe(true);
    expect(await idbPut(OFFLINE_DB_STORES.outbox, { id: 'a', n: 1 })).toBe(true);
    expect(await idbPut(OFFLINE_DB_STORES.outbox, { id: 'b', n: 2 })).toBe(true);
    expect((await idbGetAll(OFFLINE_DB_STORES.outbox)).map((e) => e.id).sort()).toEqual(['a', 'b']);
    expect(await idbReplaceAll(OFFLINE_DB_STORES.outbox, [{ id: 'c' }])).toBe(true);
    expect((await idbGetAll(OFFLINE_DB_STORES.outbox)).map((e) => e.id)).toEqual(['c']);
  });

  test('valeur refusée par IndexedDB (sans clé) : faux, sans exception', async () => {
    expect(await idbPut(OFFLINE_DB_STORES.outbox, { pas_de_cle: true })).toBe(false);
  });
});

describe('offlinePhotoStore', () => {
  test('garde, relit et efface une photo', async () => {
    expect(
      await putOfflinePhoto('uuid-1', { userId: 'u1', dataUrl: JPEG, kind: 'task_done' }),
    ).toBe(true);
    expect(await getOfflinePhoto('uuid-1')).toBe(JPEG);
    const [listed] = await listOfflinePhotos('u1');
    expect(listed).toMatchObject({
      key: 'uuid-1',
      user_id: 'u1',
      kind: 'task_done',
      size: JPEG.length,
    });
    expect(await deleteOfflinePhoto('uuid-1')).toBe(true);
    expect(await getOfflinePhoto('uuid-1')).toBeNull();
  });

  test('refuse ce qui n’est pas une image, trop lourd, ou sans compte', async () => {
    expect(await putOfflinePhoto('k', { userId: 'u1', dataUrl: 'data:text/plain;base64,AA' })).toBe(
      false,
    );
    expect(
      await putOfflinePhoto('k', {
        userId: 'u1',
        dataUrl: `data:image/png;base64,${'A'.repeat(OFFLINE_PHOTO_MAX_CHARS)}`,
      }),
    ).toBe(false);
    expect(await putOfflinePhoto('k', { userId: '', dataUrl: JPEG })).toBe(false);
    expect(await putOfflinePhoto('', { userId: 'u1', dataUrl: JPEG })).toBe(false);
  });

  test('borne le nombre de photos par compte (les autres comptes ne comptent pas)', async () => {
    for (let i = 0; i < OFFLINE_PHOTOS_PER_ACCOUNT_MAX; i += 1) {
      expect(await putOfflinePhoto(`k${i}`, { userId: 'u1', dataUrl: JPEG })).toBe(true);
    }
    expect(await putOfflinePhoto('trop', { userId: 'u1', dataUrl: JPEG })).toBe(false);
    // Remplacer une photo existante reste possible.
    expect(await putOfflinePhoto('k0', { userId: 'u1', dataUrl: JPEG })).toBe(true);
    expect(await putOfflinePhoto('autre', { userId: 'u2', dataUrl: JPEG })).toBe(true);
  });

  test('déconnexion : seules les photos du compte partent', async () => {
    await putOfflinePhoto('a', { userId: 'u1', dataUrl: JPEG });
    await putOfflinePhoto('b', { userId: 'u2', dataUrl: JPEG });
    expect(await clearOfflinePhotosForUser('u1')).toBe(1);
    expect((await listOfflinePhotos()).map((p) => p.key)).toEqual(['b']);
  });

  test('purge des photos orphelines', async () => {
    await putOfflinePhoto('vivante', { userId: 'u1', dataUrl: JPEG });
    await putOfflinePhoto('orpheline', { userId: 'u1', dataUrl: JPEG });
    expect(await pruneOrphanOfflinePhotos(new Set(['vivante']))).toBe(1);
    expect((await listOfflinePhotos()).map((p) => p.key)).toEqual(['vivante']);
  });
});
