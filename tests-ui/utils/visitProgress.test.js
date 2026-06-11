import { describe, test, expect } from 'vitest';
import { computeVisitCartographyProgress, computeVisitNetworkStatusLabel } from '../../src/utils/visitProgress.js';

/** Polygone JSON à n points (format accepté par parseVisitZonePoints). */
const poly = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ xp: i, yp: i })));
const seenSet = (keys) => new Set(keys);

describe('computeVisitCartographyProgress', () => {
  test('zones traçables (≥3 pts) + repères comptés ; zones <3 pts ignorées', () => {
    const zones = [
      { id: 1, points: poly(3) },
      { id: 2, points: poly(2) }, // ignorée (pas traçable)
    ];
    const markers = [{ id: 10 }, { id: 11 }];
    const out = computeVisitCartographyProgress(zones, markers, seenSet([]));
    expect(out.total).toBe(3); // zone 1 + 2 repères
    expect(out.seenCount).toBe(0);
    expect(out.pct).toBe(0);
  });

  test('pourcentage = vus / total (borné 100, arrondi)', () => {
    const zones = [{ id: 1, points: poly(3) }, { id: 2, points: poly(4) }];
    const markers = [{ id: 10 }];
    const seen = seenSet(['zone:1', 'marker:10']);
    const out = computeVisitCartographyProgress(zones, markers, seen);
    expect(out.total).toBe(3);
    expect(out.seenCount).toBe(2);
    expect(out.pct).toBe(67); // round(2/3*100)
  });

  test('aucun élément → total 0, pct 0', () => {
    expect(computeVisitCartographyProgress([], [], seenSet([]))).toEqual({ total: 0, seenCount: 0, pct: 0 });
    expect(computeVisitCartographyProgress(null, null, seenSet([]))).toEqual({ total: 0, seenCount: 0, pct: 0 });
  });
});

describe('computeVisitNetworkStatusLabel', () => {
  test('hors ligne prioritaire', () => {
    expect(computeVisitNetworkStatusLabel(false, 'syncing', 5)).toBe('Hors ligne — consultation locale');
  });
  test('syncing > pending > error > synced', () => {
    expect(computeVisitNetworkStatusLabel(true, 'syncing', 5)).toBe('Synchronisation en cours…');
    expect(computeVisitNetworkStatusLabel(true, 'idle', 2)).toBe('2 actions en attente de sync.');
    expect(computeVisitNetworkStatusLabel(true, 'idle', 1)).toBe('1 action en attente de sync.');
    expect(computeVisitNetworkStatusLabel(true, 'error', 0)).toBe('Synchronisation en attente');
    expect(computeVisitNetworkStatusLabel(true, 'synced', 0)).toBe('Synchronisé');
  });
  test('rien à signaler → null', () => {
    expect(computeVisitNetworkStatusLabel(true, 'idle', 0)).toBe(null);
  });
});
