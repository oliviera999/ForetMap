import { describe, test, expect } from 'vitest';
import { markerFocusPct, zoneFocusPctFromPoints } from '../../src/utils/mapFocusLocation.js';

describe('mapFocusLocation', () => {
  test('markerFocusPct lit x_pct / y_pct (le repère n’a pas de champ yp)', () => {
    expect(markerFocusPct({ x_pct: 12.5, y_pct: 80 })).toEqual({ xp: 12.5, yp: 80 });
    expect(markerFocusPct({ x_pct: '3', y_pct: '4.5' })).toEqual({ xp: 3, yp: 4.5 });
    expect(markerFocusPct(null)).toEqual({ xp: 0, yp: 0 });
  });

  test('zoneFocusPctFromPoints : centre des points, repli au centre du plan', () => {
    expect(
      zoneFocusPctFromPoints(
        JSON.stringify([
          { xp: 0, yp: 0 },
          { xp: 10, yp: 20 },
        ]),
      ),
    ).toEqual({
      xp: 5,
      yp: 10,
    });
    expect(zoneFocusPctFromPoints('pas du json')).toEqual({ xp: 50, yp: 50 });
    expect(zoneFocusPctFromPoints('')).toEqual({ xp: 50, yp: 50 });
  });
});
