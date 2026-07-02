import { describe, test, expect } from 'vitest';
import { keepPrevIfEqual } from '../../src/utils/stableCollection.js';

describe('keepPrevIfEqual', () => {
  test('garde la référence précédente quand le contenu est identique', () => {
    const prev = [{ id: 1, assignments: [{ student_id: 'a' }] }];
    const next = [{ id: 1, assignments: [{ student_id: 'a' }] }];
    expect(keepPrevIfEqual(prev, next)).toBe(prev);
  });

  test('retourne la nouvelle référence dès que le contenu change (y compris imbriqué)', () => {
    const prev = [{ id: 1, assignments: [{ student_id: 'a' }] }];
    const next = [{ id: 1, assignments: [{ student_id: 'b' }] }];
    expect(keepPrevIfEqual(prev, next)).toBe(next);
  });

  test('retourne la nouvelle référence sur changement de longueur', () => {
    const prev = [{ id: 1 }];
    expect(keepPrevIfEqual(prev, [])).toEqual([]);
    expect(keepPrevIfEqual(prev, [{ id: 1 }, { id: 2 }])).toHaveLength(2);
  });

  test('tolère les valeurs non-tableaux sans lever', () => {
    expect(keepPrevIfEqual(null, [1])).toEqual([1]);
    const next = [1];
    expect(keepPrevIfEqual(undefined, next)).toBe(next);
  });
});
