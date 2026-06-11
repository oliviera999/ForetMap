import { describe, test, expect } from 'vitest';
import { quickAssignDelta, quickAssignCanApply, quickAssignHint } from '../../src/utils/taskQuickAssign.js';

const STUDENTS = [
  { id: 1, first_name: 'Ana' },
  { id: 2, first_name: 'Bob' },
  { id: 3, first_name: 'Coline' },
];

/** Tâche : Ana (id 1) inscrite ; 3 places au total. */
function task(over = {}) {
  return {
    id: 't1',
    status: 'available',
    required_students: 3,
    assignments: [{ student_id: 1 }],
    ...over,
  };
}

describe('quickAssignDelta', () => {
  test('coché non-inscrit → toAdd ; décoché inscrit → toRemove', () => {
    const { toAdd, toRemove } = quickAssignDelta(task(), ['2'], STUDENTS);
    expect(toAdd.map((s) => s.id)).toEqual([2]);
    expect(toRemove.map((s) => s.id)).toEqual([1]);
  });
  test('sélection identique aux inscrits → delta vide', () => {
    const { toAdd, toRemove } = quickAssignDelta(task(), [1], STUDENTS);
    expect(toAdd).toEqual([]);
    expect(toRemove).toEqual([]);
  });
  test('ids tolérants au type (number vs string)', () => {
    const { toAdd } = quickAssignDelta(task(), [2], STUDENTS);
    expect(toAdd.map((s) => s.id)).toEqual([2]);
  });
});

describe('quickAssignCanApply', () => {
  test('non-enseignant ou tâche absente → false', () => {
    expect(quickAssignCanApply(task(), ['2'], STUDENTS, false)).toBe(false);
    expect(quickAssignCanApply(null, ['2'], STUDENTS, true)).toBe(false);
  });
  test('delta vide → false ; delta valide → true', () => {
    expect(quickAssignCanApply(task(), [1], STUDENTS, true)).toBe(false);
    expect(quickAssignCanApply(task(), [1, 2], STUDENTS, true)).toBe(true);
  });
  test('tâche en pause → false', () => {
    expect(quickAssignCanApply(task({ status: 'on_hold' }), [1, 2], STUDENTS, true)).toBe(false);
  });
  test('retrait sur tâche done/validated → false', () => {
    expect(quickAssignCanApply(task({ status: 'done' }), [], STUDENTS, true)).toBe(false);
  });
  test('ajout sur proposed → false ; dépassement de places → false', () => {
    expect(quickAssignCanApply(task({ status: 'proposed' }), [1, 2], STUDENTS, true)).toBe(false);
    // 1 place restante (3 requis, 1 inscrit → dispo 2)... avec required_students: 2 → 1 dispo, ajout de 2 → false
    expect(quickAssignCanApply(task({ required_students: 2 }), [1, 2, 3], STUDENTS, true)).toBe(false);
  });
  test('retrait libérant des places permet l’ajout', () => {
    // retirer Ana (1) + ajouter Bob et Coline sur 2 places : 1 dispo + 1 libérée = 2 → ok
    expect(quickAssignCanApply(task({ required_students: 2 }), [2, 3], STUDENTS, true)).toBe(true);
  });
});

describe('quickAssignHint', () => {
  test('tâche absente / en pause / projet clos → messages dédiés', () => {
    expect(quickAssignHint(null, [], STUDENTS)).toMatch(/pas dispo/);
    expect(quickAssignHint(task({ status: 'on_hold' }), [1, 2], STUDENTS)).toMatch(/pause/);
    expect(quickAssignHint(task({ project_status: 'completed' }), [1, 2], STUDENTS)).toMatch(/Projet terminé/);
  });
  test('delta vide → invite à cocher', () => {
    expect(quickAssignHint(task(), [1], STUDENTS)).toMatch(/Coche ou décoche/);
  });
  test('résumé du delta (retirer + inscrire, pluriels)', () => {
    expect(quickAssignHint(task(), ['2', '3'], STUDENTS)).toBe('Retirer 1 n3beur · Inscrire 2 n3beurs');
  });
  test('dépassement de places → message avec le max', () => {
    expect(quickAssignHint(task({ required_students: 2 }), [1, 2, 3], STUDENTS)).toMatch(/Pas assez de places/);
  });
});
