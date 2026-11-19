// @vitest-environment jsdom
/**
 * Audit ForetMap du 19/11/2026 — lot 7, volet front.
 *
 * - F4 : fin du glisser d'un repère sans `.catch` (aucun message, repère laissé à une place
 *   que le serveur ignore) ; « Enregistrer le contour » sans gestion d'erreur ni état d'envoi.
 * - C6 : le signalement du plan des personnels envoie la carte affichée.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, renderHook, screen, fireEvent } from '@testing-library/react';

const { apiMock, viewportState } = vi.hoisted(() => ({
  apiMock: vi.fn(() => Promise.resolve({})),
  viewportState: { dragHandlers: null },
}));

vi.mock('../src/services/api', () => ({ api: apiMock }));

// Viewport factice : seul `beginExternalDrag` compte ici — il capture les rappels du glisser
// pour que le test joue lui-même le déplacement puis le relâchement.
vi.mock('../src/shared/pct-map/usePctMapViewport.js', () => ({
  usePctMapViewport: () => ({
    containerRef: { current: null },
    worldRef: { current: null },
    imgRef: { current: null },
    tx: { current: { x: 0, y: 0, s: 1 } },
    committed: { x: 0, y: 0, s: 1 },
    fitScale: 1,
    imgSize: { w: 1, h: 1 },
    imgSizeRef: { current: { w: 1, h: 1 } },
    stageSize: { w: 1, h: 1 },
    moved: { current: false },
    applyTransform: () => {},
    commit: () => {},
    fitMap: () => {},
    remeasure: () => {},
    getViewSnapshot: () => null,
    restoreView: () => {},
    toImagePct: () => null,
    animateZoomTowardScale: () => {},
    focusOnPct: () => {},
    beginPan: () => {},
    updatePan: () => {},
    endPan: () => {},
    panByScreenDelta: () => {},
    beginExternalDrag: (_target, _pointerId, handlers) => {
      viewportState.dragHandlers = handlers;
    },
    isCoarsePointer: false,
    interactionEnabled: true,
    setInteractionEnabled: () => {},
    toggleInteraction: () => {},
    prefersPageScroll: false,
    touchAction: 'none',
    setMapOrientation: () => {},
    mapOrientation: 0,
    orientStyle: {},
  }),
}));

import { useMapGestures } from '../src/hooks/useMapGestures.js';
import useZoneEditPoints from '../src/hooks/useZoneEditPoints.js';
import { MapViewToolbar } from '../src/components/map/MapViewToolbar.jsx';
import { submitPlaceSuggestion } from '../src/plan/planApi.js';

afterEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation(() => Promise.resolve({}));
  viewportState.dragHandlers = null;
});

/** Laisse les promesses en cours se résoudre. */
const flush = () => act(async () => {});

describe('F4 — glisser d’un repère', () => {
  function startDrag({ onError, onRefresh = vi.fn() } = {}) {
    const { result } = renderHook(() =>
      useMapGestures({
        mapImageSrc: 'plan.png',
        activeMapId: 'm1',
        mode: 'view',
        onRefresh,
        onError,
      }),
    );
    const target = document.createElement('div');
    target.style.left = '10%';
    target.style.top = '20%';
    act(() => result.current.beginMarkerDrag('mk-1', target, 1));
    viewportState.dragHandlers.onMove({ xp: 55, yp: 66 });
    expect(target.style.left).toBe('55%');
    return { target, onRefresh };
  }

  it('échec du PUT : message d’erreur et repère remis à sa place d’origine', async () => {
    apiMock.mockImplementation(() => Promise.reject(new Error('Accès refusé')));
    const onError = vi.fn();
    const { target, onRefresh } = startDrag({ onError });
    viewportState.dragHandlers.onEnd({ xp: 55, yp: 66 });
    await flush();
    expect(apiMock).toHaveBeenCalledWith('/api/map/markers/mk-1', 'PUT', { x_pct: 55, y_pct: 66 });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/Position du repère non enregistrée : Accès refusé/);
    expect(target.style.left).toBe('10%');
    expect(target.style.top).toBe('20%');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('hors ligne : le message de l’erreur réseau est relayé', async () => {
    const offline = Object.assign(new Error('Pas de réseau pour l’instant.'), { offline: true });
    apiMock.mockImplementation(() => Promise.reject(offline));
    const onError = vi.fn();
    const { target } = startDrag({ onError });
    viewportState.dragHandlers.onEnd({ xp: 55, yp: 66 });
    await flush();
    expect(onError.mock.calls[0][0]).toMatch(/Pas de réseau/);
    expect(target.style.left).toBe('10%');
  });

  it('succès : rafraîchit, aucun message', async () => {
    const onError = vi.fn();
    const { target, onRefresh } = startDrag({ onError });
    viewportState.dragHandlers.onEnd({ xp: 55, yp: 66 });
    await flush();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(target.style.left).toBe('55%');
  });
});

describe('F4 — enregistrer le contour', () => {
  const ZONE = {
    id: 7,
    name: 'Mare',
    points: JSON.stringify([
      { xp: 10, yp: 10 },
      { xp: 20, yp: 10 },
      { xp: 20, yp: 20 },
    ]),
  };

  function setup() {
    const setMode = vi.fn();
    const setToast = vi.fn();
    const onRefresh = vi.fn(() => Promise.resolve());
    const hook = renderHook(() =>
      useZoneEditPoints({
        mode: 'edit-points',
        setMode,
        toImagePct: () => null,
        onRefresh,
        setToast,
      }),
    );
    act(() => hook.result.current.startEditPoints(ZONE));
    setMode.mockClear();
    return { ...hook, setMode, setToast, onRefresh };
  }

  it('échec : message, session conservée, pas de passage en vue', async () => {
    apiMock.mockImplementation(() => Promise.reject(new Error('Hors ligne')));
    const { result, setMode, setToast, onRefresh } = setup();
    await act(async () => {
      await result.current.saveEditPoints();
    });
    expect(setToast).toHaveBeenCalledWith('Contour non enregistré : Hors ligne');
    expect(result.current.editZone).toBe(ZONE);
    expect(result.current.editPointsSaving).toBe(false);
    expect(setMode).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('envoi en cours : un second clic n’envoie rien', async () => {
    let resolvePut;
    apiMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePut = resolve;
        }),
    );
    const { result, setToast } = setup();
    let first;
    act(() => {
      first = result.current.saveEditPoints();
    });
    expect(result.current.editPointsSaving).toBe(true);
    await act(async () => {
      await result.current.saveEditPoints();
    });
    expect(apiMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolvePut({});
      await first;
    });
    expect(result.current.editPointsSaving).toBe(false);
    expect(setToast).toHaveBeenCalledWith('Contour sauvegardé ✓');
  });

  it('la barre d’outils désactive « Enregistrer » pendant l’envoi', () => {
    const onSave = vi.fn();
    const props = {
      maps: [{ id: 'foret', label: 'Forêt' }],
      activeMapId: 'foret',
      mode: 'edit-points',
      isTeacher: true,
      drawPointsCount: 0,
      editZoneName: 'Mare',
      editCanUndo: false,
      canManageMarkerPositions: false,
      markerPositionUnlocked: false,
      isCoarsePointer: false,
      mobileInteractionsActive: false,
      showLabels: true,
      containerRef: { current: null },
      txRef: { current: { s: 1 } },
      onMapChange: () => {},
      onModeButtonClick: () => {},
      onUndoEditPoints: () => {},
      onSaveEditPoints: onSave,
      onExitEditPoints: () => {},
      onToggleMapInteraction: () => {},
      onToggleLabels: () => {},
      fitMap: () => {},
      animateZoomTowardScale: () => {},
    };
    const { rerender } = render(<MapViewToolbar {...props} editPointsSaving />);
    const busy = screen.getByRole('button', { name: /Enregistrement…/ });
    expect(busy.disabled).toBe(true);
    fireEvent.click(busy);
    expect(onSave).not.toHaveBeenCalled();
    rerender(<MapViewToolbar {...props} editPointsSaving={false} />);
    const idle = screen.getByRole('button', { name: /^Enregistrer$/ });
    expect(idle.disabled).toBe(false);
  });
});

describe('C6 — signalement du plan des personnels', () => {
  it('envoie la carte affichée', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      await submitPlaceSuggestion({
        contextType: 'zone',
        contextId: 'z1',
        body: 'Prise cassée',
        mapId: 'batiment-b',
      });
      const [, init] = fetchMock.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        contextType: 'zone',
        contextId: 'z1',
        body: 'Prise cassée',
        mapId: 'batiment-b',
      });
      // Carte inconnue : rien d'envoyé, le serveur garde la carte par défaut.
      await submitPlaceSuggestion({ contextType: 'zone', contextId: 'z1', body: 'x' });
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty('mapId');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
