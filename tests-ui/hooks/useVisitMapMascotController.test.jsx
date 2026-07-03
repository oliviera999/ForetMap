// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { useRef } from 'react';
import {
  useVisitMapMascotController,
  VISIT_MAP_MASCOT_MOVE_MS,
  VISIT_MAP_MASCOT_HAPPY_MS,
  VISIT_MASCOT_DIALOG_MS,
} from '../../src/hooks/useVisitMapMascotController.js';

/** Harnais reproduisant l'usage réel (visit-views.jsx). */
function Harness({
  apiRef,
  mapId = 'foret',
  loading = false,
  content = { markers: [], mascot_packs: [] },
  prefersReducedMotion = false,
  setSelected = () => {},
  setSelectedType = () => {},
}) {
  const visitMapFitRef = useRef({ height: 600 });
  apiRef.current = useVisitMapMascotController({
    mapId,
    loading,
    content,
    prefersReducedMotion,
    profileVisitMascotId: null,
    visitMapFitRef,
    viewportFitHeight: 600,
    setSelected,
    setSelectedType,
  });
  return null;
}

function renderHarness(overrides = {}) {
  const apiRef = { current: null };
  const props = { apiRef, ...overrides };
  const view = render(<Harness {...props} />);
  const rerenderWith = (next = {}) => view.rerender(<Harness {...props} {...next} />);
  return { apiRef, rerenderWith, ...view };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useVisitMapMascotController', () => {
  it('placement initial : position posée une fois par carte et persistée', () => {
    const { apiRef, rerenderWith } = renderHarness();
    const start = apiRef.current.visitMapMascotRenderPct;
    expect(Number.isFinite(start.xp)).toBe(true);
    expect(Number.isFinite(start.yp)).toBe(true);

    // Déplacement puis re-render de la même carte : pas de re-placement.
    act(() => apiRef.current.moveVisitMapMascotTo(80, 60));
    const moved = apiRef.current.visitMapMascotRenderPct;
    rerenderWith({ loading: false });
    expect(apiRef.current.visitMapMascotRenderPct).toEqual(moved);
  });

  it('moveVisitMapMascotTo : marche pendant VISIT_MAP_MASCOT_MOVE_MS puis retombe, bulle « move » pendant VISIT_MASCOT_DIALOG_MS', () => {
    const { apiRef } = renderHarness();

    act(() => apiRef.current.moveVisitMapMascotTo(80, 60));

    expect(apiRef.current.visitMapMascotWalking).toBe(true);
    // Distance > 4 : une bulle de dialogue « move » (défauts du catalogue) est affichée.
    expect(apiRef.current.visitMascotDialogVisible).toBe(true);
    expect(String(apiRef.current.visitMascotDialog).length).toBeGreaterThan(0);

    act(() => vi.advanceTimersByTime(VISIT_MAP_MASCOT_MOVE_MS - 1));
    expect(apiRef.current.visitMapMascotWalking).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(apiRef.current.visitMapMascotWalking).toBe(false);

    act(() => vi.advanceTimersByTime(VISIT_MASCOT_DIALOG_MS - VISIT_MAP_MASCOT_MOVE_MS));
    expect(apiRef.current.visitMascotDialogVisible).toBe(false);
  });

  it('moveVisitMapMascotTo : pas de marche en mouvement réduit, position mise à jour quand même', () => {
    const { apiRef } = renderHarness({ prefersReducedMotion: true });
    const before = apiRef.current.visitMapMascotRenderPct;

    act(() => apiRef.current.moveVisitMapMascotTo(80, 60));

    expect(apiRef.current.visitMapMascotWalking).toBe(false);
    expect(apiRef.current.visitMapMascotRenderPct).not.toEqual(before);
  });

  it('scheduleVisitDetailPanelOpen : sélection différée de la durée du déplacement', () => {
    const setSelected = vi.fn();
    const setSelectedType = vi.fn();
    const { apiRef } = renderHarness({ setSelected, setSelectedType });
    const fromPct = { ...apiRef.current.visitMapMascotPctRef.current };
    const item = { id: 5 };

    act(() => {
      apiRef.current.moveVisitMapMascotTo(80, 60);
      apiRef.current.scheduleVisitDetailPanelOpen(item, 'marker', 80, 60, fromPct);
    });
    expect(setSelected).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(VISIT_MAP_MASCOT_MOVE_MS));
    expect(setSelected).toHaveBeenCalledWith(item);
    expect(setSelectedType).toHaveBeenCalledWith('marker');
  });

  it('scheduleVisitDetailPanelOpen : immédiate en mouvement réduit ; annulable via cancelScheduledDetailPanelOpen', () => {
    const setSelected = vi.fn();
    const reduced = renderHarness({ prefersReducedMotion: true, setSelected });
    act(() => {
      reduced.apiRef.current.scheduleVisitDetailPanelOpen({ id: 1 }, 'zone', 80, 60, {
        xp: 10,
        yp: 10,
      });
    });
    expect(setSelected).toHaveBeenCalledWith({ id: 1 });
    reduced.unmount();

    const cancelled = vi.fn();
    const normal = renderHarness({ setSelected: cancelled });
    const fromPct = { ...normal.apiRef.current.visitMapMascotPctRef.current };
    act(() => {
      normal.apiRef.current.moveVisitMapMascotTo(80, 60);
      normal.apiRef.current.scheduleVisitDetailPanelOpen({ id: 2 }, 'zone', 80, 60, fromPct);
      normal.apiRef.current.cancelScheduledDetailPanelOpen();
    });
    act(() => vi.advanceTimersByTime(VISIT_MAP_MASCOT_MOVE_MS + 10));
    expect(cancelled).not.toHaveBeenCalled();
  });

  it('onMascotSeenCelebration : joie pendant VISIT_MAP_MASCOT_HAPPY_MS + bulle forcée « mark_seen »', () => {
    const { apiRef } = renderHarness();

    act(() => apiRef.current.onMascotSeenCelebration());

    expect(apiRef.current.visitMapMascotHappy).toBe(true);
    expect(apiRef.current.visitMascotDialogVisible).toBe(true);
    act(() => vi.advanceTimersByTime(VISIT_MAP_MASCOT_HAPPY_MS));
    expect(apiRef.current.visitMapMascotHappy).toBe(false);
  });

  it('changement de carte : minuteries coupées, marche/joie/bulle réinitialisées et re-placement', () => {
    const { apiRef, rerenderWith } = renderHarness();
    act(() => {
      apiRef.current.moveVisitMapMascotTo(80, 60);
      apiRef.current.onMascotSeenCelebration();
    });
    expect(apiRef.current.visitMapMascotWalking).toBe(true);
    expect(apiRef.current.visitMapMascotHappy).toBe(true);

    act(() => rerenderWith({ mapId: 'mare', content: { markers: [], mascot_packs: [] } }));

    expect(apiRef.current.visitMapMascotWalking).toBe(false);
    expect(apiRef.current.visitMapMascotHappy).toBe(false);
    expect(apiRef.current.visitMascotDialogVisible).toBe(false);
    // Avancer les anciens timers ne doit rien réactiver.
    act(() => vi.advanceTimersByTime(VISIT_MASCOT_DIALOG_MS + VISIT_MAP_MASCOT_HAPPY_MS));
    expect(apiRef.current.visitMapMascotHappy).toBe(false);
  });
});
