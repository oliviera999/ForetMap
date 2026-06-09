import { describe, test, expect } from 'vitest';
import {
  taskOpenSlots,
  canStudentAssignTask,
  taskEnrollmentMeta,
  taskVisualStatus,
  mergeTaskVisualStatus,
  TASK_VISUAL_LABEL,
  TASK_VISUAL_PRIORITY,
} from '../../src/utils/taskEnrollment.js';

const student = { id: '7', first_name: 'Léa', last_name: 'Martin' };

describe('taskOpenSlots', () => {
  test('requis − inscrits, borné à 0', () => {
    expect(taskOpenSlots({ required_students: 3, assignments: [{}] })).toBe(2);
    expect(taskOpenSlots({ required_students: 2, assignments: [{}, {}, {}] })).toBe(0);
  });
  test('requis par défaut 1, sans assignments', () => {
    expect(taskOpenSlots({})).toBe(1);
    expect(taskOpenSlots(null)).toBe(1);
  });
});

describe('canStudentAssignTask', () => {
  test('tâche ouverte avec places → true', () => {
    expect(canStudentAssignTask({ status: 'available', required_students: 2, assignments: [] }, student)).toBe(true);
  });
  test('refuse si fermée / validée / terminée / en attente', () => {
    expect(canStudentAssignTask({ status: 'validated' }, student)).toBe(false);
    expect(canStudentAssignTask({ status: 'done' }, student)).toBe(false);
    expect(canStudentAssignTask({ status: 'on_hold' }, student)).toBe(false);
    expect(canStudentAssignTask({ status: 'available', project_status: 'completed' }, student)).toBe(false);
  });
  test('refuse si déjà assigné à l’élève', () => {
    const task = {
      status: 'available',
      required_students: 3,
      assignments: [{ student_id: '7' }],
    };
    expect(canStudentAssignTask(task, student)).toBe(false);
  });
  test('refuse si complet', () => {
    expect(canStudentAssignTask({ status: 'available', required_students: 1, assignments: [{ student_id: '99' }] }, student)).toBe(false);
  });
  test('faux si task/élève manquant', () => {
    expect(canStudentAssignTask(null, student)).toBe(false);
    expect(canStudentAssignTask({ status: 'available' }, null)).toBe(false);
  });
});

describe('taskEnrollmentMeta', () => {
  test('déjà prise par l’élève', () => {
    const task = { status: 'available', required_students: 3, assignments: [{ student_id: '7' }] };
    expect(taskEnrollmentMeta(task, student).label).toBe('Déjà prise par toi');
  });
  test('en attente / projets', () => {
    expect(taskEnrollmentMeta({ status: 'on_hold' }, student).label).toBe('En attente');
    expect(taskEnrollmentMeta({ status: 'available', project_status: 'completed' }, student).label).toBe('Projet terminé');
    expect(taskEnrollmentMeta({ status: 'available', project_status: 'validated' }, student).label).toBe('Projet validé');
  });
  test('fermée (done / validated)', () => {
    expect(taskEnrollmentMeta({ status: 'done' }, student).label).toBe('Terminée (en attente)');
    expect(taskEnrollmentMeta({ status: 'validated' }, student).label).toBe('Validée');
  });
  test('complet', () => {
    const task = { status: 'available', required_students: 1, assignments: [{ student_id: '99' }] };
    expect(taskEnrollmentMeta(task, student).label).toBe('Complet');
  });
  test('places disponibles (pluriel)', () => {
    expect(taskEnrollmentMeta({ status: 'available', required_students: 3, assignments: [] }, student).label)
      .toBe('3 places disponibles');
    expect(taskEnrollmentMeta({ status: 'available', required_students: 2, assignments: [{ student_id: '5' }] }, student).label)
      .toBe('1 place disponible');
  });
});

describe('taskVisualStatus', () => {
  test('mappe les statuts vers todo/progress/done, on_hold → null', () => {
    expect(taskVisualStatus('available')).toBe('todo');
    expect(taskVisualStatus('in_progress')).toBe('progress');
    expect(taskVisualStatus('done')).toBe('done');
    expect(taskVisualStatus('validated')).toBe('done');
    expect(taskVisualStatus('on_hold')).toBeNull();
    expect(taskVisualStatus('inconnu')).toBeNull();
  });
});

describe('mergeTaskVisualStatus', () => {
  test('priorité todo > progress > done (la plus actionnable l’emporte sur le lieu)', () => {
    expect(mergeTaskVisualStatus('progress', 'todo')).toBe('todo');
    expect(mergeTaskVisualStatus('todo', 'progress')).toBe('todo');
    expect(mergeTaskVisualStatus('done', 'progress')).toBe('progress');
    expect(mergeTaskVisualStatus('done', 'todo')).toBe('todo');
  });
  test('gère les valeurs absentes', () => {
    expect(mergeTaskVisualStatus(null, 'todo')).toBe('todo');
    expect(mergeTaskVisualStatus('progress', null)).toBe('progress');
  });
  test('labels & priorités cohérents', () => {
    expect(TASK_VISUAL_LABEL.done).toBe('Tâche terminée');
    expect(TASK_VISUAL_PRIORITY.todo).toBeGreaterThan(TASK_VISUAL_PRIORITY.progress);
    expect(TASK_VISUAL_PRIORITY.progress).toBeGreaterThan(TASK_VISUAL_PRIORITY.done);
  });
});
