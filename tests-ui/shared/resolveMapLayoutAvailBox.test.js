import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { resolveMapLayoutAvailBox } from '../../src/hooks/useMapGestures.js';

describe('resolveMapLayoutAvailBox', () => {
  beforeEach(() => {
    vi.stubGlobal('innerHeight', 800);
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('visualViewport', { height: 800, width: 1200 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('utilise le viewport en plein écran (sans .main dans le portail)', () => {
    const layer = document.createElement('div');
    layer.className = 'fm-map-fullscreen-layer';
    const outer = document.createElement('div');
    layer.style.width = '1200px';
    layer.style.height = '800px';
    layer.appendChild(outer);
    document.body.appendChild(layer);

    Object.defineProperty(outer, 'clientWidth', { value: 1200, configurable: true });
    Object.defineProperty(outer, 'clientHeight', { value: 0, configurable: true });

    const box = resolveMapLayoutAvailBox(outer, {
      embedded: true,
      padL: 0,
      padR: 0,
      padT: 0,
      padB: 0,
      mapFullscreen: true,
    });

    expect(box.availW).toBe(1200);
    expect(box.availH).toBe(800);
  });

  it('utilise mapFullscreen même avant que le portail ne soit dans le DOM', () => {
    const outer = document.createElement('div');
    document.body.appendChild(outer);
    Object.defineProperty(outer, 'clientWidth', { value: 0, configurable: true });
    Object.defineProperty(outer, 'clientHeight', { value: 0, configurable: true });

    const box = resolveMapLayoutAvailBox(outer, {
      embedded: true,
      padL: 0,
      padR: 0,
      padT: 0,
      padB: 0,
      mapFullscreen: true,
    });

    expect(box.availW).toBe(1200);
    expect(box.availH).toBe(800);
  });

  it('conserve la logique embarquée hors plein écran', () => {
    const main = document.createElement('main');
    main.className = 'main';
    const outer = document.createElement('div');
    main.appendChild(outer);
    document.body.appendChild(main);

    Object.defineProperty(outer, 'clientWidth', { value: 640, configurable: true });
    Object.defineProperty(outer, 'clientHeight', { value: 400, configurable: true });
    outer.getBoundingClientRect = () => ({
      top: 100,
      bottom: 500,
      left: 0,
      right: 640,
      width: 640,
      height: 400,
    });

    const box = resolveMapLayoutAvailBox(outer, {
      embedded: true,
      padL: 0,
      padR: 0,
      padT: 0,
      padB: 0,
    });

    expect(box.availW).toBe(640);
    expect(box.availH).toBe(400);
  });
});
