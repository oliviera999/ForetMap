// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { usePctMapViewport } from '../../src/shared/pct-map/usePctMapViewport.js';

/**
 * Harnais minimal : cadre + monde + image, comme les trois surfaces réelles (carte de
 * travail, Visite, plateaux G&L). jsdom ne mesure rien : le cadre est simulé par
 * `clientWidth/Height` et `getBoundingClientRect`, l'image par `naturalWidth/Height`.
 */
function Harness({ apiRef, renders, options = {} }) {
  const api = usePctMapViewport({ imageSrc: 'plan.png', ...options });
  apiRef.current = api;
  renders.count += 1;
  return (
    <div ref={api.containerRef} data-testid="canvas">
      <div ref={api.worldRef} data-testid="world">
        <img ref={api.imgRef} src="plan.png" alt="" data-testid="img" />
      </div>
    </div>
  );
}

function mockBox(el, w, h) {
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: w });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: h });
  el.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: w,
    bottom: h,
    width: w,
    height: h,
    x: 0,
    y: 0,
  });
}

function mockImage(img, w, h) {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: w });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: h });
  Object.defineProperty(img, 'complete', { configurable: true, value: true });
}

function pointer(type, props) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, pointerType: 'mouse', button: 0, ...props });
  return e;
}

function touch(type, touches) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  e.touches = touches;
  return e;
}

describe('usePctMapViewport', () => {
  let rafQueue;
  let now;

  const flushRaf = (times = 1) => {
    for (let i = 0; i < times; i += 1) {
      const q = rafQueue.splice(0);
      q.forEach((cb) => {
        if (cb) cb(now);
      });
    }
  };

  /** Monte le harnais et simule cadre 400×300 + image 1000×500 (mode image : fit 0,4). */
  const setup = (options = {}, { stage = [400, 300], image = [1000, 500] } = {}) => {
    const apiRef = { current: null };
    const renders = { count: 0 };
    const view = render(<Harness apiRef={apiRef} renders={renders} options={options} />);
    const canvas = view.getByTestId('canvas');
    const img = view.getByTestId('img');
    mockBox(canvas, stage[0], stage[1]);
    mockImage(img, image[0], image[1]);
    act(() => {
      img.dispatchEvent(new Event('load'));
    });
    return { apiRef, renders, canvas, img, world: view.getByTestId('world'), ...view };
  };

  beforeEach(() => {
    rafQueue = [];
    now = 1000;
    vi.stubGlobal('requestAnimationFrame', (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    });
    vi.stubGlobal('cancelAnimationFrame', (id) => {
      if (id >= 1 && id <= rafQueue.length) rafQueue[id - 1] = null;
    });
    vi.spyOn(performance, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('mode image : ajuste l’image au cadre (échelle < 1, centrée)', () => {
    const { apiRef } = setup();
    expect(apiRef.current.fitScale).toBeCloseTo(0.4);
    expect(apiRef.current.committed).toEqual({ x: 0, y: 50, s: 0.4 });
    expect(apiRef.current.imgSize).toEqual({ w: 1000, h: 500 });
  });

  it('mode scène : transformation identité et rectangle « contain » de l’image', () => {
    const { apiRef } = setup({ contentMode: 'stage' });
    expect(apiRef.current.committed).toEqual({ x: 0, y: 0, s: 1 });
    expect(apiRef.current.fitScale).toBe(1);
    expect(apiRef.current.fitRect).toEqual({ offsetX: 0, offsetY: 50, width: 400, height: 200 });
  });

  it("retourne une API mémoïsée d'un rendu à l'autre", () => {
    const { apiRef, rerender } = setup();
    const first = apiRef.current;
    rerender(<Harness apiRef={apiRef} renders={{ count: 0 }} />);
    expect(apiRef.current.fitMap).toBe(first.fitMap);
    expect(apiRef.current.toImagePct).toBe(first.toImagePct);
    expect(apiRef.current.animateZoomTowardScale).toBe(first.animateZoomTowardScale);
  });

  it('molette : zoom autour du pointeur, borné, un seul commit débouncé', () => {
    vi.useFakeTimers();
    const { apiRef, canvas, renders } = setup();
    const before = renders.count;
    act(() => {
      canvas.dispatchEvent(
        Object.assign(new Event('wheel', { cancelable: true }), {
          clientX: 200,
          clientY: 150,
          deltaY: -380,
          deltaMode: 0,
        }),
      );
    });
    expect(apiRef.current.tx.current.s).toBeCloseTo(0.4 * 1.38);
    expect(renders.count).toBe(before);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(apiRef.current.committed.s).toBeCloseTo(0.4 * 1.38);
    // Le contenu (1000×0.552 = 552 px) déborde du cadre : jamais de bord visible.
    expect(apiRef.current.committed.x).toBeLessThanOrEqual(0);
    expect(apiRef.current.committed.x).toBeGreaterThanOrEqual(400 - 552);
  });

  it('pan : élastique pendant le geste, retour en butée au relâchement, clic suivant ignoré', () => {
    vi.useFakeTimers();
    const { apiRef, canvas } = setup();
    act(() => {
      canvas.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 100 }));
    });
    now += 16;
    act(() => {
      canvas.dispatchEvent(pointer('pointermove', { clientX: 160, clientY: 100 }));
    });
    // Contenu (400 px large à s=0,4) = cadre : butée à x=0 ; +60 px demandés → 60 × 0,35.
    expect(apiRef.current.tx.current.x).toBeCloseTo(60 * 0.35);
    expect(apiRef.current.moved.current).toBe(true);
    now += 400; // relâchement lent : pas d'inertie
    act(() => {
      canvas.dispatchEvent(pointer('pointerup', { clientX: 160, clientY: 100 }));
    });
    expect(apiRef.current.consumeSkipClick()).toBe(true);
    expect(apiRef.current.consumeSkipClick()).toBe(false);
    // Retour animé en butée.
    now += 200;
    act(() => {
      flushRaf(3);
    });
    expect(apiRef.current.committed.x).toBeCloseTo(0);
  });

  it('pan hors bornes désactivé (bounds:false) : déplacement libre', () => {
    const { apiRef, canvas } = setup({ bounds: false, inertia: false });
    act(() => {
      canvas.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 100 }));
      canvas.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 250 }));
      canvas.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 250 }));
    });
    expect(apiRef.current.committed.x).toBeCloseTo(200);
    expect(apiRef.current.committed.y).toBeCloseTo(50 + 150);
  });

  it('inertie : un relâchement rapide continue le déplacement puis s’arrête dans les bornes', () => {
    const { apiRef, canvas } = setup();
    // Zoom d'abord pour avoir de la marge de déplacement.
    act(() => {
      apiRef.current.commit({ x: -300, y: -100, s: 1 });
    });
    act(() => {
      canvas.dispatchEvent(pointer('pointerdown', { clientX: 200, clientY: 150 }));
    });
    for (let i = 1; i <= 4; i += 1) {
      now += 16;
      act(() => {
        canvas.dispatchEvent(pointer('pointermove', { clientX: 200 + i * 20, clientY: 150 }));
      });
    }
    const beforeRelease = apiRef.current.tx.current.x;
    act(() => {
      canvas.dispatchEvent(pointer('pointerup', { clientX: 280, clientY: 150 }));
    });
    let steps = 0;
    while (rafQueue.some(Boolean) && steps < 300) {
      now += 16;
      act(() => {
        flushRaf();
      });
      steps += 1;
    }
    expect(apiRef.current.committed.x).toBeGreaterThan(beforeRelease);
    expect(apiRef.current.committed.x).toBeLessThanOrEqual(0);
    expect(apiRef.current.committed.x).toBeGreaterThanOrEqual(400 - 1000);
  });

  it('pinch : échelle proportionnelle à l’écartement, bornée à maxScale, médian vivant', () => {
    const { apiRef, canvas } = setup({ maxScale: 8 });
    act(() => {
      canvas.dispatchEvent(
        touch('touchstart', [
          { clientX: 150, clientY: 150 },
          { clientX: 250, clientY: 150 },
        ]),
      );
      canvas.dispatchEvent(
        touch('touchmove', [
          { clientX: 100, clientY: 150 },
          { clientX: 300, clientY: 150 },
        ]),
      );
    });
    expect(apiRef.current.tx.current.s).toBeCloseTo(0.8);
    act(() => {
      canvas.dispatchEvent(
        touch('touchmove', [
          { clientX: -3000, clientY: 150 },
          { clientX: 3000, clientY: 150 },
        ]),
      );
    });
    expect(apiRef.current.tx.current.s).toBe(8);
    act(() => {
      canvas.dispatchEvent(touch('touchend', []));
    });
    now += 200;
    act(() => {
      flushRaf(3);
    });
    expect(apiRef.current.committed.s).toBe(8);
    expect(apiRef.current.interactionEnabled).toBe(true);
  });

  it('double-tap tactile : zoome vers ajustement × facteur, second double-tap réajuste', () => {
    const { apiRef, canvas } = setup({ doubleTapZoomFactor: 2.5 });
    const tap = () => {
      canvas.dispatchEvent(
        pointer('pointerdown', { clientX: 200, clientY: 150, pointerType: 'touch' }),
      );
      canvas.dispatchEvent(
        pointer('pointerup', { clientX: 200, clientY: 150, pointerType: 'touch' }),
      );
    };
    act(() => {
      tap();
      now += 120;
      tap();
    });
    now += 250;
    act(() => {
      flushRaf(4);
    });
    expect(apiRef.current.committed.s).toBeCloseTo(0.4 * 2.5);
    now += 400;
    act(() => {
      tap();
      now += 120;
      tap();
    });
    now += 250;
    act(() => {
      flushRaf(4);
    });
    expect(apiRef.current.committed.s).toBeCloseTo(0.4);
  });

  it('toImagePct : conversion pointeur → % image dans les deux modes', () => {
    const image = setup();
    // Fit 0,4 : image 400×200 à (0,50). Point (200,150) → (50 %, 50 %).
    expect(image.apiRef.current.toImagePct(200, 150)).toEqual({ xp: 50, yp: 50 });
    expect(image.apiRef.current.toImagePct(0, 0).yp).toBeLessThan(0);
    expect(image.apiRef.current.toImagePct(0, 0, { clamp: true }).yp).toBe(0);
    image.unmount();
    const scene = setup({ contentMode: 'stage' });
    expect(scene.apiRef.current.toImagePct(200, 150)).toEqual({ xp: 50, yp: 50 });
    expect(scene.apiRef.current.toImagePct(400, 250)).toEqual({ xp: 100, yp: 100 });
  });

  it('focusOnPct centre le point demandé (animation jouée jusqu’au bout)', () => {
    const { apiRef } = setup();
    act(() => {
      apiRef.current.focusOnPct({ xp: 100, yp: 100 }, { targetScale: 1 });
    });
    now += 300;
    act(() => {
      flushRaf(4);
    });
    // Coin bas-droit de l'image (1000,500) au centre (200,150) → x=−800, y=−350 ; borné à x∈[−600,0], y∈[−200,0].
    expect(apiRef.current.committed).toEqual({ x: -600, y: -200, s: 1 });
  });

  it('glisser externe : suit le pointeur en % image et rend la position finale', () => {
    const { apiRef, canvas } = setup();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const marker = document.createElement('div');
    act(() => {
      apiRef.current.beginExternalDrag(marker, 1, { onMove, onEnd });
      canvas.dispatchEvent(pointer('pointermove', { clientX: 100, clientY: 100 }));
      canvas.dispatchEvent(pointer('pointermove', { clientX: 200, clientY: 150 }));
      canvas.dispatchEvent(pointer('pointerup', { clientX: 200, clientY: 150 }));
    });
    expect(onMove).toHaveBeenCalledTimes(2);
    expect(onEnd).toHaveBeenCalledWith({ xp: 50, yp: 50 }, expect.anything());
    // La vue n'a pas bougé.
    expect(apiRef.current.committed).toEqual({ x: 0, y: 50, s: 0.4 });
  });

  it('cibles exclues : aucun pan démarré depuis une poignée', () => {
    const { apiRef, canvas } = setup({
      isGestureTarget: (t) => Boolean(t.closest?.('.handle')),
      inertia: false,
    });
    const handle = document.createElement('button');
    handle.className = 'handle';
    canvas.appendChild(handle);
    act(() => {
      handle.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 100 }));
      canvas.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 100 }));
      canvas.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 100 }));
    });
    expect(apiRef.current.committed.x).toBe(0);
  });

  it('gestes désactivés (enabled:false) : molette et pan inertes, touchAction auto', () => {
    const { apiRef, canvas } = setup({ enabled: false });
    act(() => {
      canvas.dispatchEvent(
        Object.assign(new Event('wheel', { cancelable: true }), {
          clientX: 200,
          clientY: 150,
          deltaY: -100,
          deltaMode: 0,
        }),
      );
      canvas.dispatchEvent(pointer('pointerdown', { clientX: 100, clientY: 100 }));
      canvas.dispatchEvent(pointer('pointermove', { clientX: 300, clientY: 100 }));
      canvas.dispatchEvent(pointer('pointerup', { clientX: 300, clientY: 100 }));
    });
    expect(apiRef.current.tx.current).toEqual({ x: 0, y: 50, s: 0.4 });
    expect(apiRef.current.touchAction).toBe('auto');
  });

  it('verrou tactile : sur pointeur grossier, un doigt laisse défiler la page quand la carte est « verrouillée »', () => {
    const listeners = [];
    vi.stubGlobal('matchMedia', (query) => ({
      matches: query.includes('coarse'),
      addEventListener: (_, fn) => listeners.push(fn),
      removeEventListener: () => {},
    }));
    const { apiRef, canvas } = setup({ coarsePointerScrollLock: true, inertia: false });
    // Par défaut la carte est active (comme useMapGestures) : un doigt la déplace.
    expect(apiRef.current.isCoarsePointer).toBe(true);
    expect(apiRef.current.prefersPageScroll).toBe(false);
    expect(apiRef.current.touchAction).toBe('none');
    act(() => {
      apiRef.current.toggleInteraction();
    });
    expect(apiRef.current.prefersPageScroll).toBe(true);
    expect(apiRef.current.touchAction).toBe('pan-y');
    act(() => {
      canvas.dispatchEvent(
        pointer('pointerdown', { clientX: 100, clientY: 100, pointerType: 'touch' }),
      );
      canvas.dispatchEvent(
        pointer('pointermove', { clientX: 300, clientY: 100, pointerType: 'touch' }),
      );
      canvas.dispatchEvent(
        pointer('pointerup', { clientX: 300, clientY: 100, pointerType: 'touch' }),
      );
    });
    expect(apiRef.current.committed.x).toBe(0);
    // Un pinch réactive la carte.
    act(() => {
      canvas.dispatchEvent(
        touch('touchstart', [
          { clientX: 150, clientY: 150 },
          { clientX: 250, clientY: 150 },
        ]),
      );
      canvas.dispatchEvent(touch('touchend', []));
    });
    expect(apiRef.current.interactionEnabled).toBe(true);
    expect(apiRef.current.touchAction).toBe('none');
  });

  it('zoomBy / fitMapAnimated : boutons +/− et recentrage', () => {
    const { apiRef } = setup();
    act(() => {
      apiRef.current.zoomBy(2);
    });
    now += 300;
    act(() => {
      flushRaf(4);
    });
    expect(apiRef.current.committed.s).toBeCloseTo(0.8);
    act(() => {
      apiRef.current.fitMapAnimated();
    });
    now += 300;
    act(() => {
      flushRaf(4);
    });
    expect(apiRef.current.committed).toEqual({ x: 0, y: 50, s: 0.4 });
  });

  it('flèches clavier : pan borné, ignoré dans un champ de saisie', () => {
    vi.useFakeTimers();
    const { apiRef } = setup({ keyboardPan: true, inertia: false });
    act(() => {
      apiRef.current.commit({ x: -100, y: -50, s: 1 });
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      vi.advanceTimersByTime(100);
    });
    expect(apiRef.current.committed.x).toBe(-92);
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      vi.advanceTimersByTime(100);
    });
    expect(apiRef.current.committed.x).toBe(-92);
  });

  it('onResize « clamp » : un redimensionnement conserve la vue en la re-bornant', () => {
    vi.useFakeTimers();
    const { apiRef, canvas } = setup({ contentMode: 'stage', onResize: 'clamp' });
    act(() => {
      apiRef.current.commit({ x: -300, y: -200, s: 2 });
    });
    mockBox(canvas, 200, 150);
    act(() => {
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(200);
    });
    expect(apiRef.current.committed.s).toBe(2);
    expect(apiRef.current.committed.x).toBeGreaterThanOrEqual(200 - 400);
    expect(apiRef.current.stageSize).toEqual({ w: 200, h: 150 });
  });
});
