import { describe, test, expect } from 'vitest';
import {
  hasActiveStudentFilters,
  studentOwnProposals,
  studentActiveAssignedTasks,
  excludeTasksById,
  recentlyValidatedAssignedTasks,
} from '../../src/utils/taskStudentSections.js';

const STUDENT = { id: 7, first_name: 'Léa', last_name: 'Martin' };

function task(overrides = {}) {
  return {
    id: 't1',
    status: 'available',
    assignments: [],
    ...overrides,
  };
}

describe('hasActiveStudentFilters', () => {
  test('aucun filtre → false (carte active par défaut)', () => {
    expect(hasActiveStudentFilters({})).toBe(false);
    expect(hasActiveStudentFilters()).toBe(false);
  });

  test('chaque filtre actif bascule à true', () => {
    expect(hasActiveStudentFilters({ filterText: 'haie' })).toBe(true);
    expect(hasActiveStudentFilters({ filterZone: 'zone:z1' })).toBe(true);
    expect(hasActiveStudentFilters({ filterProject: 'p1' })).toBe(true);
    expect(hasActiveStudentFilters({ filterStatus: 'done' })).toBe(true);
    expect(hasActiveStudentFilters({ filterUrgentCategory: 'urgent' })).toBe(true);
    expect(hasActiveStudentFilters({ hasTouchedStatusFilter: true })).toBe(true);
    expect(hasActiveStudentFilters({ filterMap: 'all' })).toBe(true);
  });

  test('filterMap explicitement « active » ne compte pas comme filtre', () => {
    expect(hasActiveStudentFilters({ filterMap: 'active' })).toBe(false);
  });
});

describe('studentOwnProposals', () => {
  const mine = task({ id: 'p1', status: 'proposed', proposed_by_student_id: 7 });
  const other = task({ id: 'p2', status: 'proposed', proposed_by_student_id: 8 });
  const notProposal = task({ id: 'a1', status: 'available', proposed_by_student_id: 7 });

  test('garde uniquement les propositions soumises par l’élève courant', () => {
    expect(studentOwnProposals([mine, other, notProposal], STUDENT)).toEqual([mine]);
  });

  test('tolère les ids en chaîne et l’absence d’élève', () => {
    const strId = task({ id: 'p3', status: 'proposed', proposed_by_student_id: '7' });
    expect(studentOwnProposals([strId], STUDENT)).toEqual([strId]);
    expect(studentOwnProposals([mine], null)).toEqual([]);
    expect(studentOwnProposals(undefined, STUDENT)).toEqual([]);
  });
});

describe('studentActiveAssignedTasks', () => {
  const assigned = task({
    id: 'a1',
    status: 'in_progress',
    assignments: [{ student_id: '7' }],
  });
  const assignedValidated = task({
    id: 'a2',
    status: 'validated',
    assignments: [{ student_id: '7' }],
  });
  const notAssigned = task({ id: 'a3', status: 'in_progress' });

  test('garde les tâches non validées où l’élève est inscrit', () => {
    expect(studentActiveAssignedTasks([assigned, assignedValidated, notAssigned], STUDENT)).toEqual(
      [assigned],
    );
  });

  test('reconnaît aussi l’inscription par prénom + nom', () => {
    const byName = task({
      id: 'a4',
      assignments: [{ student_first_name: ' léa ', student_last_name: 'MARTIN' }],
    });
    expect(studentActiveAssignedTasks([byName], STUDENT)).toEqual([byName]);
  });

  test('sans élève → liste vide', () => {
    expect(studentActiveAssignedTasks([assigned], null)).toEqual([]);
  });
});

describe('excludeTasksById', () => {
  test('retire les tâches déjà présentes (ids hétérogènes tolérés)', () => {
    const list = [task({ id: 1 }), task({ id: 2 }), task({ id: 3 })];
    expect(excludeTasksById(list, [task({ id: '2' })]).map((t) => t.id)).toEqual([1, 3]);
  });

  test('exclusion vide ou absente → liste inchangée', () => {
    const list = [task({ id: 1 })];
    expect(excludeTasksById(list, [])).toEqual(list);
    expect(excludeTasksById(list, undefined)).toEqual(list);
  });
});

describe('recentlyValidatedAssignedTasks', () => {
  const validatedMine = task({
    id: 'v1',
    status: 'validated',
    assignments: [{ student_id: '7' }],
  });
  const validatedOther = task({
    id: 'v2',
    status: 'validated',
    assignments: [{ student_id: '8' }],
  });
  const activeMine = task({ id: 'v3', status: 'in_progress', assignments: [{ student_id: '7' }] });

  test('garde les tâches validées où l’élève était inscrit', () => {
    expect(
      recentlyValidatedAssignedTasks([validatedMine, validatedOther, activeMine], STUDENT),
    ).toEqual([validatedMine]);
  });

  test('sans élève → liste vide', () => {
    expect(recentlyValidatedAssignedTasks([validatedMine], null)).toEqual([]);
  });
});
