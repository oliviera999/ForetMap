import { describe, expect, test, vi } from 'vitest';
import {
  formatBytes,
  getStorageStatus,
  isIosDevice,
  isIosNotInstalled,
  isStorageLow,
  requestPersistentStorage,
} from '../../src/shared/platform/storagePersistence.js';

const MB = 1024 * 1024;

describe('storagePersistence', () => {
  test('état du stockage : persistance et estimation', async () => {
    const nav = {
      storage: {
        persisted: async () => true,
        estimate: async () => ({ usage: 12 * MB, quota: 1000 * MB }),
      },
    };
    expect(await getStorageStatus(nav)).toEqual({
      supported: true,
      persisted: true,
      usage: 12 * MB,
      quota: 1000 * MB,
    });
    expect(await getStorageStatus({})).toEqual({
      supported: false,
      persisted: null,
      usage: null,
      quota: null,
    });
  });

  test('estimation en erreur : valeurs inconnues, sans exception', async () => {
    const nav = {
      storage: {
        persisted: async () => {
          throw new Error('x');
        },
        estimate: async () => {
          throw new Error('x');
        },
      },
    };
    expect(await getStorageStatus(nav)).toMatchObject({
      persisted: null,
      usage: null,
      quota: null,
    });
  });

  test('demande de persistance : déjà acquise, accordée, indisponible', async () => {
    const persist = vi.fn(async () => true);
    expect(
      await requestPersistentStorage({ storage: { persisted: async () => true, persist } }),
    ).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(
      await requestPersistentStorage({ storage: { persisted: async () => false, persist } }),
    ).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(await requestPersistentStorage({ storage: {} })).toBeNull();
    expect(await requestPersistentStorage({})).toBeNull();
  });

  test('appareil presque plein : part du quota ou place libre trop faible', () => {
    expect(isStorageLow(95 * MB, 100 * MB)).toBe(true);
    expect(isStorageLow(10 * MB, 25 * MB)).toBe(true);
    expect(isStorageLow(10 * MB, 1000 * MB)).toBe(false);
    expect(isStorageLow(null, 1000 * MB)).toBe(false);
  });

  test('iPhone / iPad non installé', () => {
    const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' };
    const ipad = {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      maxTouchPoints: 5,
    };
    const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 };
    expect(isIosDevice(iphone)).toBe(true);
    expect(isIosDevice(ipad)).toBe(true);
    expect(isIosDevice(mac)).toBe(false);
    const browserTab = { matchMedia: () => ({ matches: false }) };
    expect(isIosNotInstalled(browserTab, iphone)).toBe(true);
    expect(isIosNotInstalled(browserTab, { ...iphone, standalone: true })).toBe(false);
    expect(isIosNotInstalled({ matchMedia: () => ({ matches: true }) }, iphone)).toBe(false);
  });

  test('tailles lisibles en français', () => {
    expect(formatBytes(512)).toBe('512 o');
    expect(formatBytes(1536)).toBe('1,5 Ko');
    expect(formatBytes(12 * MB)).toBe('12 Mo');
    expect(formatBytes(-1)).toBe('—');
  });
});
