import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGLLoreFeuilletArrival } from '../../src/gl/hooks/useGLLoreFeuilletArrival.js';

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
const KINGDOM_ZONE = { id: 3, points: ZONE_POINTS, popoverMarkdown: 'Contenu de zone' };
const OUTSIDE = { xp: 10, yp: 10 };
const INSIDE = { xp: 50, yp: 50 };
const MOVE_MS = 560;

const FEUILLETS_URL = '/api/gl/lore/games/7/zones/3/feuillets';
const PRESENT_URL = '/api/gl/lore/games/7/feuillets/FEU-1/present';

function mockLoreApi({ items = [{ feuilletCode: 'FEU-1', titre: 'Feuillet' }] } = {}) {
  vi.mocked(apiGL).mockImplementation(async (url, method) => {
    if (url === FEUILLETS_URL && !method) return { items };
    if (url === PRESENT_URL && method === 'POST') {
      return { feuillet: { feuilletCode: 'FEU-1', titre: 'Feuillet enrichi' } };
    }
    return {};
  });
}

function presentCallCount() {
  return vi.mocked(apiGL).mock.calls.filter(([url]) => url === PRESENT_URL).length;
}

function setup(props = {}) {
  return renderHook(() =>
    useGLLoreFeuilletArrival({
      kingdomZones: [KINGDOM_ZONE],
      gameId: 7,
      watchTeamId: 1,
      ...props,
    }),
  );
}

describe('useGLLoreFeuilletArrival', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('déclenche la découverte du premier feuillet à l’entrée de zone', async () => {
    mockLoreApi();
    const { result } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    expect(apiGL).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(apiGL).toHaveBeenCalledWith(FEUILLETS_URL);
    expect(apiGL).toHaveBeenCalledWith(PRESENT_URL, 'POST', { teamId: 1, kingdomZoneId: 3 });
    expect(result.current.discovery).toMatchObject({
      teamId: 1,
      loading: false,
      error: '',
      feuillet: { feuilletCode: 'FEU-1', titre: 'Feuillet enrichi' },
    });
  });

  test('ne présente rien si la zone n’a aucun feuillet', async () => {
    mockLoreApi({ items: [] });
    const { result } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(presentCallCount()).toBe(0);
    expect(result.current.discovery).toBeNull();
  });

  test('ne se redéclenche pas sur une position identique', async () => {
    mockLoreApi();
    const { result } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(OUTSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS * 2);
    });

    expect(apiGL).not.toHaveBeenCalled();
  });

  test('déduplique la présentation du même feuillet (fenêtre 3 s)', async () => {
    mockLoreApi();
    const { result } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    expect(presentCallCount()).toBe(1);

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });
    expect(presentCallCount()).toBe(1);

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
    expect(presentCallCount()).toBe(2);
  });

  test('ferme la découverte sans erreur si present renvoie 409', async () => {
    vi.mocked(apiGL).mockImplementation(async (url, method) => {
      if (url === FEUILLETS_URL && !method) {
        return { items: [{ feuilletCode: 'FEU-1' }] };
      }
      const err = new Error('Déjà présenté');
      err.status = 409;
      throw err;
    });
    const { result } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    expect(result.current.discovery).toBeNull();
  });

  test('markRead poste la lecture du feuillet affiché', async () => {
    mockLoreApi();
    const { result } = setup();

    act(() => {
      result.current.handlePositionChange(OUTSIDE);
      result.current.handlePositionChange(INSIDE);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MOVE_MS);
    });

    await act(async () => {
      await result.current.markRead();
    });

    expect(apiGL).toHaveBeenCalledWith('/api/gl/lore/games/7/feuillets/FEU-1/read', 'POST', {
      teamId: 1,
    });
  });

  test('nettoie le timer en attente au démontage', async () => {
    mockLoreApi();
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
