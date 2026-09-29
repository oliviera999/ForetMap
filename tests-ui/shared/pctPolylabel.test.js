import { describe, expect, test } from 'vitest';

import {
  polygonCentroidPct,
  polygonPoleOfInaccessibilityPct,
} from '../../src/shared/pct-map/pctPolylabel.js';

/** Le point est-il dans le polygone ? (contrôle indépendant de l'implémentation testée) */
function pointInPolygon(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (
      a.yp > point.yp !== b.yp > point.yp &&
      point.xp < ((b.xp - a.xp) * (point.yp - a.yp)) / (b.yp - a.yp) + a.xp
    ) {
      inside = !inside;
    }
  }
  return inside;
}

const SQUARE = [
  { xp: 0, yp: 0 },
  { xp: 100, yp: 0 },
  { xp: 100, yp: 100 },
  { xp: 0, yp: 100 },
];

/** Zone en L : son centroïde tombe **hors** du polygone — le cas qui motive ce module. */
const L_SHAPE = [
  { xp: 0, yp: 0 },
  { xp: 60, yp: 0 },
  { xp: 60, yp: 20 },
  { xp: 20, yp: 20 },
  { xp: 20, yp: 60 },
  { xp: 0, yp: 60 },
];

describe('polygonPoleOfInaccessibilityPct', () => {
  test('carré : le centre, à la distance du bord', () => {
    const pole = polygonPoleOfInaccessibilityPct(SQUARE);
    expect(pole.xp).toBeCloseTo(50, 1);
    expect(pole.yp).toBeCloseTo(50, 1);
    expect(pole.distance).toBeCloseTo(50, 1);
  });

  test('zone en L : le pôle est dedans là où le centroïde est dehors', () => {
    const centroid = polygonCentroidPct(L_SHAPE);
    expect(pointInPolygon(centroid, L_SHAPE)).toBe(false);
    const pole = polygonPoleOfInaccessibilityPct(L_SHAPE);
    expect(pointInPolygon(pole, L_SHAPE)).toBe(true);
    expect(pole.distance).toBeGreaterThan(0);
  });

  test('rectangle allongé : pôle sur l’axe médian', () => {
    const pole = polygonPoleOfInaccessibilityPct([
      { xp: 0, yp: 40 },
      { xp: 100, yp: 40 },
      { xp: 100, yp: 50 },
      { xp: 0, yp: 50 },
    ]);
    expect(pole.yp).toBeCloseTo(45, 0);
    expect(pole.distance).toBeCloseTo(5, 0);
  });

  test('précision : une valeur plus fine ne sort jamais du polygone', () => {
    const coarse = polygonPoleOfInaccessibilityPct(L_SHAPE, 2);
    const fine = polygonPoleOfInaccessibilityPct(L_SHAPE, 0.05);
    expect(pointInPolygon(coarse, L_SHAPE)).toBe(true);
    expect(pointInPolygon(fine, L_SHAPE)).toBe(true);
    expect(fine.distance).toBeGreaterThanOrEqual(coarse.distance - 1e-6);
  });

  test('géométries dégénérées : centroïde ou origine, jamais d’exception', () => {
    expect(polygonPoleOfInaccessibilityPct([])).toEqual({ xp: 0, yp: 0, distance: 0 });
    expect(polygonPoleOfInaccessibilityPct(null)).toEqual({ xp: 0, yp: 0, distance: 0 });
    expect(polygonPoleOfInaccessibilityPct([{ xp: 5, yp: 7 }])).toEqual({
      xp: 5,
      yp: 7,
      distance: 0,
    });
    const flat = polygonPoleOfInaccessibilityPct([
      { xp: 5, yp: 5 },
      { xp: 5, yp: 5 },
      { xp: 5, yp: 5 },
    ]);
    expect(flat).toEqual({ xp: 5, yp: 5, distance: 0 });
    expect(
      polygonPoleOfInaccessibilityPct([
        { xp: 'a', yp: 1 },
        { xp: 2, yp: 2 },
      ]),
    ).toEqual({
      xp: 2,
      yp: 2,
      distance: 0,
    });
  });
});

/**
 * Image non carrée — `docs/AUDIT_ETIQUETTES_ZONES_2026-09-29.md` constat 6.
 *
 * Sur une image 200 × 100 px, 1 % de largeur vaut 2 px et 1 % de hauteur 1 px. Zone en L (en
 * pixels) : bras horizontal épais de 30 px, bras vertical large de 60 px. Le bon point est dans
 * le bras vertical (≈ 30 px du bord) ; en pourcentages bruts, le calcul surestimait
 * l'épaisseur du bras horizontal et y posait l'étiquette (12,5 px du bord réel).
 */
describe('polygonPoleOfInaccessibilityPct — rapport largeur/hauteur', () => {
  const W = 200;
  const H = 100;
  const L_PX = [
    [0, 0],
    [160, 0],
    [160, 30],
    [60, 30],
    [60, 100],
    [0, 100],
  ];
  const lPct = L_PX.map(([x, y]) => ({ xp: (x / W) * 100, yp: (y / H) * 100 }));

  test('avec le rapport, le pôle est celui calculé en pixels', () => {
    const iso = polygonPoleOfInaccessibilityPct(lPct, undefined, W / H);
    const ref = polygonPoleOfInaccessibilityPct(L_PX.map(([x, y]) => ({ xp: x, yp: y })));
    expect((iso.xp / 100) * W).toBeCloseTo(ref.xp, 0);
    expect((iso.yp / 100) * H).toBeCloseTo(ref.yp, 0);
    // Distance exprimée en % de la hauteur, soit ici en pixels.
    expect(iso.distance).toBeCloseTo(ref.distance, 0);
    expect((iso.yp / 100) * H).toBeGreaterThan(30); // dans le bras vertical
  });

  test('sans le rapport, l’ancre tombait dans le bras étroit (défaut corrigé)', () => {
    const raw = polygonPoleOfInaccessibilityPct(lPct);
    expect((raw.yp / 100) * H).toBeLessThan(30);
  });

  test('rapport absent, nul ou non fini : comportement historique', () => {
    const base = polygonPoleOfInaccessibilityPct(L_SHAPE);
    expect(polygonPoleOfInaccessibilityPct(L_SHAPE, undefined, 0)).toEqual(base);
    expect(polygonPoleOfInaccessibilityPct(L_SHAPE, undefined, Number.NaN)).toEqual(base);
    expect(polygonPoleOfInaccessibilityPct(L_SHAPE, undefined, 1)).toEqual(base);
  });
});

describe('polygonCentroidPct', () => {
  test('carré : le centre ; polygone d’aire nulle : moyenne des sommets', () => {
    expect(polygonCentroidPct(SQUARE)).toEqual({ xp: 50, yp: 50 });
    expect(
      polygonCentroidPct([
        { xp: 0, yp: 0 },
        { xp: 10, yp: 0 },
        { xp: 20, yp: 0 },
      ]),
    ).toEqual({ xp: 10, yp: 0 });
  });
});
