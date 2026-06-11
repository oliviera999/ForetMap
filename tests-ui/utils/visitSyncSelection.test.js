import { describe, test, expect } from 'vitest';
import { toggleIdInList } from '../../src/utils/visitSyncSelection.js';

describe('toggleIdInList', () => {
  test('ajoute un id absent (en fin de liste)', () => {
    expect(toggleIdInList([1, 2], 3)).toEqual([1, 2, 3]);
  });
  test('retire un id présent', () => {
    expect(toggleIdInList([1, 2, 3], 2)).toEqual([1, 3]);
  });
  test('liste vide → ajoute', () => {
    expect(toggleIdInList([], 5)).toEqual([5]);
  });
  test('entrée non-tableau → traitée comme vide', () => {
    expect(toggleIdInList(null, 5)).toEqual([5]);
    expect(toggleIdInList(undefined, 5)).toEqual([5]);
  });
  test('ne mute pas la liste d’origine', () => {
    const src = [1, 2];
    const out = toggleIdInList(src, 3);
    expect(src).toEqual([1, 2]);
    expect(out).not.toBe(src);
  });
});
