import { describe, test, expect } from 'vitest';
import { clampAudioVolume } from '../../src/gl/utils/clampAudioVolume.js';

describe('clampAudioVolume', () => {
  test('borne dans [0, 1]', () => {
    expect(clampAudioVolume(-0.001225)).toBe(0);
    expect(clampAudioVolume(1.5)).toBe(1);
    expect(clampAudioVolume(0.7)).toBe(0.7);
  });

  test('valeurs non finies → 0', () => {
    expect(clampAudioVolume(Number.NaN)).toBe(0);
    expect(clampAudioVolume(undefined)).toBe(0);
  });
});
