import { describe, test, expect } from 'vitest';
import {
  VISIT_MAP_MASCOT_ESTIMATED_HEIGHT_PX,
  visitZoneSvgTextUniformYTransform,
  clampVisitMascotPctForViewport,
  computeVisitCartographyProgress,
  computeVisitNetworkStatusLabel,
} from '../../src/utils/visitMapDisplay.js';

// --- visitZoneSvgTextUniformYTransform ---

describe('visitZoneSvgTextUniformYTransform', () => {
  test('retourne undefined si largeur ou hauteur est nulle / negative', () => {
    expect(visitZoneSvgTextUniformYTransform(50, 50, 0, 100)).toBeUndefined();
    expect(visitZoneSvgTextUniformYTransform(50, 50, 100, 0)).toBeUndefined();
    expect(visitZoneSvgTextUniformYTransform(50, 50, -1, 100)).toBeUndefined();
  });

  test('retourne undefined si le ratio est quasi-1 (< 0.0005)', () => {
    expect(visitZoneSvgTextUniformYTransform(50, 50, 300, 300)).toBeUndefined();
    // quasi-carre : difference inferieure a la tolerance
    const almostSquare = 300.1;
    expect(visitZoneSvgTextUniformYTransform(50, 50, almostSquare, 300)).toBeUndefined();
  });

  test('retourne un transform SVG quand largeur != hauteur (paysage)', () => {
    const result = visitZoneSvgTextUniformYTransform(50, 30, 600, 300);
    expect(typeof result).toBe('string');
    expect(result).toContain('scale(1,');
    // ratio 600/300 = 2
    expect(result).toBe('translate(50,30) scale(1,2) translate(-50,-30)');
  });

  test('retourne un transform SVG en portrait (ratio < 1)', () => {
    const result = visitZoneSvgTextUniformYTransform(20, 70, 200, 400);
    expect(typeof result).toBe('string');
    // ratio 200/400 = 0.5
    expect(result).toBe('translate(20,70) scale(1,0.5) translate(-20,-70)');
  });
});

// --- clampVisitMascotPctForViewport ---

describe('clampVisitMascotPctForViewport', () => {
  test('serre X et Y dans [0, 100] sans hauteur de calque', () => {
    expect(clampVisitMascotPctForViewport(50, 50)).toEqual({ xp: 50, yp: 50 });
    expect(clampVisitMascotPctForViewport(-10, 110)).toEqual({ xp: 0, yp: 100 });
    expect(clampVisitMascotPctForViewport(200, -5)).toEqual({ xp: 100, yp: 0 });
  });

  test('ne contraint pas Y si fitHeightPx <= 0', () => {
    expect(clampVisitMascotPctForViewport(50, 3, 0)).toEqual({ xp: 50, yp: 3 });
  });

  test('applique un seuil minimum en Y base sur la hauteur de la mascotte', () => {
    // VISIT_MAP_MASCOT_ESTIMATED_HEIGHT_PX = 78 px
    // Pour fitHeightPx = 780 px : minVisibleY = max(6, 78/780*100) = max(6, 10) = 10
    const fitH = 780;
    const { yp } = clampVisitMascotPctForViewport(50, 3, fitH);
    const expected = Math.max(6, (VISIT_MAP_MASCOT_ESTIMATED_HEIGHT_PX / fitH) * 100);
    expect(yp).toBeCloseTo(expected);
  });

  test('plafonne Y a 99.2 meme si la valeur brute est plus haute', () => {
    const { yp } = clampVisitMascotPctForViewport(50, 100, 400);
    expect(yp).toBe(99.2);
  });

  test('valeurs NaN sont traitees comme 0', () => {
    expect(clampVisitMascotPctForViewport(NaN, NaN)).toEqual({ xp: 0, yp: 0 });
  });

  test('valeurs string sont converties', () => {
    const result = clampVisitMascotPctForViewport('40', '60');
    expect(result).toEqual({ xp: 40, yp: 60 });
  });
});

// --- computeVisitCartographyProgress ---

const seenKeyFn = (type, id) => `${type}:${id}`;
const parsePctPointsFn = (pts) => {
  if (!pts) return [];
  try {
    const arr = JSON.parse(pts);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};
const makePoints = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ xp: i, yp: i })));

describe('computeVisitCartographyProgress', () => {
  test('retourne total=0, seenCount=0, pct=0 pour des listes vides', () => {
    const seen = new Set();
    expect(computeVisitCartographyProgress([], [], seen, seenKeyFn, parsePctPointsFn))
      .toEqual({ total: 0, seenCount: 0, pct: 0 });
  });

  test('compte uniquement les zones avec >= 3 points', () => {
    const zones = [
      { id: 1, points: makePoints(3) },
      { id: 2, points: makePoints(2) },
      { id: 3, points: makePoints(0) },
    ];
    const seen = new Set();
    const result = computeVisitCartographyProgress(zones, [], seen, seenKeyFn, parsePctPointsFn);
    expect(result.total).toBe(1);
  });

  test('compte tous les reperes (pas de condition de points)', () => {
    const markers = [{ id: 10 }, { id: 11 }, { id: 12 }];
    const seen = new Set();
    const result = computeVisitCartographyProgress([], markers, seen, seenKeyFn, parsePctPointsFn);
    expect(result.total).toBe(3);
    expect(result.seenCount).toBe(0);
    expect(result.pct).toBe(0);
  });

  test('comptabilise les elements vus (zones + reperes)', () => {
    const zones = [
      { id: 1, points: makePoints(4) },
      { id: 2, points: makePoints(3) },
    ];
    const markers = [{ id: 10 }, { id: 11 }];
    const seen = new Set(['zone:1', 'marker:10']);
    const result = computeVisitCartographyProgress(zones, markers, seen, seenKeyFn, parsePctPointsFn);
    expect(result.total).toBe(4);
    expect(result.seenCount).toBe(2);
    expect(result.pct).toBe(50);
  });

  test('retourne pct=100 quand tout est vu', () => {
    const zones = [{ id: 1, points: makePoints(3) }];
    const markers = [{ id: 2 }];
    const seen = new Set(['zone:1', 'marker:2']);
    const result = computeVisitCartographyProgress(zones, markers, seen, seenKeyFn, parsePctPointsFn);
    expect(result.pct).toBe(100);
  });

  test('accepte undefined comme listes (repli sur vide)', () => {
    const seen = new Set();
    expect(computeVisitCartographyProgress(undefined, undefined, seen, seenKeyFn, parsePctPointsFn))
      .toEqual({ total: 0, seenCount: 0, pct: 0 });
  });
});

// --- computeVisitNetworkStatusLabel ---

describe('computeVisitNetworkStatusLabel', () => {
  test('retourne le message hors-ligne si isOnline est false', () => {
    expect(computeVisitNetworkStatusLabel(false, 'idle', 0)).toBe('Hors ligne — consultation locale');
  });

  test('retourne le message de synchro en cours', () => {
    expect(computeVisitNetworkStatusLabel(true, 'syncing', 0)).toBe('Synchronisation en cours…');
  });

  test('retourne le compte des actions en attente (singulier)', () => {
    expect(computeVisitNetworkStatusLabel(true, 'pending', 1)).toBe('1 action en attente de sync.');
  });

  test('retourne le compte des actions en attente (pluriel)', () => {
    expect(computeVisitNetworkStatusLabel(true, 'pending', 3)).toBe('3 actions en attente de sync.');
  });

  test("retourne le message d'erreur si syncStatus=error", () => {
    expect(computeVisitNetworkStatusLabel(true, 'error', 0)).toBe('Synchronisation en attente');
  });

  test('retourne le message de succes si syncStatus=synced', () => {
    expect(computeVisitNetworkStatusLabel(true, 'synced', 0)).toBe('Synchronisé');
  });

  test('retourne null dans l\'etat nominal (online, idle, 0 pending)', () => {
    expect(computeVisitNetworkStatusLabel(true, 'idle', 0)).toBeNull();
  });

  test('hors-ligne prime sur pendingSyncCount > 0', () => {
    expect(computeVisitNetworkStatusLabel(false, 'pending', 5)).toBe('Hors ligne — consultation locale');
  });
});
