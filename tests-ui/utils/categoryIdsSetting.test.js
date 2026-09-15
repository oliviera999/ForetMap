import { describe, test, expect } from 'vitest';
import {
  parseCategoryIdsSetting,
  formatCategoryIdsSetting,
} from '../../src/utils/categoryIdsSetting.js';

describe('parseCategoryIdsSetting', () => {
  test('sépare sur ; , et espaces', () => {
    expect(parseCategoryIdsSetting('a;b, c  d')).toEqual(['a', 'b', 'c', 'd']);
  });

  test('vide / null / undefined → []', () => {
    expect(parseCategoryIdsSetting('')).toEqual([]);
    expect(parseCategoryIdsSetting(null)).toEqual([]);
    expect(parseCategoryIdsSetting(undefined)).toEqual([]);
  });

  test('ignore les segments vides', () => {
    expect(parseCategoryIdsSetting(';;a,,  ,b;')).toEqual(['a', 'b']);
  });
});

describe('formatCategoryIdsSetting', () => {
  test('joint avec ; et déduplique', () => {
    expect(formatCategoryIdsSetting(['a', 'b', 'a', '  ', 'c'])).toBe('a;b;c');
  });

  test('accepte nombres et itérables vides', () => {
    expect(formatCategoryIdsSetting([1, 2, 1])).toBe('1;2');
    expect(formatCategoryIdsSetting([])).toBe('');
    expect(formatCategoryIdsSetting(null)).toBe('');
  });
});
