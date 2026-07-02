import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGLZoneContentArrival } from '../../src/gl/hooks/useGLZoneContentArrival.js';

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
const CONTENT_ZONE = { id: 5, points: ZONE_POINTS, popoverMarkdown: '# Salut' };
const OUTSIDE = { xp: 10, yp: 10 };
const INSIDE = { xp: 50, yp: 50 };
const MOVE_MS = 560;

function setup(props = {}) {
  return renderHook(() =>
    useGLZoneContentArrival({
      kingdomZones: [CONTENT_ZONE],
      gameId: 7,
      watchTeamId: 1,
      ...props,
    }),
  );
}

describe('useGLZoneContentArrival', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('déclenche present-content à l’entrée de zone après le délai d’animation', async () => {
    vi.mocked(apiGL).mockResolvedValue({
      zone: CONTENT_ZONE,
      popoverMarkdown: '# Bonjour',
      popoverImages: [{ url: 'https://img/1.png' }],
    });

    const { result } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    expect(apiGL).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(apiGL).toHaveBeenCalledWith('/api/gl/games/7/zones/5/present-content', 'POST', {
      teamId: 1,
    });
    expect(result.current.popover).toMatchObject({
      teamId: 1,
      loading: false,
      error: '',
      popoverMarkdown: '# Bonjour',
      popoverImages: [{ url: 'https://img/1.png' }],
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

  test('déduplique les présentations rapprochées (fenêtre 3 s)', async () => {
    vi.mocked(apiGL).mockResolvedValue({ zone: CONTENT_ZONE, popoverMarkdown: 'x' });

    const { result } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    expect(apiGL).toHaveBeenCalledTimes(1);

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

  test('ignore une zone sans contenu popover', async () => {
    const { result } = renderHook(() =>
      useGLZoneContentArrival({
        kingdomZones: [{ id: 6, points: ZONE_POINTS }],
        gameId: 7,
        watchTeamId: 1,
      }),
    );

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(apiGL).not.toHaveBeenCalled();
  });

  test('ferme le popover sans erreur si present-content renvoie 409', async () => {
    const err = new Error('Déjà présenté');
    err.status = 409;
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
    expect(result.current.popover).toBeNull();
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
