// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import {
  useMapGestures,
  MAP_VIEW_SCALE_MIN,
  MAP_VIEW_SCALE_MAX,
} from '../../src/hooks/useMapGestures.js';

vi.mock('../../src/services/api', () => ({ api: vi.fn(() => Promise.resolve({})) }));

/** Harnais minimal reproduisant l'usage réel (map-views.jsx) : conteneur + monde + image. */
function Harness({ apiRef, renders, mapImageSrc = 'plan.png', onRefresh = () => {} }) {
  const api = useMapGestures({
    mapImageSrc,
    activeMapId: 'map-1',
    mode: 'view',
    onRefresh,
  });
  apiRef.current = api;
  renders.count += 1;
  return (
    <div ref={api.containerRef} data-testid="canvas">
      <div ref={api.worldRef}>
        <img ref={api.imgRef} src={mapImageSrc} alt="" />
      </div>
    </div>
  );
}

/** Événement tactile synthétique (jsdom n'expose pas TouchEvent). */
function touchEvent(type, touches) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  e.touches = touches;
  return e;
}

describe('useMapGestures', () => {
  let rafQueue;

  const flushRaf = () => {
    const q = rafQueue.splice(0);
    q.forEach((cb) => {
      if (cb) cb(performance.now());
    });
  };

  const setup = (props = {}) => {
    const apiRef = { current: null };
    const renders = { count: 0 };
    const view = render(<Harness apiRef={apiRef} renders={renders} {...props} />);
    const canvas = view.getByTestId('canvas');
    return { apiRef, renders, canvas, ...view };
  };

  beforeEach(() => {
    rafQueue = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => {
      if (id >= 1 && id <= rafQueue.length) rafQueue[id - 1] = null;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("retourne une API mémoïsée : mêmes identités de fonctions d'un rendu à l'autre", () => {
    const onRefresh = () => {};
    const { apiRef, rerender } = setup({ onRefresh });
    const first = apiRef.current;
    // Force un re-render avec les mêmes props.
    rerender(
      <Harness
        apiRef={apiRef}
        renders={{ count: 0 }}
        mapImageSrc="plan.png"
        onRefresh={onRefresh}
      />,
    );
    const second = apiRef.current;
    for (const key of [
      'applyTransform',
      'commit',
      'fitMap',
      'remeasureMap',
      'toImagePct',
      'beginMarkerDrag',
      'toggleMapInteraction',
      'animateZoomTowardScale',
    ]) {
      expect(second[key], `identité stable attendue pour ${key}`).toBe(first[key]);
    }
  });

  it('clampe le pinch sur MAP_VIEW_SCALE_MAX (8) comme la molette et les boutons', () => {
    const { apiRef, canvas } = setup();
    act(() => {
      canvas.dispatchEvent(
        touchEvent('touchstart', [
          { clientX: 0, clientY: 0 },
          { clientX: 10, clientY: 0 },
        ]),
      );
    });
    act(() => {
      canvas.dispatchEvent(
        touchEvent('touchmove', [
          { clientX: 0, clientY: 0 },
          { clientX: 1000, clientY: 0 },
        ]),
      );
    });
    expect(apiRef.current.tx.current.s).toBe(MAP_VIEW_SCALE_MAX);
    expect(MAP_VIEW_SCALE_MAX).toBe(8);
  });

  it('clampe le pinch sur MAP_VIEW_SCALE_MIN (0.15)', () => {
    const { apiRef, canvas } = setup();
    act(() => {
      canvas.dispatchEvent(
        touchEvent('touchstart', [
          { clientX: 0, clientY: 0 },
          { clientX: 1000, clientY: 0 },
        ]),
      );
    });
    act(() => {
      canvas.dispatchEvent(
        touchEvent('touchmove', [
          { clientX: 0, clientY: 0 },
          { clientX: 10, clientY: 0 },
        ]),
      );
    });
    expect(apiRef.current.tx.current.s).toBe(MAP_VIEW_SCALE_MIN);
  });

  it("garde la même identité d'imgSize quand l'image recharge des dimensions identiques", () => {
    const { apiRef } = setup();
    const img = apiRef.current.imgRef.current;
    Object.defineProperty(img, 'naturalWidth', { value: 640, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 480, configurable: true });
    act(() => {
      img.dispatchEvent(new Event('load'));
      flushRaf();
    });
    const sizeAfterFirstLoad = apiRef.current.imgSize;
    expect(sizeAfterFirstLoad).toEqual({ w: 640, h: 480 });
    act(() => {
      img.dispatchEvent(new Event('load'));
      flushRaf();
    });
    // Identité conservée : l'effet de mesure keyé sur `imgSize` ne se remonte pas.
    expect(apiRef.current.imgSize).toBe(sizeAfterFirstLoad);
  });
});
