import { describe, test, expect } from 'vitest';
import { isSpriteLibraryPreviewableUrl, estimateStateDurationMs } from '../../src/utils/visitMascotPackTiming.js';

describe('isSpriteLibraryPreviewableUrl', () => {
  test('extensions image, avec ou sans query', () => {
    expect(isSpriteLibraryPreviewableUrl('/a/b.png')).toBe(true);
    expect(isSpriteLibraryPreviewableUrl('x.JPG?v=2')).toBe(true);
    expect(isSpriteLibraryPreviewableUrl('y.webp')).toBe(true);
    expect(isSpriteLibraryPreviewableUrl('z.svg')).toBe(true);
  });
  test('non-image / vide → false', () => {
    expect(isSpriteLibraryPreviewableUrl('a.json')).toBe(false);
    expect(isSpriteLibraryPreviewableUrl('')).toBe(false);
    expect(isSpriteLibraryPreviewableUrl(null)).toBe(false);
  });
});

describe('estimateStateDurationMs', () => {
  test('null si état/frames absents ou vides', () => {
    expect(estimateStateDurationMs(null, 'idle')).toBe(null);
    expect(estimateStateDurationMs({}, 'idle')).toBe(null);
    expect(estimateStateDurationMs({ stateFrames: { idle: {} } }, 'idle')).toBe(null);
    expect(estimateStateDurationMs({ stateFrames: { idle: { files: [] } } }, 'idle')).toBe(null);
  });
  test('somme des frameDwellMs si une valeur par frame', () => {
    const pack = { stateFrames: { walk: { files: ['a', 'b', 'c'], frameDwellMs: [100, 200, 50] } } };
    expect(estimateStateDurationMs(pack, 'walk')).toBe(350);
  });
  test('frameDwellMs de mauvaise longueur ignoré → dérive du fps', () => {
    // 2 frames, fps 4 → 1000/4 × 2 = 500 ; frameDwellMs longueur ≠ nFiles ignoré
    const pack = { stateFrames: { walk: { srcs: ['a', 'b'], fps: 4, frameDwellMs: [100] } } };
    expect(estimateStateDurationMs(pack, 'walk')).toBe(500);
  });
  test('fps par défaut = 8, borné à ≥1', () => {
    expect(estimateStateDurationMs({ stateFrames: { i: { files: ['a'] } } }, 'i')).toBe(Math.round(1000 / 8));
    expect(estimateStateDurationMs({ stateFrames: { i: { files: ['a', 'b'], fps: 0 } } }, 'i')).toBe(250);
  });
  test('compte via srcs si files absent', () => {
    expect(estimateStateDurationMs({ stateFrames: { i: { srcs: ['a', 'b', 'c', 'd'], fps: 8 } } }, 'i')).toBe(500);
  });
});
