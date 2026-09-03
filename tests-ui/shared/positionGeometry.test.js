import { describe, expect, test } from 'vitest';

import {
  POSITION_HALO_MAX_PCT,
  POSITION_HALO_MIN_PCT,
  accuracyRadiusPct,
  bearingBetweenPct,
  clampPositionToMap,
  distanceMetersBetweenPct,
  formatDistanceFr,
  headingFromDeviceOrientation,
  northOffsetFromProjection,
  screenHeadingDeg,
} from '../../src/shared/pct-map/positionGeometry.js';

const PLAN = { widthM: 200, heightM: 100 };

describe('accuracyRadiusPct', () => {
  test('convertit les mètres en % du plan, borné haut et bas', () => {
    // Le plan fait 100 m de haut : 10 m ≈ 10 % de la hauteur, l'échelle la plus défavorable.
    expect(accuracyRadiusPct(10, PLAN)).toBeCloseTo(10, 5);
    expect(accuracyRadiusPct(0.1, PLAN)).toBe(POSITION_HALO_MIN_PCT);
    expect(accuracyRadiusPct(10000, PLAN)).toBe(POSITION_HALO_MAX_PCT);
  });

  test('sans taille de plan ni précision : pas de halo plutôt qu’un halo qui ment', () => {
    expect(accuracyRadiusPct(10, null)).toBe(0);
    expect(accuracyRadiusPct(10, { widthM: 0, heightM: 0 })).toBe(0);
    expect(accuracyRadiusPct(0, PLAN)).toBe(0);
    expect(accuracyRadiusPct('bof', PLAN)).toBe(0);
  });
});

describe('bearingBetweenPct', () => {
  test('angles horaires depuis le haut de l’image', () => {
    const origin = { xp: 50, yp: 50 };
    expect(bearingBetweenPct(origin, { xp: 50, yp: 0 })).toBe(0);
    expect(bearingBetweenPct(origin, { xp: 100, yp: 50 })).toBe(90);
    expect(bearingBetweenPct(origin, { xp: 50, yp: 100 })).toBe(180);
    expect(bearingBetweenPct(origin, { xp: 0, yp: 50 })).toBe(270);
    expect(bearingBetweenPct(origin, origin)).toBe(0);
  });
});

describe('clampPositionToMap', () => {
  test('position dans le plan : renvoyée telle quelle', () => {
    expect(clampPositionToMap({ xp: 30, yp: 40 })).toEqual({
      xp: 30,
      yp: 40,
      offMap: false,
      bearingDeg: 0,
    });
  });

  test('juste en dehors, dans la marge : encore considérée dans le plan', () => {
    expect(clampPositionToMap({ xp: -1, yp: 50 }).offMap).toBe(false);
  });

  test('hors du plan : collée au bord, avec le cap vers le point réel', () => {
    const placed = clampPositionToMap({ xp: 150, yp: 50 });
    expect(placed.offMap).toBe(true);
    expect(placed.xp).toBe(100);
    expect(placed.yp).toBe(50);
    expect(placed.bearingDeg).toBe(90);
    const above = clampPositionToMap({ xp: 50, yp: -30 });
    expect(above).toMatchObject({ xp: 50, yp: 0, offMap: true, bearingDeg: 0 });
  });

  test('entrée illisible : null', () => {
    expect(clampPositionToMap(null)).toBeNull();
    expect(clampPositionToMap({ xp: 'x', yp: 1 })).toBeNull();
  });
});

describe('distanceMetersBetweenPct / formatDistanceFr', () => {
  test('distance selon la taille réelle du plan', () => {
    expect(distanceMetersBetweenPct({ xp: 0, yp: 0 }, { xp: 100, yp: 0 }, PLAN)).toBeCloseTo(
      200,
      5,
    );
    expect(distanceMetersBetweenPct({ xp: 0, yp: 0 }, { xp: 0, yp: 50 }, PLAN)).toBeCloseTo(50, 5);
    expect(distanceMetersBetweenPct({ xp: 0, yp: 0 }, { xp: 0, yp: 0 }, PLAN)).toBe(0);
  });

  test('sans taille de plan : aucune distance annoncée', () => {
    expect(distanceMetersBetweenPct({ xp: 0, yp: 0 }, { xp: 1, yp: 1 }, null)).toBeNull();
    expect(distanceMetersBetweenPct(null, { xp: 1, yp: 1 }, PLAN)).toBeNull();
  });

  test('mise en forme : au mètre, puis à dix mètres, puis en kilomètres', () => {
    expect(formatDistanceFr(42.4)).toBe('42 m');
    expect(formatDistanceFr(438)).toBe('440 m');
    expect(formatDistanceFr(2500)).toBe('2,5 km');
    expect(formatDistanceFr(null)).toBe('');
    expect(formatDistanceFr('x')).toBe('');
  });
});

describe('cap de l’appareil', () => {
  test('iOS : webkitCompassHeading est déjà un cap', () => {
    expect(headingFromDeviceOrientation({ webkitCompassHeading: 90 })).toBe(90);
    expect(headingFromDeviceOrientation({ webkitCompassHeading: 370 })).toBe(10);
  });

  test('alpha absolu : converti en cap horaire ; alpha relatif : ignoré', () => {
    expect(headingFromDeviceOrientation({ alpha: 90, absolute: true })).toBe(270);
    expect(headingFromDeviceOrientation({ alpha: 0, absolute: true })).toBe(0);
    expect(headingFromDeviceOrientation({ alpha: 90 })).toBeNull();
    expect(headingFromDeviceOrientation({})).toBeNull();
    expect(headingFromDeviceOrientation(null)).toBeNull();
  });

  test('screenHeadingDeg applique la rotation du plan', () => {
    expect(screenHeadingDeg(0, 90)).toBe(90);
    expect(screenHeadingDeg(350, 20)).toBe(10);
    expect(screenHeadingDeg(null, 20)).toBeNull();
  });
});

describe('northOffsetFromProjection', () => {
  test('plan orienté au nord : décalage nul', () => {
    // Une projection où le nord (latitude croissante) va vers le haut de l'image.
    const project = (lat, lng) => ({ xp: lng * 1000, yp: -lat * 1000 });
    expect(northOffsetFromProjection(project, { lat: 0, lng: 0 })).toBe(0);
  });

  test('plan tourné d’un quart de tour : décalage de 90°', () => {
    // Ici la latitude croissante part vers la droite de l'image.
    const project = (lat, lng) => ({ xp: lat * 1000, yp: lng * 1000 });
    expect(northOffsetFromProjection(project, { lat: 0, lng: 0 })).toBe(90);
  });

  test('projection absente ou stérile : 0 plutôt qu’une flèche fausse', () => {
    expect(northOffsetFromProjection(null, { lat: 0, lng: 0 })).toBe(0);
    expect(northOffsetFromProjection(() => null, { lat: 0, lng: 0 })).toBe(0);
    expect(northOffsetFromProjection(() => ({ xp: 1, yp: 1 }), null)).toBe(0);
  });
});
