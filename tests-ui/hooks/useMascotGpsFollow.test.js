import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useMascotGpsFollow } from '../../src/hooks/useMascotGpsFollow.js';

const ANCHORS = [
  { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
  { xp: 90, yp: 10, lat: 48.85, lng: 2.31 },
  { xp: 10, yp: 90, lat: 48.84, lng: 2.3 },
];

function stubGeolocation() {
  let successCb;
  const geo = {
    watchPosition: vi.fn((onSuccess) => {
      successCb = onSuccess;
      return 1;
    }),
    clearWatch: vi.fn(),
  };
  vi.stubGlobal('navigator', { geolocation: geo });
  return {
    geo,
    emit: (lat, lng, accuracy = 8) =>
      successCb({ coords: { latitude: lat, longitude: lng, accuracy }, timestamp: 1 }),
  };
}

describe('useMascotGpsFollow', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('n’est pas disponible si gps_enabled est faux', () => {
    stubGeolocation();
    const { result } = renderHook(() =>
      useMascotGpsFollow({ georef: ANCHORS, gpsEnabled: false, moveTo: vi.fn() }),
    );
    expect(result.current.available).toBe(false);
  });

  it('déplace la mascotte vers la position convertie quand actif', () => {
    const { emit } = stubGeolocation();
    const moveTo = vi.fn();
    const { result } = renderHook(() =>
      useMascotGpsFollow({ georef: ANCHORS, gpsEnabled: true, moveTo }),
    );
    expect(result.current.available).toBe(true);

    act(() => result.current.toggle());
    expect(result.current.active).toBe(true);

    act(() => emit(48.85, 2.3, 8));
    expect(moveTo).toHaveBeenCalledTimes(1);
    const [xp, yp] = moveTo.mock.calls[0];
    expect(xp).toBeCloseTo(10, 5);
    expect(yp).toBeCloseTo(10, 5);
    expect(result.current.feedback).toBe('ok');
  });

  it('ignore une position trop imprécise', () => {
    const { emit } = stubGeolocation();
    const moveTo = vi.fn();
    const { result } = renderHook(() =>
      useMascotGpsFollow({
        georef: ANCHORS,
        gpsEnabled: true,
        moveTo,
        accuracyThresholdM: 20,
      }),
    );
    act(() => result.current.toggle());
    act(() => emit(48.85, 2.3, 500));
    expect(moveTo).not.toHaveBeenCalled();
    expect(result.current.feedback).toBe('low_accuracy');
  });

  it('signale une position hors zone du plan', () => {
    const { emit } = stubGeolocation();
    const moveTo = vi.fn();
    const { result } = renderHook(() =>
      useMascotGpsFollow({ georef: ANCHORS, gpsEnabled: true, moveTo }),
    );
    act(() => result.current.toggle());
    // Coordonnée très éloignée → projetée hors [0,100].
    act(() => emit(40.0, 10.0, 5));
    expect(moveTo).not.toHaveBeenCalled();
    expect(result.current.feedback).toBe('out_of_bounds');
  });
});
