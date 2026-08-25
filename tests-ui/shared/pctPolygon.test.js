import { describe, test, expect } from 'vitest';
import {
  clampPctCoord,
  findNearestEdgeInsertion,
  insertPctPointAt,
  normalizePctPoint,
  projectPointOnSegmentPct,
  removePctPointAt,
} from '../../src/shared/pct-map/pctPolygon.js';

/**
 * Helpers partagés entre la carte du royaume (G&L) et l'édition de contour ForetMap.
 * Ils n'étaient couverts que pour `translateFeuilletZoneToPoint` (tests/pct-polygon.test.js) ;
 * l'insertion et la suppression de sommets sont désormais utilisées par les deux produits.
 */
const SQUARE = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('clampPctCoord / normalizePctPoint', () => {
  test('borne dans [0..100] et arrondit à 2 décimales par défaut', () => {
    expect(clampPctCoord(123.456)).toBe(100);
    expect(clampPctCoord(-4)).toBe(0);
    expect(clampPctCoord(33.333333)).toBe(33.33);
    expect(clampPctCoord('abc')).toBe(0);
  });

  test('accepte xp/yp en entrée mais renvoie toujours x/y', () => {
    expect(normalizePctPoint({ xp: 12.3456, yp: 7 })).toEqual({ x: 12.35, y: 7 });
    expect(normalizePctPoint({ x: 5, y: 6 })).toEqual({ x: 5, y: 6 });
  });
});

describe('projectPointOnSegmentPct', () => {
  test('projette sur le segment, bornes comprises', () => {
    expect(projectPointOnSegmentPct({ x: 50, y: 30 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({
      x: 50,
      y: 0,
    });
    // Au-delà de B : la projection est ramenée sur l'extrémité.
    expect(projectPointOnSegmentPct({ x: 150, y: 10 }, { x: 0, y: 0 }, { x: 100, y: 0 })).toEqual({
      x: 100,
      y: 0,
    });
  });

  test('segment dégénéré (A = B) → A', () => {
    expect(projectPointOnSegmentPct({ x: 9, y: 9 }, { x: 3, y: 4 }, { x: 3, y: 4 })).toEqual({
      x: 3,
      y: 4,
    });
  });
});

describe('findNearestEdgeInsertion', () => {
  test('renvoie l’arête la plus proche avec son index d’insertion', () => {
    const hit = findNearestEdgeInsertion(SQUARE, { x: 50, y: 2 });
    expect(hit.insertIndex).toBe(1);
    expect(hit.point).toEqual({ x: 50, y: 0 });
  });

  test('au-delà de la tolérance → null', () => {
    expect(findNearestEdgeInsertion(SQUARE, { x: 50, y: 50 })).toBeNull();
    expect(findNearestEdgeInsertion([{ x: 1, y: 1 }], { x: 1, y: 1 })).toBeNull();
  });
});

describe('insertPctPointAt', () => {
  test('insère sans modifier le tableau source', () => {
    const out = insertPctPointAt(SQUARE, 2, { x: 100, y: 50 });
    expect(out).toHaveLength(5);
    expect(out[2]).toEqual({ x: 100, y: 50 });
    expect(SQUARE).toHaveLength(4);
  });

  test('index hors bornes ramené aux extrémités', () => {
    expect(insertPctPointAt(SQUARE, 99, { x: 1, y: 1 })[4]).toEqual({ x: 1, y: 1 });
    expect(insertPctPointAt(SQUARE, -3, { x: 1, y: 1 })[0]).toEqual({ x: 1, y: 1 });
  });
});

describe('removePctPointAt', () => {
  test('retire le sommet demandé', () => {
    const five = [...SQUARE, { x: 50, y: 50 }];
    expect(removePctPointAt(five, 4)).toEqual(SQUARE);
    expect(removePctPointAt(five, 0)).toEqual([...SQUARE.slice(1), { x: 50, y: 50 }]);
  });

  test('à 3 sommets, renvoie la MÊME référence (garde du polygone minimal)', () => {
    const triangle = SQUARE.slice(0, 3);
    expect(removePctPointAt(triangle, 1)).toBe(triangle);
  });

  test('index invalide → copie inchangée', () => {
    const out = removePctPointAt(SQUARE, 42);
    expect(out).toEqual(SQUARE);
    expect(out).not.toBe(SQUARE);
  });
});
