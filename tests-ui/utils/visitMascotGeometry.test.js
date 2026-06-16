import { describe, test, expect } from 'vitest';
import {
  visitZoneSvgTextUniformYTransform,
  clampVisitMascotPctForViewport,
  VISIT_MAP_MASCOT_ESTIMATED_HEIGHT_PX,
} from '../../src/utils/visitMascotGeometry.js';

describe('visitZoneSvgTextUniformYTransform', () => {
  test('undefined si dimensions nulles/négatives', () => {
    expect(visitZoneSvgTextUniformYTransform(10, 10, 0, 100)).toBeUndefined();
    expect(visitZoneSvgTextUniformYTransform(10, 10, 100, -1)).toBeUndefined();
  });
  test('undefined si quasi carré (ratio ≈ 1)', () => {
    expect(visitZoneSvgTextUniformYTransform(10, 10, 100, 100)).toBeUndefined();
    expect(visitZoneSvgTextUniformYTransform(10, 10, 100, 100.02)).toBeUndefined();
  });
  test('transform SVG quand largeur ≠ hauteur', () => {
    // ratio = 200/100 = 2
    expect(visitZoneSvgTextUniformYTransform(50, 30, 200, 100)).toBe(
      'translate(50,30) scale(1,2) translate(-50,-30)',
    );
  });
});

describe('clampVisitMascotPctForViewport', () => {
  test('borne X/Y dans [0,100] sans hauteur connue', () => {
    expect(clampVisitMascotPctForViewport(150, -10)).toEqual({ xp: 100, yp: 0 });
    expect(clampVisitMascotPctForViewport(42, 60)).toEqual({ xp: 42, yp: 60 });
  });
  test('valeurs non numériques → 0', () => {
    expect(clampVisitMascotPctForViewport('x', null)).toEqual({ xp: 0, yp: 0 });
  });
  test('avec hauteur : garantit une visibilité minimale en bas (≤ 99.2)', () => {
    // fitHeightPx = 780 → minVisibleY = max(6, 78/780*100) = max(6, 10) = 10
    expect(clampVisitMascotPctForViewport(50, 2, 780)).toEqual({ xp: 50, yp: 10 });
    expect(clampVisitMascotPctForViewport(50, 100, 780)).toEqual({ xp: 50, yp: 99.2 });
    // petite hauteur → plancher 6 % minimum
    expect(clampVisitMascotPctForViewport(50, 0, 100000).yp).toBe(6);
  });
  test('constante exportée', () => {
    expect(VISIT_MAP_MASCOT_ESTIMATED_HEIGHT_PX).toBe(78);
  });
});
