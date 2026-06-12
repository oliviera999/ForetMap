import { describe, test, expect } from 'vitest';
import {
  parseVisitMascotAllowedIds,
  resolveVisitMascotDefaultId,
  VISIT_MASCOT_DEFAULT_ID,
} from '../../src/utils/visitMascotSettings.js';

describe('parseVisitMascotAllowedIds', () => {
  test('tableau → trim + retrait des vides', () => {
    expect(parseVisitMascotAllowedIds([' a ', '', 'b', null])).toEqual(['a', 'b']);
  });
  test('chaîne séparée par , ; ou saut de ligne', () => {
    expect(parseVisitMascotAllowedIds('a, b;c\nd')).toEqual(['a', 'b', 'c', 'd']);
    expect(parseVisitMascotAllowedIds('  a ,,, b ')).toEqual(['a', 'b']);
  });
  test('valeur absente / type inattendu → []', () => {
    expect(parseVisitMascotAllowedIds(undefined)).toEqual([]);
    expect(parseVisitMascotAllowedIds(null)).toEqual([]);
    expect(parseVisitMascotAllowedIds(42)).toEqual([]);
    expect(parseVisitMascotAllowedIds({})).toEqual([]);
  });
});

describe('resolveVisitMascotDefaultId', () => {
  test('valeur configurée trimée', () => {
    expect(resolveVisitMascotDefaultId('  renard1  ')).toBe('renard1');
  });
  test('vide / espaces / absent → défaut', () => {
    expect(resolveVisitMascotDefaultId('')).toBe(VISIT_MASCOT_DEFAULT_ID);
    expect(resolveVisitMascotDefaultId('   ')).toBe(VISIT_MASCOT_DEFAULT_ID);
    expect(resolveVisitMascotDefaultId(undefined)).toBe(VISIT_MASCOT_DEFAULT_ID);
    expect(VISIT_MASCOT_DEFAULT_ID).toBe('renard2-cut-spritesheet');
  });
});
