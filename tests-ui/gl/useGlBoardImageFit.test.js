import { describe, it, expect } from 'vitest';
import { computeMapImageContainRect } from '../../src/utils/mapImageFit.js';

describe('useGlBoardImageFit / computeMapImageContainRect', () => {
  it('centre une image paysage dans un conteneur carré (letterbox vertical)', () => {
    const fit = computeMapImageContainRect(1600, 900, 400, 400);
    expect(fit.width).toBe(400);
    expect(fit.height).toBe(225);
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBeCloseTo(87.5, 1);
  });

  it('centre une image portrait dans un conteneur large (letterbox horizontal)', () => {
    const fit = computeMapImageContainRect(900, 1600, 800, 400);
    expect(fit.height).toBe(400);
    expect(fit.width).toBe(225);
    expect(fit.offsetY).toBe(0);
    expect(fit.offsetX).toBeCloseTo(287.5, 1);
  });

  it('recalcule des offsets différents quand le conteneur change de ratio (plein écran)', () => {
    const normal = computeMapImageContainRect(1600, 900, 600, 420);
    const fullscreen = computeMapImageContainRect(1600, 900, 1200, 800);
    expect(normal.offsetY).not.toBe(fullscreen.offsetY);
    expect(normal.width / normal.height).toBeCloseTo(fullscreen.width / fullscreen.height, 5);
  });
});
