import { afterEach, describe, expect, test, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useMapImageEdgeSnap from '../../src/hooks/useMapImageEdgeSnap.js';

/**
 * jsdom ne décode pas les images et n'implémente pas le canvas 2D : on mocke `Image`
 * et `getContext`/`getImageData` pour éprouver la machine à états du hook (repos,
 * analyse, prêt, indisponible) sans dépendre d'un vrai navigateur.
 *
 * Le cache d'analyse est un module singleton : chaque cas utilise une URL de plan
 * distincte pour rester indépendant des autres.
 */
function installImageMock({ width = 40, height = 40, fail = false } = {}) {
  class MockImage {
    constructor() {
      this.onload = null;
      this.onerror = null;
    }

    removeAttribute() {}

    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        if (fail) {
          this.onerror?.(new Error('load'));
          return;
        }
        this.naturalWidth = width;
        this.naturalHeight = height;
        this.onload?.();
      });
    }

    get src() {
      return this._src;
    }
  }
  vi.stubGlobal('Image', MockImage);
}

/** Canvas mocké : bord vertical net au milieu de l'image (noir / blanc). */
function installCanvasMock({ withContext = true, tainted = false } = {}) {
  const ctx = {
    drawImage: vi.fn(),
    getImageData: vi.fn((_x, _y, w, h) => {
      if (tainted) {
        const err = new Error('SecurityError');
        err.name = 'SecurityError';
        throw err;
      }
      const data = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const value = x < w / 2 ? 0 : 255;
          const p = (y * w + x) * 4;
          data[p] = value;
          data[p + 1] = value;
          data[p + 2] = value;
          data[p + 3] = 255;
        }
      }
      return { data, width: w, height: h };
    }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(withContext ? ctx : null);
  return ctx;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useMapImageEdgeSnap', () => {
  test('aimant éteint : aucune analyse, aucun ancrage', () => {
    installImageMock();
    const ctx = installCanvasMock();
    const { result } = renderHook(() => useMapImageEdgeSnap({ src: '/plan-a.png', active: false }));
    expect(result.current.status).toBe('idle');
    expect(result.current.ready).toBe(false);
    expect(result.current.snapPoint({ xp: 50, yp: 50 })).toBeNull();
    expect(ctx.getImageData).not.toHaveBeenCalled();
  });

  test('aimant allumé : analyse puis ancrage sur la frontière détectée', async () => {
    installImageMock({ width: 40, height: 40 });
    installCanvasMock();
    const { result } = renderHook(() => useMapImageEdgeSnap({ src: '/plan-b.png', active: true }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    // Le bord est au milieu de l'image : un point à 65 % est ramené vers 50 %.
    const hit = result.current.snapPoint({ xp: 65, yp: 50 }, { radiusPct: 30 });
    expect(hit).not.toBeNull();
    expect(hit.xp).toBeGreaterThan(40);
    expect(hit.xp).toBeLessThan(60);

    // Trop loin du bord : rien à accrocher, le sommet reste où il est.
    expect(result.current.snapPoint({ xp: 95, yp: 50 }, { radiusPct: 2 })).toBeNull();
  });

  test('image d’un autre domaine (canvas souillé) → indisponible, sans exception', async () => {
    installImageMock();
    installCanvasMock({ tainted: true });
    const { result } = renderHook(() => useMapImageEdgeSnap({ src: '/plan-c.png', active: true }));
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.snapPoint({ xp: 50, yp: 50 })).toBeNull();
  });

  test('canvas 2D absent du navigateur → indisponible', async () => {
    installImageMock();
    installCanvasMock({ withContext: false });
    const { result } = renderHook(() => useMapImageEdgeSnap({ src: '/plan-d.png', active: true }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  test('image du plan illisible → indisponible', async () => {
    installImageMock({ fail: true });
    installCanvasMock();
    const { result } = renderHook(() => useMapImageEdgeSnap({ src: '/plan-e.png', active: true }));
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  test('Alt maintenu suspend l’aimant le temps d’un geste', async () => {
    installImageMock();
    installCanvasMock();
    const { result } = renderHook(() => useMapImageEdgeSnap({ src: '/plan-f.png', active: true }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.snapPoint({ xp: 65, yp: 50 }, { radiusPct: 30 })).not.toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', altKey: true }));
    });
    expect(result.current.altBypass).toBe(true);
    expect(result.current.snapPoint({ xp: 65, yp: 50 }, { radiusPct: 30 })).toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', altKey: false }));
    });
    expect(result.current.altBypass).toBe(false);
    expect(result.current.snapPoint({ xp: 65, yp: 50 }, { radiusPct: 30 })).not.toBeNull();
  });

  test('l’analyse d’un même plan n’est faite qu’une fois (cache par URL)', async () => {
    installImageMock();
    const ctx = installCanvasMock();
    const first = renderHook(() => useMapImageEdgeSnap({ src: '/plan-g.png', active: true }));
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    expect(ctx.getImageData).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useMapImageEdgeSnap({ src: '/plan-g.png', active: true }));
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(ctx.getImageData).toHaveBeenCalledTimes(1);
  });
});
