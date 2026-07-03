import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGLGuestFeuilletArrival } from '../../src/gl/hooks/useGLGuestFeuilletArrival.js';

const ZONE_POINTS = [
  { x: 40, y: 40 },
  { x: 60, y: 40 },
  { x: 60, y: 60 },
  { x: 40, y: 60 },
];
const FEUILLET_ZONE = {
  zoneId: 'z1',
  points: ZONE_POINTS,
  titre: 'Bosquet',
  popover: 'Texte du bosquet',
  coutGemme: 2,
  gainCoeur: 1,
};
const OUTSIDE = { xp: 10, yp: 10 };
const INSIDE = { xp: 50, yp: 50 };
const MOVE_MS = 560;

describe('useGLGuestFeuilletArrival', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('déclenche le popover local à l’entrée de zone, sans réseau', async () => {
    const onZonePresented = vi.fn();
    const { result } = renderHook(() =>
      useGLGuestFeuilletArrival({
        feuilletZones: [FEUILLET_ZONE],
        watchTeamId: 1,
        onZonePresented,
      }),
    );

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    expect(result.current.popover).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(result.current.popover).toMatchObject({
      teamId: 1,
      loading: false,
      error: '',
      titre: 'Bosquet',
      popover: 'Texte du bosquet',
      coutGemme: 2,
      gainCoeur: 1,
      vitality: null,
    });
    expect(onZonePresented).toHaveBeenCalledWith(FEUILLET_ZONE);
  });

  test('ne se redéclenche pas sur une position identique', async () => {
    const onZonePresented = vi.fn();
    const { result } = renderHook(() =>
      useGLGuestFeuilletArrival({
        feuilletZones: [FEUILLET_ZONE],
        watchTeamId: 1,
        onZonePresented,
      }),
    );

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(OUTSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS * 2);
    });

    expect(onZonePresented).not.toHaveBeenCalled();
    expect(result.current.popover).toBeNull();
  });

  test('une zone déjà présentée localement ne se redéclenche pas', async () => {
    const onZonePresented = vi.fn();
    const { result } = renderHook(() =>
      useGLGuestFeuilletArrival({
        feuilletZones: [FEUILLET_ZONE],
        watchTeamId: 1,
        onZonePresented,
      }),
    );

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    expect(onZonePresented).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    expect(onZonePresented).toHaveBeenCalledTimes(1);
  });

  test('déduplique (fenêtre 3 s) après réinitialisation de presentedZoneIds', async () => {
    const onZonePresented = vi.fn();
    const { result, rerender } = renderHook((props) => useGLGuestFeuilletArrival(props), {
      initialProps: {
        feuilletZones: [FEUILLET_ZONE],
        watchTeamId: 1,
        presentedZoneIds: [],
        onZonePresented,
      },
    });

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    expect(onZonePresented).toHaveBeenCalledTimes(1);

    // Nouvelle référence de tableau : le hook invité remplace le set local.
    rerender({
      feuilletZones: [FEUILLET_ZONE],
      watchTeamId: 1,
      presentedZoneIds: [],
      onZonePresented,
    });

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    // Zone redevenue éligible mais dédupliquée (< 3 s).
    expect(onZonePresented).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    rerender({
      feuilletZones: [FEUILLET_ZONE],
      watchTeamId: 1,
      presentedZoneIds: [],
      onZonePresented,
    });
    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    expect(onZonePresented).toHaveBeenCalledTimes(2);
  });

  test('nettoie le timer en attente au démontage', async () => {
    const onZonePresented = vi.fn();
    const { result, unmount } = renderHook(() =>
      useGLGuestFeuilletArrival({
        feuilletZones: [FEUILLET_ZONE],
        watchTeamId: 1,
        onZonePresented,
      }),
    );

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS * 2);
    });

    expect(onZonePresented).not.toHaveBeenCalled();
  });
});
