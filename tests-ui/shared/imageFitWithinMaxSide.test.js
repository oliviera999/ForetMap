import { describe, expect, it } from 'vitest';
import { fitWithinMaxSide, isHeicFile } from '../../src/shared/platform/image.js';

// Audit photos PH-M7 : `if (w > max) … else if (h > max)` laissait une photo portrait
// 3000×4000 à 1200×1600 — le grand côté dépassait le plafond.
describe('fitWithinMaxSide', () => {
  it('portrait : le plus grand côté (hauteur) est ramené au plafond', () => {
    expect(fitWithinMaxSide(3000, 4000, 1200)).toEqual({ width: 900, height: 1200 });
  });

  it('paysage : la largeur est ramenée au plafond', () => {
    expect(fitWithinMaxSide(4000, 3000, 1200)).toEqual({ width: 1200, height: 900 });
  });

  it('carré et images déjà petites : inchangées, jamais agrandies', () => {
    expect(fitWithinMaxSide(800, 600, 1200)).toEqual({ width: 800, height: 600 });
    expect(fitWithinMaxSide(1200, 1200, 1200)).toEqual({ width: 1200, height: 1200 });
  });

  it('bande très étroite : aucune dimension ne tombe à zéro', () => {
    expect(fitWithinMaxSide(10000, 3, 1000)).toEqual({ width: 1000, height: 1 });
  });
});

describe('isHeicFile', () => {
  it('reconnaît le type ou l’extension', () => {
    expect(isHeicFile({ type: 'image/heic', name: 'a' })).toBe(true);
    expect(isHeicFile({ type: '', name: 'IMG_0001.HEIC' })).toBe(true);
    expect(isHeicFile({ type: 'image/jpeg', name: 'a.jpg' })).toBe(false);
  });
});
