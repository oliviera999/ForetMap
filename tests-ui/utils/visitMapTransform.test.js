import { describe, test, expect } from 'vitest';
import {
  VISIT_MAP_SCALE_MIN,
  VISIT_MAP_SCALE_MAX,
  clampVisitMapScale,
  clampVisitMapTransform,
  zoomVisitTransformToScale,
} from '../../src/utils/visitMapTransform.js';

const RECT = { width: 400, height: 300 };

describe('clampVisitMapScale', () => {
  test('borne l’échelle dans [1, 6]', () => {
    expect(clampVisitMapScale(0.3)).toBe(VISIT_MAP_SCALE_MIN);
    expect(clampVisitMapScale(2.5)).toBe(2.5);
    expect(clampVisitMapScale(42)).toBe(VISIT_MAP_SCALE_MAX);
  });

  test('valeurs non numériques ou nulles → échelle minimale', () => {
    expect(clampVisitMapScale(undefined)).toBe(1);
    expect(clampVisitMapScale(NaN)).toBe(1);
    expect(clampVisitMapScale(0)).toBe(1);
    expect(clampVisitMapScale('abc')).toBe(1);
  });
});

describe('clampVisitMapTransform', () => {
  test('échelle 1 ou rect absent → recentrage (x=0, y=0)', () => {
    expect(clampVisitMapTransform({ x: -50, y: -50, s: 1 }, RECT)).toEqual({ x: 0, y: 0, s: 1 });
    expect(clampVisitMapTransform({ x: -50, y: -50, s: 2 }, null)).toEqual({ x: 0, y: 0, s: 2 });
    expect(clampVisitMapTransform({ x: -50, y: -50, s: 2 }, { width: 0, height: 300 }))
      .toEqual({ x: 0, y: 0, s: 2 });
  });

  test('translation bornée au cadre : jamais positive, jamais au-delà du débord', () => {
    // s=2 sur 400×300 → x ∈ [-400, 0], y ∈ [-300, 0].
    expect(clampVisitMapTransform({ x: 25, y: 10, s: 2 }, RECT)).toEqual({ x: 0, y: 0, s: 2 });
    expect(clampVisitMapTransform({ x: -999, y: -999, s: 2 }, RECT)).toEqual({ x: -400, y: -300, s: 2 });
    expect(clampVisitMapTransform({ x: -120, y: -80, s: 2 }, RECT)).toEqual({ x: -120, y: -80, s: 2 });
  });

  test('échelle hors bornes : transform résultant borné aussi', () => {
    expect(clampVisitMapTransform({ x: -10, y: -10, s: 0.4 }, RECT)).toEqual({ x: 0, y: 0, s: 1 });
    const out = clampVisitMapTransform({ x: -10, y: -10, s: 99 }, RECT);
    expect(out.s).toBe(6);
    expect(out.x).toBe(-10);
    expect(out.y).toBe(-10);
  });
});

describe('zoomVisitTransformToScale', () => {
  test('garde le point ciblé visuellement fixe (formule px − (px − x)·ratio)', () => {
    const from = { x: -40, y: -20, s: 2 };
    const out = zoomVisitTransformToScale(from, 100, 80, 4, RECT);
    expect(out.s).toBe(4);
    expect(out.x).toBe(100 - (100 - -40) * 2); // ratio = 4/2
    expect(out.y).toBe(80 - (80 - -20) * 2);
  });

  test('échelle cible bornée, puis transform clampé au cadre', () => {
    const from = { x: 0, y: 0, s: 1 };
    // Cible 99 → bornée à 6 ; zoom au coin (0,0) ne crée pas de translation positive.
    const out = zoomVisitTransformToScale(from, 0, 0, 99, RECT);
    expect(out).toEqual({ x: 0, y: 0, s: 6 });
  });

  test('dézoom complet → recentrage à l’échelle 1', () => {
    const from = { x: -120, y: -90, s: 3 };
    expect(zoomVisitTransformToScale(from, 200, 150, 0.2, RECT)).toEqual({ x: 0, y: 0, s: 1 });
  });

  test('facteur neutre (même échelle) ne déplace pas le plan', () => {
    const from = { x: -60, y: -30, s: 2 };
    expect(zoomVisitTransformToScale(from, 123, 45, 2, RECT)).toEqual({ x: -60, y: -30, s: 2 });
  });

  test('pinch : équivaut au zoom autour du point médian depuis l’état de départ', () => {
    const start = { x: -20, y: -10, s: 1.5 };
    const distRatio = 220 / 110; // doigts écartés ×2
    const out = zoomVisitTransformToScale(start, 180, 140, start.s * distRatio, RECT);
    expect(out.s).toBe(3);
    expect(out.x).toBeCloseTo(180 - (180 - -20) * 2, 10); // −220, dans [−800, 0]
    expect(out.y).toBeCloseTo(140 - (140 - -10) * 2, 10); // −160, dans [−600, 0]
  });
});
