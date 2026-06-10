import { describe, test, expect } from 'vitest';
import {
  normalizedPlantValue,
  isGenericPotagerLabel,
  parseLinkCandidates,
  mergePlantPhotoFieldValue,
} from '../../src/utils/plantFormValues.js';

describe('normalizedPlantValue', () => {
  test('null/undefined/"-"/vide → ""', () => {
    expect(normalizedPlantValue(null)).toBe('');
    expect(normalizedPlantValue(undefined)).toBe('');
    expect(normalizedPlantValue('-')).toBe('');
    expect(normalizedPlantValue('   ')).toBe('');
  });
  test('sinon, chaîne trimée', () => {
    expect(normalizedPlantValue('  Rosa  ')).toBe('Rosa');
    expect(normalizedPlantValue(42)).toBe('42');
  });
});

describe('isGenericPotagerLabel', () => {
  test('vrai uniquement pour « potager » (insensible à la casse/espaces)', () => {
    expect(isGenericPotagerLabel('Potager')).toBe(true);
    expect(isGenericPotagerLabel('  POTAGER ')).toBe(true);
    expect(isGenericPotagerLabel('Verger')).toBe(false);
    expect(isGenericPotagerLabel('')).toBe(false);
  });
});

describe('parseLinkCandidates', () => {
  test('découpe sur retours ligne et virgules, sans vides', () => {
    expect(parseLinkCandidates('a\nb, c')).toEqual(['a', 'b', 'c']);
    expect(parseLinkCandidates('a,,b')).toEqual(['a', 'b']);
    expect(parseLinkCandidates('-')).toEqual([]);
    expect(parseLinkCandidates(null)).toEqual([]);
  });
});

describe('mergePlantPhotoFieldValue', () => {
  test('URL vide → valeur précédente normalisée (sans découpe)', () => {
    expect(mergePlantPhotoFieldValue('  x\ny  ', '   ')).toBe('x\ny');
    expect(mergePlantPhotoFieldValue('-', '')).toBe('');
  });
  test('liste vide → URL seule', () => {
    expect(mergePlantPhotoFieldValue('', 'http://a')).toBe('http://a');
    expect(mergePlantPhotoFieldValue('-', 'http://a')).toBe('http://a');
  });
  test('doublon → liste inchangée (jointe)', () => {
    expect(mergePlantPhotoFieldValue('http://a\nhttp://b', 'http://b')).toBe('http://a\nhttp://b');
  });
  test('append par défaut, prepend si demandé', () => {
    expect(mergePlantPhotoFieldValue('http://a', 'http://b')).toBe('http://a\nhttp://b');
    expect(mergePlantPhotoFieldValue('http://a', 'http://b', 'prepend')).toBe('http://b\nhttp://a');
  });
});
