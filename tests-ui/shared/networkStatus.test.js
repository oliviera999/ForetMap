import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  isDeviceOffline,
  isOfflineError,
  markOfflineError,
  subscribeNetworkStatus,
} from '../../src/shared/networkStatus.js';
import { useDeviceOnline } from '../../src/shared/hooks/useDeviceOnline.js';

function setOnline(value) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => value });
}

describe('networkStatus', () => {
  afterEach(() => setOnline(true));

  it('ne se fie qu’à `onLine === false`', () => {
    expect(isDeviceOffline({ onLine: false })).toBe(true);
    expect(isDeviceOffline({ onLine: true })).toBe(false);
    expect(isDeviceOffline({})).toBe(false);
    expect(isDeviceOffline(null)).toBe(false);
  });

  it('marque et reconnaît une erreur hors ligne', () => {
    const err = markOfflineError(new Error('x'));
    expect(isOfflineError(err)).toBe(true);
    expect(isOfflineError(new Error('y'))).toBe(false);
    expect(markOfflineError(null)).toBeNull();
  });

  it('notifie les passages hors ligne / en ligne, et se désabonne', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeNetworkStatus(handler);
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    unsubscribe();
    window.dispatchEvent(new Event('offline'));
    expect(handler.mock.calls).toEqual([[false], [true]]);
  });

  it('useDeviceOnline suit l’état réseau de l’appareil', () => {
    const { result } = renderHook(() => useDeviceOnline());
    expect(result.current).toBe(true);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });
});
