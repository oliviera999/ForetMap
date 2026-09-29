// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMapViewHandoff } from '../../../src/components/map/useMapViewHandoff.js';

/** Canevas d'édition : cadre 400×300, image 1000×500 (ajustement 0,4), zoom ×4 centré sur (30 %, 40 %). */
const editProps = {
  committed: { x: 200 - 300 * 1.6, y: 150 - 200 * 1.6, s: 1.6 },
  stageSize: { w: 400, h: 300 },
  imgSize: { w: 1000, h: 500 },
  fitScale: 0.4,
};

function setup(initialShared) {
  const restoreView = vi.fn();
  const stageSnapshot = { xp: 70, yp: 20, zoom: 2 };
  const workViewportApiRef = { current: { getViewSnapshot: () => stageSnapshot } };
  const hook = renderHook((props) => useMapViewHandoff(props), {
    initialProps: {
      ...editProps,
      useSharedViewStage: initialShared,
      restoreView,
      workViewportApiRef,
    },
  });
  const toggle = (useSharedViewStage) =>
    hook.rerender({ ...editProps, useSharedViewStage, restoreView, workViewportApiRef });
  return { ...hook, restoreView, stageSnapshot, toggle };
}

describe('useMapViewHandoff', () => {
  it('consultation → édition : la vue de la scène est restituée au canevas d’édition', () => {
    const { restoreView, stageSnapshot, toggle } = setup(true);
    expect(restoreView).not.toHaveBeenCalled();
    toggle(false);
    expect(restoreView).toHaveBeenCalledTimes(1);
    expect(restoreView).toHaveBeenCalledWith(stageSnapshot);
  });

  it('édition → consultation : vue transmise au rendu qui monte la scène, puis oubliée', () => {
    const seen = [];
    const restoreView = vi.fn();
    const workViewportApiRef = { current: {} };
    const { rerender } = renderHook(
      (props) => {
        const out = useMapViewHandoff(props);
        seen.push(out.stageInitialView);
        return out;
      },
      {
        initialProps: { ...editProps, useSharedViewStage: false, restoreView, workViewportApiRef },
      },
    );
    rerender({ ...editProps, useSharedViewStage: true, restoreView, workViewportApiRef });
    const handed = seen.find(Boolean);
    expect(handed.xp).toBeCloseTo(30);
    expect(handed.yp).toBeCloseTo(40);
    expect(handed.zoom).toBeCloseTo(4);
    expect(seen[seen.length - 1]).toBeNull();
  });
});
