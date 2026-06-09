import { describe, test, expect } from 'vitest';
import {
  clampEditZonePct,
  clampEditPts,
  cloneEditPts,
  editPtsSnapshotEqual,
  offsetDuplicateZonePoints,
} from '../../src/utils/zoneEditGeometry.js';

describe('clampEditZonePct', () => {
  test('borne dans [0..100] et coerce en nombre', () => {
    expect(clampEditZonePct({ xp: -5, yp: 120 })).toEqual({ xp: 0, yp: 100 });
    expect(clampEditZonePct({ xp: '30', yp: '40' })).toEqual({ xp: 30, yp: 40 });
    expect(clampEditZonePct({ xp: 'x', yp: undefined })).toEqual({ xp: 0, yp: 0 });
  });
});

describe('clampEditPts', () => {
  test('borne tous les points, tolère null', () => {
    expect(clampEditPts([{ xp: 200, yp: -1 }, { xp: 10, yp: 10 }])).toEqual([{ xp: 100, yp: 0 }, { xp: 10, yp: 10 }]);
    expect(clampEditPts(null)).toEqual([]);
  });
});

describe('cloneEditPts', () => {
  test('nouvelle référence, mêmes coordonnées', () => {
    const src = [{ xp: 1, yp: 2 }];
    const out = cloneEditPts(src);
    expect(out).toEqual(src);
    expect(out).not.toBe(src);
    expect(out[0]).not.toBe(src[0]);
  });
});

describe('editPtsSnapshotEqual', () => {
  test('égalité stricte des coordonnées', () => {
    expect(editPtsSnapshotEqual([{ xp: 1, yp: 2 }], [{ xp: 1, yp: 2 }])).toBe(true);
    expect(editPtsSnapshotEqual([{ xp: 1, yp: 2 }], [{ xp: 1, yp: 3 }])).toBe(false);
  });
  test('longueurs différentes ou absent → false', () => {
    expect(editPtsSnapshotEqual([{ xp: 1, yp: 2 }], [])).toBe(false);
    expect(editPtsSnapshotEqual(null, [{ xp: 1, yp: 2 }])).toBe(false);
  });
});

describe('offsetDuplicateZonePoints', () => {
  test('décale et borne, défaut +2.5', () => {
    expect(offsetDuplicateZonePoints([{ xp: 10, yp: 10 }, { xp: 20, yp: 20 }, { xp: 30, yp: 30 }]))
      .toEqual([{ xp: 12.5, yp: 12.5 }, { xp: 22.5, yp: 22.5 }, { xp: 32.5, yp: 32.5 }]);
  });
  test('borne à 100 après décalage', () => {
    expect(offsetDuplicateZonePoints([{ xp: 99, yp: 99 }, { xp: 50, yp: 50 }, { xp: 10, yp: 10 }])[0])
      .toEqual({ xp: 100, yp: 100 });
  });
  test('moins de 3 points / non-tableau → null', () => {
    expect(offsetDuplicateZonePoints([{ xp: 1, yp: 1 }, { xp: 2, yp: 2 }])).toBeNull();
    expect(offsetDuplicateZonePoints(null)).toBeNull();
  });
});
