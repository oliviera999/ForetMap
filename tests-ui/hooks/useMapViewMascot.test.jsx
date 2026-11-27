// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import useMapViewMascot from '../../src/hooks/useMapViewMascot.js';
import { MAP_VIEW_MASCOT_MOVE_MS } from '../../src/utils/mapViewMascotMotion.js';
import { VISIT_MASCOT_STATE } from '../../src/utils/visitMascotState.js';

vi.mock('../../src/shared/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: () => false,
}));

/** Harnais reproduisant l'usage réel (map-views.jsx). */
function Harness({ apiRef, mapId = 'foret', markers = [], fitHeightPx = 600 }) {
  apiRef.current = useMapViewMascot({
    mapId,
    markers,
    fitHeightPx,
    enabled: true,
  });
  return null;
}

function renderHarness(overrides = {}) {
  const apiRef = { current: null };
  const props = { apiRef, ...overrides };
  const view = render(<Harness {...props} />);
  return { apiRef, ...view };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => {
  vi.useRealTimers();
});

/** Locomotion pendant le trajet (marche ou course selon la distance) — jamais inspect/map_read. */
function expectLocomotionDuringTravel(api) {
  expect(api.mascotClassName).toContain('visit-map-mascot--walking');
  expect([
    VISIT_MASCOT_STATE.WALKING,
    VISIT_MASCOT_STATE.RUNNING,
    VISIT_MASCOT_STATE.SURPRISE,
  ]).toContain(api.animationState);
  expect(api.animationState).not.toBe(VISIT_MASCOT_STATE.INSPECT);
  expect(api.animationState).not.toBe(VISIT_MASCOT_STATE.MAP_READ);
}

describe('useMapViewMascot', () => {
  it('moveTo : locomotion pendant MAP_VIEW_MASCOT_MOVE_MS (clic sur le vide)', () => {
    const { apiRef } = renderHarness();

    act(() => apiRef.current.moveTo(80, 60));

    expectLocomotionDuringTravel(apiRef.current);

    act(() => vi.advanceTimersByTime(MAP_VIEW_MASCOT_MOVE_MS - 1));
    expect(apiRef.current.mascotClassName).toContain('visit-map-mascot--walking');

    act(() => vi.advanceTimersByTime(1));
    expect(apiRef.current.mascotClassName).not.toContain('visit-map-mascot--walking');
  });

  it('onMarkerViewClick : locomotion pendant le trajet, inspect seulement à l’arrivée', () => {
    const { apiRef } = renderHarness();
    const openMarker = vi.fn();
    const marker = { id: 7, x_pct: 80, y_pct: 60, label: 'Arbre' };

    act(() => apiRef.current.onMarkerViewClick(marker, openMarker));

    // Régression : inspect ne doit plus partir au clic (sinon translation sans marche).
    expectLocomotionDuringTravel(apiRef.current);
    expect(openMarker).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(MAP_VIEW_MASCOT_MOVE_MS));

    expect(openMarker).toHaveBeenCalledWith(marker);
    expect(apiRef.current.animationState).toBe(VISIT_MASCOT_STATE.INSPECT);
  });

  it('onZoneViewClick : locomotion pendant le trajet, map_read seulement à l’arrivée', () => {
    const { apiRef } = renderHarness();
    const openZone = vi.fn();
    // JSON string comme en BDD ; centroïde ≈ 50, 50.
    const zone = {
      id: 3,
      name: 'Butte',
      points: JSON.stringify([
        { xp: 40, yp: 40 },
        { xp: 60, yp: 40 },
        { xp: 60, yp: 60 },
        { xp: 40, yp: 60 },
      ]),
    };

    act(() => apiRef.current.moveTo(10, 10));
    act(() => vi.advanceTimersByTime(MAP_VIEW_MASCOT_MOVE_MS));

    act(() => apiRef.current.onZoneViewClick(zone, openZone));

    expectLocomotionDuringTravel(apiRef.current);
    expect(openZone).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(MAP_VIEW_MASCOT_MOVE_MS));

    expect(openZone).toHaveBeenCalledWith(zone);
    expect(apiRef.current.animationState).toBe(VISIT_MASCOT_STATE.MAP_READ);
  });
});
