import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGLFeuilletZoneArrival } from '../../src/gl/hooks/useGLFeuilletZoneArrival.js';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

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
  feuilletCode: 'FEU-1',
};
const OUTSIDE = { xp: 10, yp: 10 };
const INSIDE = { xp: 50, yp: 50 };
const MOVE_MS = 560;

function setup(props = {}) {
  return renderHook((override) =>
    useGLFeuilletZoneArrival({
      feuilletZones: [FEUILLET_ZONE],
      gameId: 7,
      watchTeamId: 1,
      ...props,
      ...override,
    }),
  );
}

describe('useGLFeuilletZoneArrival', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('déclenche present à l’entrée de zone après le délai d’animation', async () => {
    vi.mocked(apiGL).mockResolvedValue({
      zone: { titre: 'Bosquet enrichi', popover: 'Texte enrichi', coutGemme: 3, gainCoeur: 2 },
      vitality: { coeur: 4 },
    });
    const onZonePresented = vi.fn();

    const { result } = setup({ onZonePresented });

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    expect(apiGL).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(apiGL).toHaveBeenCalledWith('/api/gl/games/7/feuillet-zones/z1/present', 'POST', {
      teamId: 1,
    });
    expect(onZonePresented).toHaveBeenCalledWith('z1');
    expect(result.current.popover).toMatchObject({
      teamId: 1,
      loading: false,
      error: '',
      titre: 'Bosquet enrichi',
      popover: 'Texte enrichi',
      coutGemme: 3,
      gainCoeur: 2,
      vitality: { coeur: 4 },
    });
  });

  test('ne se redéclenche pas sur une position identique', async () => {
    const { result } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(OUTSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS * 2);
    });

    expect(apiGL).not.toHaveBeenCalled();
    expect(result.current.popover).toBeNull();
  });

  test('une zone déjà présentée (presentedZoneIds) ne se redéclenche pas', async () => {
    const { result } = setup({ presentedZoneIds: ['z1'] });

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(apiGL).not.toHaveBeenCalled();
    expect(result.current.popover).toBeNull();
  });

  test('déduplique les présentations rapprochées (fenêtre 3 s) après échec réseau', async () => {
    const err = new Error('Réseau indisponible');
    vi.mocked(apiGL).mockRejectedValue(err);

    const { result } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    expect(apiGL).toHaveBeenCalledTimes(1);
    expect(result.current.popover?.error).toBe('Réseau indisponible');

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    expect(apiGL).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    expect(apiGL).toHaveBeenCalledTimes(2);
  });

  test('marque la zone présentée et ferme le popover si present renvoie 409', async () => {
    const err = new Error('Déjà présenté');
    err.status = 409;
    vi.mocked(apiGL).mockRejectedValue(err);
    const onZonePresented = vi.fn();

    const { result } = setup({ onZonePresented });

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(result.current.popover).toBeNull();
    expect(onZonePresented).toHaveBeenCalledWith('z1');
  });

  test('propage le feuillet au carnet de lore quand loreCarnetEnabled', async () => {
    vi.mocked(apiGL).mockResolvedValue({ zone: {}, vitality: null });

    const { result } = setup({ loreCarnetEnabled: true });

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(apiGL).toHaveBeenCalledWith('/api/gl/lore/games/7/feuillets/FEU-1/present', 'POST', {
      teamId: 1,
    });
  });

  test('ne déclenche rien quand un QCM est ouvert', async () => {
    const { result } = setup({ qcmOpen: true });

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(apiGL).not.toHaveBeenCalled();
  });

  test('attend presentedZonesReady avant de déclencher', async () => {
    const { result } = setup({ presentedZonesReady: false });

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(apiGL).not.toHaveBeenCalled();
  });

  test('nettoie le timer en attente au démontage', async () => {
    const { result, unmount } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS * 2);
    });

    expect(apiGL).not.toHaveBeenCalled();
  });
});
