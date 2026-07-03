import { describe, test, expect } from 'vitest';
import {
  assignmentMatchesStudent,
  isStudentAssignedToTask,
} from '../../src/utils/task-assignments.js';

describe('assignmentMatchesStudent', () => {
  const assignment = {
    student_id: '42',
    student_first_name: 'Léa',
    student_last_name: 'Martin',
  };

  test('match par student_id', () => {
    expect(assignmentMatchesStudent(assignment, { id: '42' })).toBe(true);
    expect(assignmentMatchesStudent(assignment, { id: 42 })).toBe(true);
  });

  test('match par prénom + nom (casse et espaces ignorés)', () => {
    expect(
      assignmentMatchesStudent(assignment, { id: '99', first_name: ' léa ', last_name: 'MARTIN' }),
    ).toBe(true);
  });

  test('pas de match si ni id ni nom ne correspondent', () => {
    expect(
      assignmentMatchesStudent(assignment, { id: '99', first_name: 'Tom', last_name: 'Roy' }),
    ).toBe(false);
  });

  test('faux si assignation ou élève manquant', () => {
    expect(assignmentMatchesStudent(null, { id: '42' })).toBe(false);
    expect(assignmentMatchesStudent(assignment, null)).toBe(false);
  });
});

describe('isStudentAssignedToTask', () => {
  const task = {
    assignments: [{ student_id: '42', student_first_name: 'Léa', student_last_name: 'Martin' }],
  };

  test('délègue au matcher unique (id ou nom)', () => {
    expect(isStudentAssignedToTask(task, { id: '42' })).toBe(true);
    expect(isStudentAssignedToTask(task, { first_name: 'léa', last_name: 'martin' })).toBe(true);
    expect(isStudentAssignedToTask(task, { id: '9', first_name: 'Tom', last_name: 'Roy' })).toBe(
      false,
    );
  });

  test('faux si task/élève manquant ou assignments non-liste', () => {
    expect(isStudentAssignedToTask(null, { id: '42' })).toBe(false);
    expect(isStudentAssignedToTask(task, null)).toBe(false);
    expect(isStudentAssignedToTask({ assignments: 'x' }, { id: '42' })).toBe(false);
  });
});
