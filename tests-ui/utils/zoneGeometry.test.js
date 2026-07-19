import { describe, test, expect } from 'vitest';

import { parseZonePoints, computeMapImageContainRect } from '../../src/utils/zoneGeometry.js';
import { parseVisitZonePoints } from '../../src/utils/visitMapGeometry.js';
import { computeMapImageContainRect as fitFromMapImageFit } from '../../src/utils/mapImageFit.js';
import { parseZonePointsJson, computeBiodivMapFitRect } from '../../src/utils/biodivMapGeometry.js';

describe('parseZonePoints', () => {
  test('parse des points valides en nombres', () => {
    expect(parseZonePoints('[{"xp":"10","yp":20},{"xp":30,"yp":40}]')).toEqual([
      { xp: 10, yp: 20 },
      { xp: 30, yp: 40 },
    ]);
  });
  test('filtre les points non finis', () => {
    expect(parseZonePoints('[{"xp":1,"yp":2},{"xp":"x","yp":3},{"yp":4}]')).toEqual([
      { xp: 1, yp: 2 },
    ]);
  });
  test('tolère null / vide / JSON invalide / non-tableau', () => {
    expect(parseZonePoints(null)).toEqual([]);
    expect(parseZonePoints('')).toEqual([]);
    expect(parseZonePoints('pas du json')).toEqual([]);
    expect(parseZonePoints('{"xp":1}')).toEqual([]);
  });
});

describe('computeMapImageContainRect', () => {
  test('sans dimensions naturelles → remplit la boîte', () => {
    expect(computeMapImageContainRect(0, 0, 200, 100)).toEqual({
      offsetX: 0,
      offsetY: 0,
      width: 200,
      height: 100,
    });
  });
  test('image plus large que la boîte → contrainte en largeur, centrée verticalement', () => {
    expect(computeMapImageContainRect(200, 100, 100, 100)).toEqual({
      offsetX: 0,
      offsetY: 25,
      width: 100,
      height: 50,
    });
  });
  test('boîte non positive bornée à 1', () => {
    expect(computeMapImageContainRect(0, 0, 0, 0)).toEqual({
      offsetX: 0,
      offsetY: 0,
      width: 1,
      height: 1,
    });
  });
});

describe('alias rétrocompatibles pointent sur le module fédérateur', () => {
  test('parseVisitZonePoints / parseZonePointsJson === parseZonePoints', () => {
    expect(parseVisitZonePoints).toBe(parseZonePoints);
    expect(parseZonePointsJson).toBe(parseZonePoints);
  });
  test('computeMapImageContainRect (mapImageFit) / computeBiodivMapFitRect === canonique', () => {
    expect(fitFromMapImageFit).toBe(computeMapImageContainRect);
    expect(computeBiodivMapFitRect).toBe(computeMapImageContainRect);
  });
});
