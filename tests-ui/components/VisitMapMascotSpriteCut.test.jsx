// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import VisitMapMascotSpriteCut, {
  collectSpriteCutFrameUrls,
  whenSpriteCutSrcReady,
} from '../../src/components/VisitMapMascotSpriteCut.jsx';
import { VISIT_MASCOT_STATE } from '../../src/utils/visitMascotState.js';

vi.mock('../../src/shared/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: () => true,
}));

describe('collectSpriteCutFrameUrls', () => {
  it('agrège et déduplique toutes les frames de tous les états', () => {
    const urls = collectSpriteCutFrameUrls({
      stateFrames: {
        idle: { srcs: ['/a.png', '/b.png'] },
        walking: { srcs: ['/b.png', '/c.png'] },
        inspect: { srcs: [''] },
      },
    });
    expect(urls).toEqual(['/a.png', '/b.png', '/c.png']);
  });

  it('tolère un pack vide ou mal formé', () => {
    expect(collectSpriteCutFrameUrls(null)).toEqual([]);
    expect(collectSpriteCutFrameUrls({})).toEqual([]);
    expect(collectSpriteCutFrameUrls({ stateFrames: { idle: {} } })).toEqual([]);
  });
});

describe('whenSpriteCutSrcReady', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          this._src = '';
          this.complete = false;
          this.naturalWidth = 0;
          this.onload = null;
        }
        set src(v) {
          this._src = v;
          // Simule un asset déjà en cache : ready synchrone.
          this.complete = true;
          this.naturalWidth = 32;
          if (typeof this.onload === 'function') this.onload();
        }
        get src() {
          return this._src;
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applique synchronement si l’image est déjà complète', () => {
    const onReady = vi.fn();
    const cleanup = whenSpriteCutSrcReady('/cached.png', onReady);
    expect(onReady).toHaveBeenCalledWith('/cached.png');
    cleanup();
  });

  it('n’applique plus après cleanup', () => {
    let deferredOnload = null;
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          this.complete = false;
          this.naturalWidth = 0;
          this.onload = null;
        }
        set src(_v) {
          deferredOnload = () => {
            this.complete = true;
            this.naturalWidth = 16;
            if (typeof this.onload === 'function') this.onload();
          };
        }
      },
    );
    const onReady = vi.fn();
    const cleanup = whenSpriteCutSrcReady('/late.png', onReady);
    cleanup();
    deferredOnload?.();
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe('VisitMapMascotSpriteCut', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'Image',
      class {
        constructor() {
          this.complete = false;
          this.naturalWidth = 0;
          this.onload = null;
        }
        set src(v) {
          this._src = v;
          this.complete = true;
          this.naturalWidth = 40;
          queueMicrotask(() => {
            if (typeof this.onload === 'function') this.onload();
          });
        }
        get src() {
          return this._src;
        }
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const pack = {
    id: 'test-cut',
    renderer: 'sprite_cut',
    fallbackSilhouette: 'fox',
    spriteCut: {
      frameWidth: 40,
      frameHeight: 48,
      stateFrames: {
        idle: { srcs: ['/idle-0.png'], fps: 1 },
        walking: { srcs: ['/walk-0.png', '/walk-1.png'], fps: 8 },
        inspect: { srcs: ['/inspect-0.png'], fps: 3 },
      },
    },
  };

  it('garde l’ancienne frame peinte au changement d’état (pas de trou blanc)', async () => {
    const fallback = <span data-testid="fallback">fb</span>;
    const { container, rerender } = render(
      <VisitMapMascotSpriteCut
        mascotId="test-cut"
        mascotState={VISIT_MASCOT_STATE.IDLE}
        mascotConfig={pack}
        fallback={fallback}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('/idle-0.png');
    });

    await act(async () => {
      rerender(
        <VisitMapMascotSpriteCut
          mascotId="test-cut"
          mascotState={VISIT_MASCOT_STATE.INSPECT}
          mascotConfig={pack}
          fallback={fallback}
        />,
      );
    });

    // Pendant / juste après le rerender : une img reste peinte (idle ou inspect), jamais absente
    // si on avait déjà une frame — pas de phase blanche.
    expect(container.querySelector('img')).toBeTruthy();
    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe('/inspect-0.png');
    });
  });

  it('ne remonte pas le conteneur sprite via une key d’état', async () => {
    const { container, rerender } = render(
      <VisitMapMascotSpriteCut
        mascotId="test-cut"
        mascotState={VISIT_MASCOT_STATE.IDLE}
        mascotConfig={pack}
        fallback={<span>fb</span>}
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('.visit-map-mascot-sprite-cut')).toBeTruthy(),
    );
    const before = container.querySelector('.visit-map-mascot-sprite-cut');

    await act(async () => {
      rerender(
        <VisitMapMascotSpriteCut
          mascotId="test-cut"
          mascotState={VISIT_MASCOT_STATE.WALKING}
          mascotConfig={pack}
          fallback={<span>fb</span>}
        />,
      );
    });

    const after = container.querySelector('.visit-map-mascot-sprite-cut');
    // Même nœud DOM : plus de key={spriteAnimKey} qui détruisait l’img à chaque état.
    expect(after).toBe(before);
  });
});
