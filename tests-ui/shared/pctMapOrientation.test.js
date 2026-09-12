import { describe, test, expect } from 'vitest';
import {
  headingUpOrientationDeg,
  mapOrientationStyle,
  rotatePointAround,
  smoothHeadingDeg,
  unrotatePointAround,
} from '../../src/shared/pct-map/pctMapOrientation.js';
import { pointToContainedRectPct } from '../../src/shared/pct-map/pctMapPointer.js';

describe('pctMapOrientation', () => {
  test('smoothHeadingDeg gère le passage 350→10', () => {
    const s = smoothHeadingDeg(350, 10, 0.5);
    expect(s).toBeCloseTo(0, 0);
  });

  test('headingUpOrientationDeg inverse le cap écran', () => {
    expect(headingUpOrientationDeg(90)).toBe(-90);
    expect(headingUpOrientationDeg(null)).toBe(0);
  });

  test('mapOrientationStyle null si angle nul', () => {
    expect(mapOrientationStyle(0)).toBeNull();
    expect(mapOrientationStyle(45, { xp: 20, yp: 30 })).toEqual({
      transform: 'rotate(45deg)',
      transformOrigin: '20% 30%',
    });
  });

  test('rotate / unrotate sont inverses (sens CSS horaire)', () => {
    const p = rotatePointAround(10, 0, 0, 0, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(-10);
    const back = unrotatePointAround(p.x, p.y, 0, 0, 90);
    expect(back.x).toBeCloseTo(10);
    expect(back.y).toBeCloseTo(0);
  });
});

describe('pointToContainedRectPct + orientation', () => {
  test('inverse la rotation intérieure', () => {
    const stage = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
    };
    const fit = { offsetX: 0, offsetY: 0, width: 200, height: 200 };
    const transform = { x: 0, y: 0, s: 1 };
    const plain = pointToContainedRectPct({ clientX: 100, clientY: 100 }, stage, transform, fit, {
      clamp: true,
    });
    expect(plain.xp).toBeCloseTo(50);
    expect(plain.yp).toBeCloseTo(50);

    // Rotation CSS 90° horaire autour du centre : le point écran (150,100) vient du
    // contenu (100,150) → 50 %, 75 %.
    const rotated = pointToContainedRectPct({ clientX: 150, clientY: 100 }, stage, transform, fit, {
      clamp: true,
      orientationDeg: 90,
      orientationOriginPct: { xp: 50, yp: 50 },
    });
    expect(rotated.xp).toBeCloseTo(50, 0);
    expect(rotated.yp).toBeCloseTo(75, 0);
  });
});
