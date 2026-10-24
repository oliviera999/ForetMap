import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  UNREACHABLE_FAILURE_THRESHOLD,
  getNetworkMode,
  isDeviceOffline,
  isOfflineError,
  isServerUnreachable,
  markOfflineError,
  probeReachability,
  reportTransportFailure,
  reportTransportSuccess,
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

  it('réseau inutilisable : après plusieurs échecs de transport, l’appareil est hors ligne', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeNetworkStatus(handler);
    for (let i = 0; i < UNREACHABLE_FAILURE_THRESHOLD - 1; i += 1) reportTransportFailure();
    expect(getNetworkMode()).toBe('online');
    reportTransportFailure();
    expect(isServerUnreachable()).toBe(true);
    expect(isDeviceOffline()).toBe(true);
    expect(getNetworkMode()).toBe('unreachable');
    expect(handler).toHaveBeenLastCalledWith(false);
    // La moindre réponse du serveur lève l'état.
    reportTransportSuccess();
    expect(getNetworkMode()).toBe('online');
    expect(handler).toHaveBeenLastCalledWith(true);
    unsubscribe();
  });

  it('un succès entre deux échecs remet le compteur à zéro', () => {
    reportTransportFailure();
    reportTransportFailure();
    reportTransportSuccess();
    reportTransportFailure();
    expect(isServerUnreachable()).toBe(false);
  });

  it('sonde de retour : toute réponse HTTP prouve que le réseau passe', async () => {
    for (let i = 0; i < UNREACHABLE_FAILURE_THRESHOLD; i += 1) reportTransportFailure();
    expect(await probeReachability({ fetchImpl: async () => Promise.reject(new Error('x')) })).toBe(
      false,
    );
    expect(isServerUnreachable()).toBe(true);
    expect(await probeReachability({ fetchImpl: async () => ({ status: 503 }) })).toBe(true);
    expect(isServerUnreachable()).toBe(false);
  });

  it('mode avion prioritaire sur le réseau inutilisable', () => {
    for (let i = 0; i < UNREACHABLE_FAILURE_THRESHOLD; i += 1) reportTransportFailure();
    expect(getNetworkMode({ onLine: false })).toBe('offline');
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
