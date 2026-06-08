import { describe, test, expect } from 'vitest';
import {
  chapterIllustrationPrefix,
  chapterIllustrationKeys,
} from '../../src/gl/assets/index.js';

describe('chapterIllustrationPrefix', () => {
  test('chapitres 1–5 → recit_0N-chapN_', () => {
    expect(chapterIllustrationPrefix(1)).toBe('recit_01-chap1_');
    expect(chapterIllustrationPrefix(3)).toBe('recit_03-chap3_');
    expect(chapterIllustrationPrefix(5)).toBe('recit_05-chap5_');
  });

  test('0 → prologue', () => {
    expect(chapterIllustrationPrefix(0)).toBe('recit_00-prologue_');
  });

  test('valeurs hors plage / invalides → null', () => {
    expect(chapterIllustrationPrefix(6)).toBeNull();
    expect(chapterIllustrationPrefix(-1)).toBeNull();
    expect(chapterIllustrationPrefix(null)).toBeNull();
    expect(chapterIllustrationPrefix('abc')).toBeNull();
  });
});

describe('chapterIllustrationKeys (manifest embarqué)', () => {
  test('résout les scènes du chapitre 1 par convention de slug', () => {
    const keys = chapterIllustrationKeys(1);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith('recit_01-chap1_'))).toBe(true);
    expect(keys).toContain('recit_01-chap1_le-carnet-et-le-monde');
  });

  test('résout les scènes du prologue', () => {
    const keys = chapterIllustrationKeys(0);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith('recit_00-prologue_'))).toBe(true);
  });

  test('numéro absent → liste vide', () => {
    expect(chapterIllustrationKeys(null)).toEqual([]);
    expect(chapterIllustrationKeys(9)).toEqual([]);
  });
});
