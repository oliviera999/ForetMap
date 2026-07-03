// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import useZoneEditPoints from '../../src/hooks/useZoneEditPoints.js';
import { api } from '../../src/services/api';

vi.mock('../../src/services/api', () => ({ api: vi.fn(() => Promise.resolve({})) }));

const ZONE = {
  id: 7,
  name: 'Mare',
  points: JSON.stringify([
    { xp: 10, yp: 10 },
    { xp: 20, yp: 10 },
    { xp: 20, yp: 20 },
  ]),
};

function setup({ mode = 'edit-points', toImagePct = () => null } = {}) {
  const setMode = vi.fn();
  const setToast = vi.fn();
  const onRefresh = vi.fn(() => Promise.resolve());
  const hook = renderHook(
    (props) =>
      useZoneEditPoints({
        mode: props?.mode ?? mode,
        setMode,
        toImagePct,
        onRefresh,
        setToast,
      }),
    { initialProps: { mode } },
  );
  return { setMode, setToast, onRefresh, ...hook };
}

/** Événement pointeur factice (currentTarget minimal, capture non supportée). */
const fakePointerEvent = (clientX = 0, clientY = 0) => ({
  clientX,
  clientY,
  pointerId: 1,
  stopPropagation: () => {},
  preventDefault: () => {},
  currentTarget: {},
});

describe('useZoneEditPoints', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('startEditPoints charge le contour clampé et passe en mode edit-points', () => {
    const { result, setMode } = setup();
    act(() => result.current.startEditPoints(ZONE));
    expect(result.current.editZone).toBe(ZONE);
    expect(result.current.editPoints).toEqual(JSON.parse(ZONE.points));
    expect(result.current.editCanUndo).toBe(false);
    expect(setMode).toHaveBeenCalledWith('edit-points');
  });

  it('startEditPoints tolère un JSON invalide (contour vide)', () => {
    const { result } = setup();
    act(() => result.current.startEditPoints({ ...ZONE, points: 'invalide' }));
    expect(result.current.editPoints).toEqual([]);
  });

  it('translate le polygone entier puis autorise le Ctrl+Z vers l’état initial', () => {
    let pct = { xp: 10, yp: 10 };
    const toImagePct = vi.fn(() => pct);
    const { result } = setup({ toImagePct });
    act(() => result.current.startEditPoints(ZONE));

    act(() => result.current.onTranslatePointerDown(fakePointerEvent(0, 0)));
    pct = { xp: 15, yp: 12 };
    act(() => result.current.onTranslatePointerMove(fakePointerEvent(5, 2)));
    expect(result.current.editPoints).toEqual([
      { xp: 15, yp: 12 },
      { xp: 25, yp: 12 },
      { xp: 25, yp: 22 },
    ]);

    act(() => {
      result.current.endEditZoneTranslate(fakePointerEvent());
      vi.runAllTimers();
    });
    expect(result.current.editCanUndo).toBe(true);

    act(() => result.current.undoEditPoints());
    expect(result.current.editPoints).toEqual(JSON.parse(ZONE.points));
    expect(result.current.editCanUndo).toBe(false);
  });

  it('glisse un sommet (pointer down/move/up) et enregistre l’historique', () => {
    let pct = { xp: 50, yp: 50 };
    const toImagePct = vi.fn(() => pct);
    const { result } = setup({ toImagePct });
    act(() => result.current.startEditPoints(ZONE));

    act(() => result.current.onEditPointPointerDown(1, fakePointerEvent()));
    expect(result.current.draggingPtIdx).toBe(1);
    act(() => result.current.onEditPointPointerMove(1, fakePointerEvent()));
    expect(result.current.editPoints[1]).toEqual({ xp: 50, yp: 50 });
    // Les autres sommets sont intacts.
    expect(result.current.editPoints[0]).toEqual({ xp: 10, yp: 10 });

    act(() => {
      result.current.onEditPointPointerUp(fakePointerEvent());
      vi.runAllTimers();
    });
    expect(result.current.draggingPtIdx).toBe(-1);
    expect(result.current.editCanUndo).toBe(true);
  });

  it('Ctrl+Z global annule pendant le mode edit-points (hors champs de saisie)', () => {
    let pct = { xp: 40, yp: 40 };
    const toImagePct = vi.fn(() => pct);
    const { result } = setup({ toImagePct });
    act(() => result.current.startEditPoints(ZONE));
    act(() => result.current.onEditPointPointerDown(0, fakePointerEvent()));
    act(() => result.current.onEditPointPointerMove(0, fakePointerEvent()));
    act(() => {
      result.current.onEditPointPointerUp(fakePointerEvent());
      vi.runAllTimers();
    });
    expect(result.current.editPoints[0]).toEqual({ xp: 40, yp: 40 });

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
      );
    });
    expect(result.current.editPoints[0]).toEqual({ xp: 10, yp: 10 });
  });

  it('saveEditPoints envoie le contour, rafraîchit, ferme la session et confirme', async () => {
    const { result, setMode, setToast, onRefresh } = setup();
    act(() => result.current.startEditPoints(ZONE));
    await act(async () => {
      await result.current.saveEditPoints();
    });
    expect(api).toHaveBeenCalledWith('/api/zones/7', 'PUT', {
      points: JSON.parse(ZONE.points),
    });
    expect(onRefresh).toHaveBeenCalled();
    expect(result.current.editZone).toBeNull();
    expect(result.current.editPoints).toEqual([]);
    expect(setMode).toHaveBeenLastCalledWith('view');
    expect(setToast).toHaveBeenCalledWith('Contour sauvegardé ✓');
  });

  it('discardEditPointsSession réinitialise la session sans sauvegarder', () => {
    const { result } = setup();
    act(() => result.current.startEditPoints(ZONE));
    act(() => result.current.discardEditPointsSession());
    expect(result.current.editZone).toBeNull();
    expect(result.current.editPoints).toEqual([]);
    expect(result.current.editCanUndo).toBe(false);
    expect(api).not.toHaveBeenCalled();
  });
});
