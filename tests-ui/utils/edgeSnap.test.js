import { describe, test, expect } from 'vitest';
import {
  boxBlur3,
  computeEdgeMap,
  edgeMapTargetSize,
  edgeStrengthAt,
  findSnapTargetPx,
  snapPctToEdgeMap,
  toLuminance,
} from '../../src/utils/edgeSnap.js';

/** Fabrique un `ImageData` simplifié (suffisant : les helpers n'utilisent que data/width/height). */
function makeImageData(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = colorAt(x, y);
      const p = (y * width + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Image 20×20 coupée en deux : noir à gauche de x=10, blanc à droite. */
function verticalEdgeImage() {
  return makeImageData(20, 20, (x) => (x < 10 ? [0, 0, 0] : [255, 255, 255]));
}

const UNIFORM = makeImageData(20, 20, () => [120, 120, 120]);

describe('toLuminance', () => {
  test('convertit RGB en luminance perçue', () => {
    const luma = toLuminance(makeImageData(2, 1, (x) => (x === 0 ? [255, 255, 255] : [0, 0, 0])));
    expect(Math.round(luma[0])).toBe(255);
    expect(luma[1]).toBe(0);
  });

  test('image vide → tableau vide', () => {
    expect(toLuminance(null)).toHaveLength(0);
  });
});

describe('boxBlur3', () => {
  test('moyenne le voisinage 3×3 (le pic isolé s’étale)', () => {
    const src = new Float32Array(9);
    src[4] = 900; // centre
    const out = boxBlur3(src, 3, 3);
    expect(Math.round(out[4])).toBe(100);
    expect(out[0]).toBeGreaterThan(0);
  });
});

describe('computeEdgeMap', () => {
  test('le maximum de contraste tombe sur la frontière noir/blanc', () => {
    const edgeMap = computeEdgeMap(verticalEdgeImage());
    expect(edgeMap.width).toBe(20);
    expect(edgeMap.max).toBeGreaterThan(0);
    let bestX = -1;
    let bestValue = -1;
    for (let x = 0; x < 20; x += 1) {
      const v = edgeStrengthAt(edgeMap, x, 10);
      if (v > bestValue) {
        bestValue = v;
        bestX = x;
      }
    }
    expect(bestX).toBeGreaterThanOrEqual(9);
    expect(bestX).toBeLessThanOrEqual(10);
    expect(bestValue).toBeCloseTo(1, 5);
  });

  test('image uniforme → aucun contour', () => {
    const edgeMap = computeEdgeMap(UNIFORM);
    expect(edgeMap.max).toBe(0);
    expect(edgeStrengthAt(edgeMap, 10, 10)).toBe(0);
  });

  test('image trop petite → carte vide, sans exception', () => {
    const edgeMap = computeEdgeMap(makeImageData(2, 2, () => [0, 0, 0]));
    expect(edgeMap.max).toBe(0);
  });
});

describe('edgeStrengthAt', () => {
  test('hors image → 0', () => {
    const edgeMap = computeEdgeMap(verticalEdgeImage());
    expect(edgeStrengthAt(edgeMap, -1, 5)).toBe(0);
    expect(edgeStrengthAt(edgeMap, 100, 5)).toBe(0);
  });
});

describe('findSnapTargetPx', () => {
  const edgeMap = computeEdgeMap(verticalEdgeImage());

  test('accroche le point voisin sur la frontière', () => {
    const hit = findSnapTargetPx(edgeMap, 13, 10, 5);
    expect(hit).not.toBeNull();
    expect(hit.x).toBeGreaterThanOrEqual(9);
    expect(hit.x).toBeLessThanOrEqual(11);
    expect(hit.strength).toBeGreaterThan(0.5);
  });

  test('rayon trop court → aucune accroche', () => {
    expect(findSnapTargetPx(edgeMap, 17, 10, 2)).toBeNull();
  });

  test('contraste sous le seuil → aucune accroche', () => {
    expect(findSnapTargetPx(edgeMap, 13, 10, 5, { minStrength: 1.5 })).toBeNull();
  });

  test('image sans contour ou rayon nul → null', () => {
    expect(findSnapTargetPx(computeEdgeMap(UNIFORM), 10, 10, 5)).toBeNull();
    expect(findSnapTargetPx(edgeMap, 10, 10, 0)).toBeNull();
    expect(findSnapTargetPx(null, 10, 10, 5)).toBeNull();
  });
});

describe('snapPctToEdgeMap', () => {
  const edgeMap = computeEdgeMap(verticalEdgeImage());

  test('travaille en pourcentages d’image', () => {
    // x = 13 px sur 19 intervalles ≈ 68,4 % ; rayon 25 % ≈ 5 px.
    const hit = snapPctToEdgeMap(
      edgeMap,
      { xp: (13 / 19) * 100, yp: (10 / 19) * 100 },
      {
        radiusPct: 25,
      },
    );
    expect(hit).not.toBeNull();
    const snappedX = Math.round((hit.xp / 100) * 19);
    expect(snappedX).toBeGreaterThanOrEqual(9);
    expect(snappedX).toBeLessThanOrEqual(11);
  });

  test('renvoie null quand rien n’est accrochable', () => {
    expect(snapPctToEdgeMap(computeEdgeMap(UNIFORM), { xp: 50, yp: 50 }, { radiusPct: 25 })).toBe(
      null,
    );
    expect(snapPctToEdgeMap(null, { xp: 50, yp: 50 })).toBeNull();
    expect(snapPctToEdgeMap(edgeMap, null)).toBeNull();
  });
});

describe('edgeMapTargetSize', () => {
  test('sous-échantillonne les grands plans en conservant le rapport', () => {
    expect(edgeMapTargetSize(4000, 3000, 1400)).toEqual({ width: 1400, height: 1050, scale: 0.35 });
  });

  test('laisse les petites images intactes', () => {
    expect(edgeMapTargetSize(800, 600, 1400)).toEqual({ width: 800, height: 600, scale: 1 });
  });

  test('valeurs absurdes → dimensions minimales', () => {
    expect(edgeMapTargetSize(0, 0).width).toBe(1);
  });
});
