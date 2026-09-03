import { describe, test, expect } from 'vitest';
import {
  PCT_MAP_ELASTIC_RATIO,
  centerPctMapTransformOnPct,
  clampPctMapScale,
  clampPctMapTransform,
  elasticPctMapTransform,
  fitPctMapTransform,
  pctMapAxisRange,
  pctMapInertiaStep,
  pctMapReleaseVelocity,
  pctMapTransformEquals,
  pinchPctMapTransform,
  zoomPctMapTransformToScale,
} from '../../src/shared/pct-map/pctMapTransform.js';
import {
  clampVisitMapTransform,
  zoomVisitTransformToScale,
} from '../../src/utils/visitMapTransform.js';

const stage = { w: 400, h: 300 };
/** Mode « scène » (Visite / plateaux G&L) : contenu = cadre. */
const sceneBounds = { content: stage, stage, min: 1, max: 8 };
/** Mode « image » (carte de travail) : contenu = image en px naturels. */
const imageBounds = { content: { w: 1000, h: 500 }, stage, min: 0.15, max: 8 };

describe('clampPctMapScale / fitPctMapTransform', () => {
  test('borne dans [min, max], valeurs invalides → min', () => {
    expect(clampPctMapScale(0.05, { min: 0.15, max: 8 })).toBe(0.15);
    expect(clampPctMapScale(12, { min: 0.15, max: 8 })).toBe(8);
    expect(clampPctMapScale(NaN, { min: 0.5, max: 8 })).toBe(0.5);
    expect(clampPctMapScale(0, { min: 0.5, max: 8 })).toBe(0.5);
    expect(clampPctMapScale(3)).toBe(3);
  });

  test('ajustement : contenu entier visible et centré, jamais agrandi au-delà de 1', () => {
    const fit = fitPctMapTransform({ w: 1000, h: 500 }, stage);
    expect(fit.s).toBeCloseTo(0.4);
    expect(fit.x).toBeCloseTo(0);
    expect(fit.y).toBeCloseTo((300 - 200) / 2);
    const small = fitPctMapTransform({ w: 100, h: 100 }, stage);
    expect(small.s).toBe(1);
    expect(small.x).toBe(150);
    expect(small.y).toBe(100);
    expect(fitPctMapTransform({ w: 100, h: 100 }, stage, { maxFitScale: 2 }).s).toBe(2);
  });
});

describe('clampPctMapTransform (bornes « contain »)', () => {
  test('contenu plus grand que le cadre : jamais de bord visible', () => {
    expect(pctMapAxisRange(400, 400, 2)).toEqual({ lo: -400, hi: 0 });
    const t = clampPctMapTransform({ x: 50, y: -900, s: 2 }, sceneBounds);
    expect(t).toEqual({ x: 0, y: -300, s: 2 });
  });

  test('contenu plus petit que le cadre : reste entièrement dans le cadre (dézoom sous le cadre)', () => {
    expect(pctMapAxisRange(400, 400, 0.5)).toEqual({ lo: 0, hi: 200 });
    const t = clampPctMapTransform({ x: -10, y: 500, s: 0.5 }, { ...sceneBounds, min: 0.5 });
    expect(t).toEqual({ x: 0, y: 150, s: 0.5 });
  });

  test('sans cadre exploitable, seule l’échelle est bornée', () => {
    expect(
      clampPctMapTransform({ x: 5, y: 6, s: 20 }, { content: stage, stage: null, max: 8 }),
    ).toEqual({
      x: 5,
      y: 6,
      s: 8,
    });
  });

  test('équivaut à clampVisitMapTransform quand contenu = cadre et échelle ≥ 1', () => {
    const rect = { width: 400, height: 300 };
    for (const next of [
      { x: 30, y: -40, s: 1 },
      { x: -900, y: 20, s: 3 },
      { x: -100, y: -100, s: 1.5 },
      { x: 0, y: 0, s: 12 },
    ]) {
      expect(clampPctMapTransform(next, sceneBounds)).toEqual(clampVisitMapTransform(next, rect));
    }
  });

  test('élastique : une fraction du dépassement est restituée pendant le geste', () => {
    const raw = { x: 100, y: 0, s: 2 };
    const soft = elasticPctMapTransform(raw, sceneBounds);
    expect(soft.x).toBeCloseTo(100 * PCT_MAP_ELASTIC_RATIO);
    expect(soft.y).toBe(0);
    expect(elasticPctMapTransform({ x: -50, y: -50, s: 2 }, sceneBounds)).toEqual({
      x: -50,
      y: -50,
      s: 2,
    });
  });
});

describe('zoomPctMapTransformToScale / pinchPctMapTransform', () => {
  test('garde le point ciblé visuellement fixe puis borne', () => {
    const from = { x: -100, y: -50, s: 2 };
    const t = zoomPctMapTransformToScale(from, 200, 150, 4, sceneBounds);
    // Point contenu sous (200,150) : ((200+100)/2, (150+50)/2) = (150, 100) → à s=4 : x = 200 − 150·4 = −400.
    expect(t.s).toBe(4);
    expect(t.x).toBeCloseTo(-400);
    expect(t.y).toBeCloseTo(-250);
    expect(t).toEqual(zoomVisitTransformToScale(from, 200, 150, 4, { width: 400, height: 300 }));
  });

  test('dézoom complet en mode scène → recentrage à l’échelle 1', () => {
    expect(
      zoomPctMapTransformToScale({ x: -300, y: -200, s: 3 }, 10, 10, 0.2, sceneBounds),
    ).toEqual({
      x: 0,
      y: 0,
      s: 1,
    });
  });

  test('mode image : dézoom sous l’ajustement autorisé, contenu gardé dans le cadre', () => {
    const fit = fitPctMapTransform(imageBounds.content, stage);
    const t = zoomPctMapTransformToScale(fit, 200, 150, fit.s / 2, imageBounds);
    expect(t.s).toBeCloseTo(0.2);
    expect(t.x).toBeGreaterThanOrEqual(0);
    expect(t.x + 1000 * t.s).toBeLessThanOrEqual(400 + 1e-6);
  });

  test('pinch : le point sous le médian initial suit le médian courant (pinch + déplacement)', () => {
    const start = { x: 0, y: 0, s: 2 };
    const startMid = { x: 100, y: 100, dist: 100 };
    const mid = { x: 150, y: 120, dist: 150 };
    const t = pinchPctMapTransform(start, startMid, mid, sceneBounds);
    expect(t.s).toBeCloseTo(3);
    // Point contenu sous (100,100) à s=2 : (50,50) → sous (150,120) à s=3 : x = 150 − 150 = 0, y = 120 − 150 = −30.
    expect(t.x).toBeCloseTo(0);
    expect(t.y).toBeCloseTo(-30);
  });

  test('pinch sans mouvement du médian équivaut au zoom autour du médian', () => {
    const start = { x: -50, y: -20, s: 1.5 };
    const mid = { x: 120, y: 90, dist: 80 };
    const a = pinchPctMapTransform(start, mid, { ...mid, dist: 160 }, sceneBounds);
    const b = zoomPctMapTransformToScale(start, 120, 90, 3, sceneBounds);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(b.y);
    expect(a.s).toBeCloseTo(b.s);
  });
});

describe('centerPctMapTransformOnPct', () => {
  test('mode image : place le point % au centre du cadre à l’échelle demandée', () => {
    const t = centerPctMapTransformOnPct({ xp: 50, yp: 50 }, 1, imageBounds);
    expect(t.s).toBe(1);
    // Centre image (500,250) au centre cadre (200,150) → x = −300, y = −100.
    expect(t.x).toBe(-300);
    expect(t.y).toBe(-100);
  });

  test('mode scène : tient compte du rectangle « contain » de l’image', () => {
    const fitRect = { offsetX: 0, offsetY: 50, width: 400, height: 200 };
    const t = centerPctMapTransformOnPct({ xp: 0, yp: 0 }, 2, sceneBounds, fitRect);
    // Coin image (0,50) au centre (200,150) à s=2 → x = 200, y = 50 → borné à x=0, y=0.
    expect(t).toEqual({ x: 0, y: 0, s: 2 });
    const t2 = centerPctMapTransformOnPct({ xp: 100, yp: 100 }, 2, sceneBounds, fitRect);
    expect(t2).toEqual({ x: -400, y: -300, s: 2 });
  });
});

describe('inertie', () => {
  test('vitesse de relâchement sur la fenêtre récente uniquement', () => {
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 500, y: 0, t: 500 },
      { x: 520, y: 10, t: 560 },
      { x: 560, y: 30, t: 600 },
    ];
    const v = pctMapReleaseVelocity(samples);
    expect(v.vx).toBeCloseTo(60 / 100);
    expect(v.vy).toBeCloseTo(30 / 100);
    expect(pctMapReleaseVelocity([{ x: 0, y: 0, t: 0 }])).toEqual({ vx: 0, vy: 0 });
  });

  test('pas d’inertie : avance, freine, s’arrête en butée sans rebond', () => {
    const bounds = { ...sceneBounds };
    let state = { tx: { x: -100, y: -100, s: 2 }, velocity: { vx: 1, vy: 0 } };
    const first = pctMapInertiaStep(state.tx, state.velocity, 16, bounds);
    expect(first.tx.x).toBeGreaterThan(-100);
    expect(first.velocity.vx).toBeLessThan(1);
    expect(first.done).toBe(false);
    let steps = 0;
    state = first;
    while (!state.done && steps < 200) {
      state = pctMapInertiaStep(state.tx, state.velocity, 16, bounds);
      steps += 1;
    }
    expect(state.done).toBe(true);
    expect(state.tx.x).toBeLessThanOrEqual(0);
    expect(state.tx.x).toBeGreaterThanOrEqual(-400);
  });
});

test('pctMapTransformEquals tolère les écarts sous-pixel', () => {
  expect(pctMapTransformEquals({ x: 0.2, y: 0, s: 1 }, { x: 0, y: 0.3, s: 1.00001 })).toBe(true);
  expect(pctMapTransformEquals({ x: 2, y: 0, s: 1 }, { x: 0, y: 0, s: 1 })).toBe(false);
  expect(pctMapTransformEquals(null, { x: 0, y: 0, s: 1 })).toBe(false);
});
