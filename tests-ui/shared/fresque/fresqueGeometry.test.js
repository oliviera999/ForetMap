import { describe, expect, test } from 'vitest';

import {
  SVG_H,
  SVG_W,
  arrowOffsets,
  arrowSegment,
  cardSvgRect,
  exitPoint,
  markAnchor,
} from '../../../src/shared/fresque/fresqueGeometry.js';
import { CARD_H_PCT, CARD_W_PCT } from '../../../src/shared/fresque/fresqueCore.js';

describe('fresqueGeometry', () => {
  test('la table est en 160 × 100 et une carte garde ses proportions', () => {
    expect(SVG_W).toBe(160);
    expect(SVG_H).toBe(100);
    const r = cardSvgRect({ x: 10, y: 20 });
    expect(r).toEqual({ x: 16, y: 20, w: CARD_W_PCT * 1.6, h: CARD_H_PCT });
    // 17,6 × 11,96 ≈ ratio de l'image 1719 / 1168.
    expect(r.w / r.h).toBeCloseTo(1719 / 1168, 1);
  });

  test('exitPoint sort du rectangle vers la cible', () => {
    const rect = { x: 0, y: 0, w: 10, h: 10 };
    const p = exitPoint(rect, { x: 5, y: 5 }, { x: 50, y: 5 }, 0);
    expect(p).toEqual({ x: 10, y: 5 });
    const q = exitPoint(rect, { x: 5, y: 5 }, { x: 5, y: -40 }, 0);
    expect(q).toEqual({ x: 5, y: 0 });
  });

  test('arrowSegment relie les bords, pas les centres, et une paire inverse est décalée', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 50, y: 0 };
    const seg = arrowSegment(a, b);
    expect(seg.x1).toBeGreaterThan(CARD_W_PCT * 1.6 - 1);
    expect(seg.x2).toBeLessThan(50 * 1.6 + 1);
    expect(seg.y1).toBeCloseTo(CARD_H_PCT / 2, 5);
    expect(Math.abs(seg.angle)).toBeLessThan(1);
    const offsets = arrowOffsets([
      { id: 'l1', from: 'a', to: 'b' },
      { id: 'l2', from: 'b', to: 'a' },
      { id: 'l3', from: 'a', to: 'c' },
    ]);
    expect(offsets.l1).toBeGreaterThan(0);
    expect(offsets.l2).toBeGreaterThan(0);
    expect(offsets.l3).toBe(0);
    const shifted = arrowSegment(a, b, { offset: offsets.l1 });
    expect(shifted.y1).not.toBeCloseTo(seg.y1, 3);
    expect(arrowSegment(null, b)).toBeNull();
  });

  test('markAnchor se place à mi-chemin, hors de la ligne', () => {
    const seg = arrowSegment({ x: 0, y: 0 }, { x: 50, y: 0 });
    const m = markAnchor(seg);
    expect(m.x).toBeCloseTo(seg.mx, 5);
    expect(Math.abs(m.y - seg.my)).toBeCloseTo(3, 5);
  });
});
