import { describe, test, expect } from 'vitest';
import { parseZonePointsJson, computeBiodivMapFitRect } from '../../src/utils/biodivMapGeometry.js';

describe('parseZonePointsJson', () => {
  test('parse des points valides en nombres', () => {
    expect(parseZonePointsJson('[{"xp":"10","yp":20},{"xp":30,"yp":40}]')).toEqual([
      { xp: 10, yp: 20 },
      { xp: 30, yp: 40 },
    ]);
  });
  test('filtre les points non finis', () => {
    expect(parseZonePointsJson('[{"xp":1,"yp":2},{"xp":"x","yp":3},{"yp":4}]')).toEqual([{ xp: 1, yp: 2 }]);
  });
  test('tolère null / vide / JSON invalide / non-tableau', () => {
    expect(parseZonePointsJson(null)).toEqual([]);
    expect(parseZonePointsJson('')).toEqual([]);
    expect(parseZonePointsJson('pas du json')).toEqual([]);
    expect(parseZonePointsJson('{"xp":1}')).toEqual([]);
  });
});

describe('computeBiodivMapFitRect', () => {
  test('sans dimensions naturelles → remplit la boîte', () => {
    expect(computeBiodivMapFitRect(0, 0, 200, 100)).toEqual({
      offsetX: 0,
      offsetY: 0,
      width: 200,
      height: 100,
    });
  });
  test('image plus large que la boîte → contrainte en largeur, centrée verticalement', () => {
    // nw=200 nh=100 dans boîte 100x100 : scale=0.5 → 100x50, centré → offsetY=25
    expect(computeBiodivMapFitRect(200, 100, 100, 100)).toEqual({
      offsetX: 0,
      offsetY: 25,
      width: 100,
      height: 50,
    });
  });
  test('image plus haute → contrainte en hauteur, centrée horizontalement', () => {
    // nw=100 nh=200 dans boîte 100x100 : scale=0.5 → 50x100, centré → offsetX=25
    expect(computeBiodivMapFitRect(100, 200, 100, 100)).toEqual({
      offsetX: 25,
      offsetY: 0,
      width: 50,
      height: 100,
    });
  });
  test('boîte non positive bornée à 1', () => {
    const r = computeBiodivMapFitRect(0, 0, 0, 0);
    expect(r).toEqual({ offsetX: 0, offsetY: 0, width: 1, height: 1 });
  });
});
