import { describe, test, expect } from 'vitest';
import {
  HEADING_UP_COVER_SCALE,
  headingDeltaDeg,
  headingSmoothAlpha,
  smoothHeadingOverTime,
  unwrapHeadingDeg,
  headingUpCoverScaleMultiplier,
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

  test('headingUpCoverScaleMultiplier : 0° → 1, 45° → √2, 90° → 1', () => {
    expect(headingUpCoverScaleMultiplier(0)).toBeCloseTo(1, 5);
    expect(headingUpCoverScaleMultiplier(45)).toBeCloseTo(Math.SQRT2, 5);
    expect(headingUpCoverScaleMultiplier(90)).toBeCloseTo(1, 5);
    expect(headingUpCoverScaleMultiplier(-45)).toBeCloseTo(Math.SQRT2, 5);
    expect(HEADING_UP_COVER_SCALE).toBeCloseTo(Math.SQRT2, 5);
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

/**
 * Le lissage à alpha fixe dépendait de la cadence du capteur : nerveux sur un appareil qui émet
 * soixante fois par seconde, mou sur un appareil qui en émet cinq. À constante de temps, le même
 * réglage donne le même comportement partout — c'est ce que vérifient ces cas.
 */
describe('lissage de cap à constante de temps', () => {
  test('headingSmoothAlpha ne dépend que du temps écoulé', () => {
    expect(headingSmoothAlpha(0)).toBeCloseTo(0, 6);
    // Une constante de temps comble ~63 % de l'écart.
    expect(headingSmoothAlpha(220, 220)).toBeCloseTo(0.632, 3);
    expect(headingSmoothAlpha(10_000, 220)).toBeCloseTo(1, 3);
  });

  test('deux petits pas valent un grand : la cadence du capteur ne change rien', () => {
    const enUnPas = smoothHeadingOverTime(0, 90, 200, { tauMs: 200, deadBandDeg: 0 });
    let enDixPas = 0;
    for (let i = 0; i < 10; i += 1) {
      enDixPas = smoothHeadingOverTime(enDixPas, 90, 20, { tauMs: 200, deadBandDeg: 0 });
    }
    expect(Math.abs(enDixPas - enUnPas)).toBeLessThan(1.5);
  });

  test('la bande morte ignore le bruit sous le degré', () => {
    expect(smoothHeadingOverTime(100, 100.4, 120, { deadBandDeg: 1 })).toBe(100);
    expect(smoothHeadingOverTime(100, 140, 120, { deadBandDeg: 1 })).toBeGreaterThan(100);
  });

  test('le premier échantillon est adopté tel quel, normalisé', () => {
    expect(smoothHeadingOverTime(null, 400, 120)).toBe(40);
    expect(smoothHeadingOverTime(30, null, 120)).toBe(30);
  });

  test('headingDeltaDeg prend toujours le chemin le plus court', () => {
    expect(headingDeltaDeg(350, 10)).toBe(20);
    expect(headingDeltaDeg(10, 350)).toBe(-20);
    expect(headingDeltaDeg(0, 180)).toBe(180);
  });

  test('unwrapHeadingDeg garde un angle continu — pas de tour complet à l’envers', () => {
    // 359° → 1° : une transition CSS doit aller à 361°, pas revenir à 1°.
    expect(unwrapHeadingDeg(359, 1)).toBe(361);
    expect(unwrapHeadingDeg(361, 359)).toBe(359);
    expect(unwrapHeadingDeg(null, 42)).toBe(42);
    expect(unwrapHeadingDeg(42, null)).toBe(42);
  });

  test('mapOrientationStyle n’anime que si on le lui demande', () => {
    expect(mapOrientationStyle(30, null).transition).toBe(undefined);
    const anime = mapOrientationStyle(30, null, { animated: true });
    expect(anime.transition).toBe('transform 180ms linear');
    expect(anime.willChange).toBe('transform');
    expect(mapOrientationStyle(-725, null, { animated: true }).transform).toBe('rotate(-725deg)');
  });
});
