import { describe, test, expect } from 'vitest';
import {
  parseVisitMascotAllowedIds,
  computeVisitCartographyProgress,
  buildVisitNetworkStatusLabel,
} from '../../src/utils/visitViewStatus.js';
import { itemSeenKey } from '../../src/utils/visitMediaGallery.js';

describe('parseVisitMascotAllowedIds', () => {
  test('tableau : trim + entrées vides ignorées', () => {
    expect(parseVisitMascotAllowedIds([' renard ', '', null, 'hibou'])).toEqual(['renard', 'hibou']);
  });
  test('chaîne : séparateurs virgule, point-virgule et saut de ligne', () => {
    expect(parseVisitMascotAllowedIds('renard, hibou;loup\n cerf,,')).toEqual([
      'renard', 'hibou', 'loup', 'cerf',
    ]);
  });
  test('valeurs non gérées → liste vide (aucune restriction)', () => {
    expect(parseVisitMascotAllowedIds(undefined)).toEqual([]);
    expect(parseVisitMascotAllowedIds(null)).toEqual([]);
    expect(parseVisitMascotAllowedIds(42)).toEqual([]);
  });
});

describe('computeVisitCartographyProgress', () => {
  const triangle = JSON.stringify([
    { xp: 0, yp: 0 }, { xp: 10, yp: 0 }, { xp: 0, yp: 10 },
  ]);
  const segment = JSON.stringify([{ xp: 0, yp: 0 }, { xp: 10, yp: 0 }]);

  test('zone sans polygone valide (< 3 points) exclue du total', () => {
    const res = computeVisitCartographyProgress(
      [{ id: 1, points: triangle }, { id: 2, points: segment }],
      [],
      new Set()
    );
    expect(res).toEqual({ total: 1, seenCount: 0, pct: 0 });
  });

  test('zones + repères vus comptés via itemSeenKey, pct arrondi', () => {
    const seen = new Set([itemSeenKey('zone', 1), itemSeenKey('marker', 7)]);
    const res = computeVisitCartographyProgress(
      [{ id: 1, points: triangle }],
      [{ id: 7 }, { id: 8 }],
      seen
    );
    expect(res).toEqual({ total: 3, seenCount: 2, pct: 67 });
  });

  test('listes nulles/vides → progression nulle (pct 0, pas de division par 0)', () => {
    expect(computeVisitCartographyProgress(null, undefined, new Set()))
      .toEqual({ total: 0, seenCount: 0, pct: 0 });
  });
});

describe('buildVisitNetworkStatusLabel', () => {
  test('hors ligne prioritaire sur tout le reste', () => {
    expect(buildVisitNetworkStatusLabel(false, 'syncing', 3)).toBe('Hors ligne — consultation locale');
  });
  test('synchronisation en cours avant le compteur en attente', () => {
    expect(buildVisitNetworkStatusLabel(true, 'syncing', 3)).toBe('Synchronisation en cours…');
  });
  test('compteur en attente : singulier / pluriel', () => {
    expect(buildVisitNetworkStatusLabel(true, 'pending', 1)).toBe('1 action en attente de sync.');
    expect(buildVisitNetworkStatusLabel(true, 'error', 2)).toBe('2 actions en attente de sync.');
  });
  test('erreur sans file, synchronisé, puis repos → null', () => {
    expect(buildVisitNetworkStatusLabel(true, 'error', 0)).toBe('Synchronisation en attente');
    expect(buildVisitNetworkStatusLabel(true, 'synced', 0)).toBe('Synchronisé');
    expect(buildVisitNetworkStatusLabel(true, 'idle', 0)).toBeNull();
  });
});
