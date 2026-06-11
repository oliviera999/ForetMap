import { describe, test, expect } from 'vitest';
import {
  chapterRecitPrefix,
  chapterRecitRefs,
  parseChapterRecitKey,
  findSuspectRecitKeys,
  GL_CHAPTER_RECIT_MAX,
} from '../../src/gl/utils/glChapterRecitConvention.js';

describe('chapterRecitPrefix', () => {
  test('chapitres 1–5 → recit_0N-chapN_, 0 → prologue', () => {
    expect(chapterRecitPrefix(1)).toBe('recit_01-chap1_');
    expect(chapterRecitPrefix(5)).toBe('recit_05-chap5_');
    expect(chapterRecitPrefix(0)).toBe('recit_00-prologue_');
  });

  test('valeurs hors plage / invalides → null', () => {
    expect(chapterRecitPrefix(6)).toBeNull();
    expect(chapterRecitPrefix(-1)).toBeNull();
    expect(chapterRecitPrefix(null)).toBeNull();
    expect(chapterRecitPrefix('abc')).toBeNull();
  });
});

describe('chapterRecitRefs', () => {
  test('prologue + chapitres 1–MAX, préfixes cohérents', () => {
    const refs = chapterRecitRefs();
    expect(refs).toHaveLength(GL_CHAPTER_RECIT_MAX + 1);
    expect(refs[0]).toEqual({ ref: 'prologue', prefix: 'recit_00-prologue_', chapterNumber: 0 });
    expect(refs[3]).toEqual({ ref: 'chap3', prefix: 'recit_03-chap3_', chapterNumber: 3 });
  });
});

describe('parseChapterRecitKey', () => {
  test('résout le numéro de chapitre depuis une clé', () => {
    expect(parseChapterRecitKey('recit_01-chap1_le-carnet')).toBe(1);
    expect(parseChapterRecitKey('recit_00-prologue_la-boite')).toBe(0);
    expect(parseChapterRecitKey('RECIT_02-CHAP2_scene')).toBe(2);
  });

  test('clés hors convention → null', () => {
    expect(parseChapterRecitKey('recit_06-chap6_scene')).toBeNull();
    expect(parseChapterRecitKey('recit_01-chap2_incoherent')).toBeNull();
    expect(parseChapterRecitKey('recit_feuillet-action_ep-v-03_scene')).toBeNull();
    expect(parseChapterRecitKey('plateau-1_fond')).toBeNull();
    expect(parseChapterRecitKey('')).toBeNull();
  });
});

describe('findSuspectRecitKeys', () => {
  test('repère les typos sans accuser les clés valides', () => {
    const keys = [
      'recit_01-chap1_ok',
      'recit_00-prologue_ok',
      'recit_feuillet-action_ep-v-03_ok',
      'recit_1-chap1_typo-padding',
      'recit_02-chap3_typo-incoherent',
      'recit-03-chap3_typo-tiret',
      'recit_06-chap6_hors-plage',
      'biome_jungle',
    ];
    expect(findSuspectRecitKeys(keys)).toEqual([
      'recit-03-chap3_typo-tiret',
      'recit_02-chap3_typo-incoherent',
      'recit_06-chap6_hors-plage',
      'recit_1-chap1_typo-padding',
    ]);
  });

  test('liste vide / entrée invalide', () => {
    expect(findSuspectRecitKeys([])).toEqual([]);
    expect(findSuspectRecitKeys(null)).toEqual([]);
  });
});
