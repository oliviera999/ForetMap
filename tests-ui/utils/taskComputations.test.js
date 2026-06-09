import { describe, test, expect } from 'vitest';
import {
  getAssignedCount,
  getAvailableSlots,
  getCompletionMode,
  getAssigneesDoneCount,
  completionModeLabel,
  isStudentAlreadyAssignedToTask,
  proposalMetaFromDescription,
} from '../../src/utils/taskComputations.js';

describe('getAssignedCount', () => {
  test('priorité au compteur API', () => {
    expect(getAssignedCount({ assigned_count: 3, assignments: [{}, {}] })).toBe(3);
  });
  test('repli sur la longueur de assignments', () => {
    expect(getAssignedCount({ assignments: [{}, {}] })).toBe(2);
  });
  test('0 si rien', () => {
    expect(getAssignedCount({})).toBe(0);
    expect(getAssignedCount(null)).toBe(0);
  });
  test('ignore un compteur API négatif/invalide', () => {
    expect(getAssignedCount({ assigned_count: -1, assignments: [{}] })).toBe(1);
    expect(getAssignedCount({ assigned_count: 'x', assignments: [{}] })).toBe(1);
  });
});

describe('getAvailableSlots', () => {
  test('required - inscrits, borné à 0', () => {
    expect(getAvailableSlots({ required_students: 3, assigned_count: 1 })).toBe(2);
    expect(getAvailableSlots({ required_students: 2, assigned_count: 5 })).toBe(0);
  });
  test('required minimum 1', () => {
    expect(getAvailableSlots({ required_students: 0 })).toBe(1);
    expect(getAvailableSlots({})).toBe(1);
  });
});

describe('getCompletionMode', () => {
  test('all_assignees_done sinon single_done', () => {
    expect(getCompletionMode({ completion_mode: 'all_assignees_done' })).toBe('all_assignees_done');
    expect(getCompletionMode({ completion_mode: 'whatever' })).toBe('single_done');
    expect(getCompletionMode({})).toBe('single_done');
  });
});

describe('getAssigneesDoneCount', () => {
  test('compteur API prioritaire', () => {
    expect(getAssigneesDoneCount({ assignees_done_count: 2, assignments: [{ done_at: 'x' }] })).toBe(2);
  });
  test('repli sur done_at', () => {
    expect(getAssigneesDoneCount({ assignments: [{ done_at: 'x' }, { done_at: null }, { done_at: 'y' }] })).toBe(2);
  });
  test('0 par défaut', () => {
    expect(getAssigneesDoneCount({})).toBe(0);
  });
});

describe('completionModeLabel', () => {
  test('libellés', () => {
    expect(completionModeLabel('all_assignees_done')).toBe('Validation collective');
    expect(completionModeLabel('single_done')).toBe('Validation individuelle');
  });
});

describe('isStudentAlreadyAssignedToTask', () => {
  const task = {
    assignments: [
      { student_id: '42', student_first_name: 'Léa', student_last_name: 'Martin' },
    ],
  };
  test('match par student_id', () => {
    expect(isStudentAlreadyAssignedToTask(task, { id: '42' })).toBe(true);
  });
  test('match par nom (insensible casse/espaces)', () => {
    expect(isStudentAlreadyAssignedToTask(task, { first_name: ' léa ', last_name: 'MARTIN' })).toBe(true);
  });
  test('faux si absent', () => {
    expect(isStudentAlreadyAssignedToTask(task, { id: '99', first_name: 'Tom', last_name: 'Roy' })).toBe(false);
  });
  test('faux si task/élève manquant', () => {
    expect(isStudentAlreadyAssignedToTask(null, { id: '42' })).toBe(false);
    expect(isStudentAlreadyAssignedToTask(task, null)).toBe(false);
  });
});

describe('proposalMetaFromDescription', () => {
  test('extrait le proposeur et nettoie la description', () => {
    const { proposer, cleanedDescription } = proposalMetaFromDescription(
      'Arroser les tomates\n\nProposition élève: Léa',
    );
    expect(proposer).toBe('Léa');
    expect(cleanedDescription).toBe('Arroser les tomates');
  });
  test('accepte la variante n3beur', () => {
    expect(proposalMetaFromDescription('Tâche\nProposition n3beur: Tom').proposer).toBe('Tom');
  });
  test('description vide', () => {
    expect(proposalMetaFromDescription('')).toEqual({ proposer: '', cleanedDescription: '' });
  });
  test('sans ligne de proposition', () => {
    expect(proposalMetaFromDescription('Juste une description')).toEqual({
      proposer: '',
      cleanedDescription: 'Juste une description',
    });
  });
});
