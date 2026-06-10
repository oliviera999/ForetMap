import { describe, test, expect } from 'vitest';
import { sortTutorialsByOrder, moveIndex, linkedTaskStatusLabel } from '../../src/utils/tutorialListHelpers.js';

describe('sortTutorialsByOrder', () => {
  test('trie par sort_order puis titre (fr), sans muter', () => {
    const list = [
      { sort_order: 2, title: 'B' },
      { sort_order: 1, title: 'Z' },
      { sort_order: 1, title: 'A' },
    ];
    expect(sortTutorialsByOrder(list).map((t) => t.title)).toEqual(['A', 'Z', 'B']);
    expect(list.map((t) => t.title)).toEqual(['B', 'Z', 'A']); // entrée inchangée
  });
  test('sort_order manquant → 0', () => {
    const list = [{ title: 'X' }, { sort_order: -1, title: 'Y' }];
    expect(sortTutorialsByOrder(list).map((t) => t.title)).toEqual(['Y', 'X']);
  });
});

describe('moveIndex', () => {
  const arr = ['a', 'b', 'c', 'd'];
  test('déplace from→to', () => {
    expect(moveIndex(arr, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveIndex(arr, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  test('no-op (même réf) si indices invalides ou égaux', () => {
    expect(moveIndex(arr, 1, 1)).toBe(arr);
    expect(moveIndex(arr, -1, 2)).toBe(arr);
    expect(moveIndex(arr, 0, 9)).toBe(arr);
  });
  test('ne mute pas la source', () => {
    const copy = [...arr];
    moveIndex(copy, 0, 3);
    expect(copy).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('linkedTaskStatusLabel', () => {
  test('libellés connus', () => {
    expect(linkedTaskStatusLabel('available')).toBe('À faire');
    expect(linkedTaskStatusLabel('IN_PROGRESS')).toBe('En cours');
    expect(linkedTaskStatusLabel('validated')).toBe('Validée');
  });
  test('repli : valeur brute puis « — »', () => {
    expect(linkedTaskStatusLabel('weird')).toBe('weird');
    expect(linkedTaskStatusLabel('')).toBe('—');
    expect(linkedTaskStatusLabel(null)).toBe('—');
  });
});
