import { describe, test, expect, vi } from 'vitest';
import {
  prepareTaskSavePayload,
  executeInitialAssignments,
  initialAssignmentsToast,
} from '../../src/utils/taskSaveAssignments.js';

const STUDENTS = [
  { id: 1, first_name: 'Léa', last_name: 'Martin' },
  { id: 2, first_name: 'Tom', last_name: 'Roy' },
];

describe('prepareTaskSavePayload', () => {
  test('sépare le payload tâche des ids d’inscription (dédoublonnés, vides ignorés)', () => {
    const { taskPayload, assignStudentIds } = prepareTaskSavePayload({
      title: 'Pailler',
      required_students: 3,
      assign_student_ids: ['1', 1, ' ', '', '2'],
    });
    expect(taskPayload).toEqual({ title: 'Pailler', required_students: 3 });
    expect(assignStudentIds).toEqual(['1', '2']);
  });

  test('relève required_students au nombre d’inscrits demandés', () => {
    const { taskPayload } = prepareTaskSavePayload({
      required_students: 1,
      assign_student_ids: [1, 2],
    });
    expect(taskPayload.required_students).toBe(2);
  });

  test('required_students invalide → traité comme 1 puis relevé si besoin', () => {
    expect(prepareTaskSavePayload({ assign_student_ids: [1] }).taskPayload.required_students).toBe(1);
    expect(prepareTaskSavePayload({ required_students: 'abc', assign_student_ids: [1, 2] })
      .taskPayload.required_students).toBe(2);
  });

  test('sans inscription demandée, required_students n’est pas touché', () => {
    expect(prepareTaskSavePayload({ title: 'X' })).toEqual({
      taskPayload: { title: 'X' },
      assignStudentIds: [],
    });
    expect(prepareTaskSavePayload(null).assignStudentIds).toEqual([]);
  });
});

describe('executeInitialAssignments', () => {
  test('inscrit chaque compte trouvé via POST /assign et compte les succès', async () => {
    const api = vi.fn().mockResolvedValue({});
    const ok = await executeInitialAssignments(api, 't9', ['1', '2'], STUDENTS);
    expect(ok).toBe(2);
    expect(api).toHaveBeenCalledTimes(2);
    expect(api).toHaveBeenNthCalledWith(1, '/api/tasks/t9/assign', 'POST', {
      firstName: 'Léa',
      lastName: 'Martin',
      studentId: 1,
    });
  });

  test('ignore les ids introuvables dans la liste chargée', async () => {
    const api = vi.fn().mockResolvedValue({});
    const ok = await executeInitialAssignments(api, 't9', ['99', '2'], STUDENTS);
    expect(ok).toBe(1);
    expect(api).toHaveBeenCalledTimes(1);
  });

  test('liste vide ou absente → aucun appel', async () => {
    const api = vi.fn();
    expect(await executeInitialAssignments(api, 't9', [], STUDENTS)).toBe(0);
    expect(await executeInitialAssignments(api, 't9', undefined, STUDENTS)).toBe(0);
    expect(api).not.toHaveBeenCalled();
  });
});

describe('initialAssignmentsToast', () => {
  test('aucune inscription réussie → message d’échec', () => {
    expect(initialAssignmentsToast(0, ['99'], STUDENTS)).toMatch(/impossible d’inscrire/);
  });

  test('une inscription → prénom du premier id demandé', () => {
    expect(initialAssignmentsToast(1, ['1'], STUDENTS)).toBe('Tâche créée et Léa inscrit(e) ✓');
    expect(initialAssignmentsToast(1, ['99'], STUDENTS)).toBe('Tâche créée et n3beur inscrit(e) ✓');
  });

  test('succès partiel → ratio inscrit / demandé', () => {
    expect(initialAssignmentsToast(2, ['1', '2', '99'], STUDENTS))
      .toBe('Tâche créée : 2 inscription(s) sur 3 — certains comptes manquaient dans la liste.');
  });

  test('tous inscrits → message de réussite', () => {
    expect(initialAssignmentsToast(2, ['1', '2'], STUDENTS))
      .toBe('Tâche créée : 2 n3beur(s) inscrit(s) — bien joué ! ✓');
  });
});
