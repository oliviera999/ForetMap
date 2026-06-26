import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useGeolocation } from '../../src/hooks/useGeolocation.js';

function makeGeolocationMock() {
  return {
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
    getCurrentPosition: vi.fn(),
  };
}

describe('useGeolocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signale l’absence de capteur (module non présent)', () => {
    vi.stubGlobal('navigator', {});
    const { result } = renderHook(() => useGeolocation());
    expect(result.current.supported).toBe(false);
    expect(result.current.status).toBe('unavailable');
  });

  it('démarre le suivi et expose la position reçue', () => {
    const geo = makeGeolocationMock();
    let successCb;
    geo.watchPosition.mockImplementation((onSuccess) => {
      successCb = onSuccess;
      return 42;
    });
    vi.stubGlobal('navigator', { geolocation: geo });

    const { result } = renderHook(() => useGeolocation());
    expect(result.current.supported).toBe(true);

    act(() => result.current.start());
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('prompt');

    act(() => {
      successCb({
        coords: { latitude: 48.85, longitude: 2.3, accuracy: 8 },
        timestamp: 1000,
      });
    });
    expect(result.current.status).toBe('granted');
    expect(result.current.position).toEqual({
      lat: 48.85,
      lng: 2.3,
      accuracy: 8,
      timestamp: 1000,
    });
  });

  it('passe en statut « denied » si la permission est refusée', () => {
    const geo = makeGeolocationMock();
    let errorCb;
    geo.watchPosition.mockImplementation((_onSuccess, onError) => {
      errorCb = onError;
      return 7;
    });
    vi.stubGlobal('navigator', { geolocation: geo });

    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.start());
    act(() => {
      errorCb({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
    });
    expect(result.current.status).toBe('denied');
    expect(result.current.error).toMatch(/refus/i);
  });

  it('arrête le suivi (clearWatch) au stop', () => {
    const geo = makeGeolocationMock();
    geo.watchPosition.mockReturnValue(99);
    vi.stubGlobal('navigator', { geolocation: geo });

    const { result } = renderHook(() => useGeolocation());
    act(() => result.current.start());
    act(() => result.current.stop());
    expect(geo.clearWatch).toHaveBeenCalledWith(99);
    expect(result.current.status).toBe('idle');
  });
});
