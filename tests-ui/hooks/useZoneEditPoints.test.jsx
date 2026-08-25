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

function setup({ mode = 'edit-points', toImagePct = () => null, ...options } = {}) {
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
        ...options,
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

// ——————————————————————————————————————————————————————————————————————
// Édition avancée : ajout/suppression de sommets, sélection multiple, aimant.
// ——————————————————————————————————————————————————————————————————————

/** Carré : le pointeur est exprimé directement en % d'image (clientX = xp). */
const SQUARE = [
  { xp: 0, yp: 0 },
  { xp: 100, yp: 0 },
  { xp: 100, yp: 100 },
  { xp: 0, yp: 100 },
];
const SQUARE_ZONE = { id: 9, name: 'Verger', points: JSON.stringify(SQUARE) };
const pctFromClient = (clientX, clientY) => ({ xp: clientX, yp: clientY });

/** Comme `fakePointerEvent`, avec les modificateurs clavier (Maj+clic). */
const modifierPointerEvent = (clientX, clientY, extra = {}) => ({
  ...fakePointerEvent(clientX, clientY),
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  ...extra,
});

function startSquare(result) {
  act(() => result.current.startEditPoints(SQUARE_ZONE));
}

function tapVertex(result, i, extra = {}) {
  const at = SQUARE[i] || { xp: 0, yp: 0 };
  act(() => result.current.onEditPointPointerDown(i, modifierPointerEvent(at.xp, at.yp, extra)));
  act(() => result.current.onEditPointPointerUp(modifierPointerEvent(at.xp, at.yp, extra)));
}

describe('useZoneEditPoints — ajout et suppression de sommets', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('insertPointFromPct ajoute un sommet sur l’arête la plus proche et le sélectionne', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    let created;
    act(() => {
      created = result.current.insertPointFromPct({ xp: 50, yp: 1 });
    });
    expect(created).toBe(1);
    expect(result.current.editPoints).toHaveLength(5);
    expect(result.current.editPoints[1]).toEqual({ xp: 50, yp: 0 });
    expect([...result.current.selectedPtIdxs]).toEqual([1]);
    act(() => vi.runAllTimers());
    expect(result.current.editCanUndo).toBe(true);
  });

  it('un clic loin du contour n’ajoute aucun sommet', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    let created;
    act(() => {
      created = result.current.insertPointFromPct({ xp: 50, yp: 50 });
    });
    expect(created).toBe(-1);
    expect(result.current.editPoints).toHaveLength(4);
  });

  it('insertPointAtMidpoint ajoute au milieu d’une arête (poignée fantôme)', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    act(() => result.current.insertPointAtMidpoint(1, { xp: 50, yp: 0 }));
    expect(result.current.editPoints[1]).toEqual({ xp: 50, yp: 0 });
    expect([...result.current.selectedPtIdxs]).toEqual([1]);
  });

  it('removeSelectedPoints retire la sélection et réindexe le reste', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    act(() => result.current.insertPointFromPct({ xp: 50, yp: 1 }));
    expect(result.current.editPoints).toHaveLength(5);
    expect(result.current.canRemoveSelection).toBe(true);
    act(() => {
      result.current.removeSelectedPoints();
    });
    expect(result.current.editPoints).toEqual(SQUARE);
    expect(result.current.selectedPtIdxs.size).toBe(0);
  });

  it('la suppression est refusée en dessous de trois sommets', () => {
    const { result, setToast } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    act(() => result.current.selectAllPoints());
    expect(result.current.canRemoveSelection).toBe(false);
    let removed;
    act(() => {
      removed = result.current.removeSelectedPoints();
    });
    expect(removed).toBe(false);
    expect(result.current.editPoints).toHaveLength(4);
    expect(setToast).not.toHaveBeenCalled();
  });

  it('la touche Suppr retire les sommets sélectionnés', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    tapVertex(result, 2);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    });
    expect(result.current.editPoints).toHaveLength(3);
  });
});

describe('useZoneEditPoints — sélection multiple', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('Maj+clic ajoute puis retire un sommet de la sélection', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    tapVertex(result, 0);
    tapVertex(result, 2, { shiftKey: true });
    expect([...result.current.selectedPtIdxs].sort()).toEqual([0, 2]);
    tapVertex(result, 2, { shiftKey: true });
    expect([...result.current.selectedPtIdxs]).toEqual([0]);
  });

  it('Échap vide la sélection', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    act(() => result.current.selectAllPoints());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(result.current.selectedPtIdxs.size).toBe(0);
  });

  it('le lasso sélectionne les sommets du rectangle, un clic simple désélectionne', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    act(() => result.current.onLassoPointerDown(modifierPointerEvent(-5, -5)));
    act(() => result.current.onLassoPointerMove(modifierPointerEvent(50, 50)));
    expect(result.current.lassoRect).toEqual({ x1: -5, y1: -5, x2: 50, y2: 50 });
    act(() => result.current.onLassoPointerUp(modifierPointerEvent(50, 50)));
    expect([...result.current.selectedPtIdxs]).toEqual([0]);
    expect(result.current.lassoRect).toBeNull();

    act(() => result.current.onLassoPointerDown(modifierPointerEvent(50, 50)));
    act(() => result.current.onLassoPointerUp(modifierPointerEvent(50, 50)));
    expect(result.current.selectedPtIdxs.size).toBe(0);
  });

  it('un second doigt (pinch) abandonne le lasso au lieu de sélectionner', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    act(() => result.current.onLassoPointerDown(modifierPointerEvent(-5, -5)));
    act(() => result.current.onLassoPointerMove(modifierPointerEvent(50, 50)));
    act(() => result.current.onLassoPointerDown({ ...modifierPointerEvent(60, 60), pointerId: 2 }));
    expect(result.current.lassoRect).toBeNull();
    act(() => result.current.onLassoPointerUp(modifierPointerEvent(50, 50)));
    expect(result.current.selectedPtIdxs.size).toBe(0);
  });

  it('glisser un sommet du groupe déplace toute la sélection, bornée par le plan', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    tapVertex(result, 0);
    tapVertex(result, 1, { shiftKey: true });

    act(() => result.current.onEditPointPointerDown(0, modifierPointerEvent(0, 0)));
    act(() => result.current.onEditPointPointerMove(0, modifierPointerEvent(0, 10)));
    act(() => result.current.onEditPointPointerUp(modifierPointerEvent(0, 10)));
    expect(result.current.editPoints[0]).toEqual({ xp: 0, yp: 10 });
    expect(result.current.editPoints[1]).toEqual({ xp: 100, yp: 10 });
    expect(result.current.editPoints[2]).toEqual({ xp: 100, yp: 100 });

    // Le groupe touche déjà le bord droit : il ne se déforme pas en butant dessus.
    act(() => result.current.onEditPointPointerDown(0, modifierPointerEvent(0, 10)));
    act(() => result.current.onEditPointPointerMove(0, modifierPointerEvent(40, 10)));
    act(() => result.current.onEditPointPointerUp(modifierPointerEvent(40, 10)));
    expect(result.current.editPoints[0]).toEqual({ xp: 0, yp: 10 });
    expect(result.current.editPoints[1]).toEqual({ xp: 100, yp: 10 });
  });
});

describe('useZoneEditPoints — aimant de contour', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('le sommet glissé est collé sur le contour renvoyé par l’aimant', () => {
    const snapPoint = vi.fn(() => ({ xp: 42, yp: 8 }));
    const { result } = setup({ toImagePct: pctFromClient, snapPoint, snapRadiusPct: 2 });
    startSquare(result);
    act(() => result.current.onEditPointPointerDown(0, modifierPointerEvent(0, 0)));
    act(() => result.current.onEditPointPointerMove(0, modifierPointerEvent(40, 10)));
    expect(snapPoint).toHaveBeenCalledWith({ xp: 40, yp: 10 }, { radiusPct: 2 });
    expect(result.current.editPoints[0]).toEqual({ xp: 42, yp: 8 });
    act(() => result.current.onEditPointPointerUp(modifierPointerEvent(40, 10)));
  });

  it('sans contour proche, le sommet suit exactement le pointeur', () => {
    const snapPoint = vi.fn(() => null);
    const { result } = setup({ toImagePct: pctFromClient, snapPoint });
    startSquare(result);
    act(() => result.current.onEditPointPointerDown(0, modifierPointerEvent(0, 0)));
    act(() => result.current.onEditPointPointerMove(0, modifierPointerEvent(40, 10)));
    expect(result.current.editPoints[0]).toEqual({ xp: 40, yp: 10 });
  });

  it('snapSelectedPoints recale la sélection — ou tout le contour si rien n’est sélectionné', () => {
    const snapPoint = vi.fn((p) => (p.xp === 0 ? { xp: 3, yp: 3 } : null));
    const { result } = setup({ toImagePct: pctFromClient, snapPoint });
    startSquare(result);
    let moved;
    act(() => {
      moved = result.current.snapSelectedPoints();
    });
    // Deux sommets ont xp = 0 (le premier et le dernier) : tous deux sont recalés.
    expect(moved).toBe(2);
    expect(result.current.editPoints[0]).toEqual({ xp: 3, yp: 3 });
    expect(result.current.editPoints[3]).toEqual({ xp: 3, yp: 3 });
  });

  it('sans aimant branché, snapSelectedPoints ne fait rien', () => {
    const { result } = setup({ toImagePct: pctFromClient });
    startSquare(result);
    let moved;
    act(() => {
      moved = result.current.snapSelectedPoints();
    });
    expect(moved).toBe(0);
    expect(result.current.editPoints).toEqual(SQUARE);
  });
});
