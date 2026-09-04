import { describe, expect, test } from 'vitest';

import {
  boxesOverlap,
  estimateLabelBox,
  resolveLabelCollisions,
  shouldShowMarkerLabel,
} from '../../src/shared/pct-map/mapOverlayLabelCollision.js';

describe('estimateLabelBox / boxesOverlap', () => {
  test('boîte centrée sur le point, largeur croissante avec le texte', () => {
    const short = estimateLabelBox({ x: 100, y: 50, text: 'CDI', fontSizePx: 10 });
    const long = estimateLabelBox({ x: 100, y: 50, text: 'Salle polyvalente', fontSizePx: 10 });
    expect((short.left + short.right) / 2).toBeCloseTo(100, 5);
    expect(long.right - long.left).toBeGreaterThan(short.right - short.left);
    expect(short.bottom).toBeGreaterThan(short.top);
  });

  test('se toucher ne compte pas comme un recouvrement', () => {
    const a = { left: 0, right: 10, top: 0, bottom: 10 };
    expect(boxesOverlap(a, { left: 10, right: 20, top: 0, bottom: 10 })).toBe(false);
    expect(boxesOverlap(a, { left: 9, right: 20, top: 0, bottom: 10 })).toBe(true);
  });
});

describe('resolveLabelCollisions', () => {
  const box = (x, y) => ({ left: x - 20, right: x + 20, top: y - 6, bottom: y + 6 });

  test('sans recouvrement : tout est gardé', () => {
    const visible = resolveLabelCollisions([
      { id: 'a', box: box(0, 0) },
      { id: 'b', box: box(100, 0) },
    ]);
    expect([...visible].sort()).toEqual(['a', 'b']);
  });

  test('en cas de recouvrement, la priorité de catégorie gagne', () => {
    const visible = resolveLabelCollisions([
      { id: 'sanitaires', box: box(0, 0), priority: 90 },
      { id: 'entree', box: box(10, 0), priority: 10 },
    ]);
    expect([...visible]).toEqual(['entree']);
  });

  test('à priorité égale, le poids (aire) départage ; puis l’ordre d’entrée', () => {
    expect([
      ...resolveLabelCollisions([
        { id: 'petite', box: box(0, 0), priority: 10, weight: 1 },
        { id: 'grande', box: box(5, 0), priority: 10, weight: 100 },
      ]),
    ]).toEqual(['grande']);
    expect([
      ...resolveLabelCollisions([
        { id: 'premier', box: box(0, 0) },
        { id: 'second', box: box(5, 0) },
      ]),
    ]).toEqual(['premier']);
  });

  test('une étiquette épinglée (lieu sélectionné) passe avant tout', () => {
    const visible = resolveLabelCollisions([
      { id: 'prioritaire', box: box(0, 0), priority: 1 },
      { id: 'selection', box: box(5, 0), priority: 999, pinned: true },
    ]);
    expect([...visible]).toEqual(['selection']);
  });

  test('entrées vides ou sans boîte : ignorées', () => {
    expect(resolveLabelCollisions(null).size).toBe(0);
    expect(resolveLabelCollisions([{ id: 'x' }, null]).size).toBe(0);
  });
});

describe('shouldShowMarkerLabel', () => {
  test('au dézoom : aucun nom ; au zoom : les prioritaires d’abord', () => {
    const base = { fitScale: 1, priorityCutoff: 50 };
    expect(shouldShowMarkerLabel({ ...base, scale: 1, priority: 10 })).toBe(false);
    expect(shouldShowMarkerLabel({ ...base, scale: 2, priority: 10 })).toBe(true);
    expect(shouldShowMarkerLabel({ ...base, scale: 2, priority: 90 })).toBe(false);
    expect(shouldShowMarkerLabel({ ...base, scale: 4, priority: 90 })).toBe(true);
  });

  test('le repère sélectionné garde toujours son nom', () => {
    expect(shouldShowMarkerLabel({ scale: 0.1, fitScale: 1, selected: true })).toBe(true);
  });

  test('mesures absentes : pas de nom plutôt qu’un nom mal placé', () => {
    expect(shouldShowMarkerLabel({ scale: 0, fitScale: 0 })).toBe(false);
  });
});
