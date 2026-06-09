import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TaskTileCard } from '../../src/components/tasks-views.jsx';

vi.mock('../../src/services/api.js', () => ({
  withAppBase: (path) => path,
  api: vi.fn(async () => ({})),
}));

/** Construit un jeu de props minimal mais complet pour TaskTileCard (handlers no-op). */
function makeProps(overrides = {}) {
  const base = {
    t: {
      id: 'task-1',
      title: 'Arroser les tomates',
      description: 'Arrosoir rouge, 2L par plant',
      status: 'available',
      required_students: 2,
      assignments: [],
    },
    index: 0,
    viewMode: 'full',
    isN3Affiliated: false,
    student: null,
    plants: [],
    isTeacher: true,
    canViewOtherUsersIdentity: true,
    canEnrollNewTask: false,
    canSelfAssignTasks: false,
    canParticipateContextComments: false,
    contextCommentsEnabled: false,
    roleTerms: { studentSingular: 'élève', studentPlural: 'élèves' },
    loading: {},
    quickAssignTaskId: null,
    quickAssignStudentIds: [],
    teacherStudents: [],
    loadingTeacherStudents: false,
    quickAssignUserEditedRef: { current: false },
    teacherQuickAssignDelta: () => ({ toAdd: [], toRemove: [] }),
    teacherQuickAssignCanApply: () => false,
    quickAssignHint: () => '',
    assign: vi.fn(),
    assignGroupToTask: vi.fn(),
    groupOptions: [],
    unassign: vi.fn(),
    setLogTask: vi.fn(),
    setLogsTask: vi.fn(),
    setTaskStatus: vi.fn(),
    deleteTask: vi.fn(),
    setEditTask: vi.fn(),
    setDuplicateTask: vi.fn(),
    setShowForm: vi.fn(),
    setShowProposalForm: vi.fn(),
    setNewTaskDefaultProjectId: vi.fn(),
    setQuickAssignTaskId: vi.fn(),
    setQuickAssignStudentIds: vi.fn(),
    runTeacherQuickAssign: vi.fn(),
    teacherMarkCollectiveAssignmentDone: vi.fn(),
    tooltipText: () => '',
    openTasksTutorialPreview: vi.fn(),
    onForceLogout: vi.fn(),
    onOpenBiodiversityFromTaskName: vi.fn(),
  };
  return { ...base, ...overrides };
}

describe('TaskTileCard', () => {
  test('affiche le titre de la tâche', () => {
    render(<TaskTileCard {...makeProps()} />);
    expect(screen.getByText('Arroser les tomates')).toBeInTheDocument();
  });

  test('côté n3boss : expose les actions de gestion (modifier / supprimer)', () => {
    render(<TaskTileCard {...makeProps({ isTeacher: true })} />);
    expect(screen.getByLabelText('Modifier la tâche')).toBeInTheDocument();
    expect(screen.getByLabelText('Supprimer la tâche')).toBeInTheDocument();
  });

  test('côté n3beur : pas de bouton de suppression de tâche', () => {
    render(
      <TaskTileCard
        {...makeProps({
          isTeacher: false,
          student: { id: 's1', first_name: 'Léa', last_name: 'Martin' },
          canSelfAssignTasks: true,
        })}
      />,
    );
    expect(screen.getByText('Arroser les tomates')).toBeInTheDocument();
    expect(screen.queryByLabelText('Supprimer la tâche')).not.toBeInTheDocument();
  });

  test('est mémoïsé (React.memo) pour éviter les re-rendus de liste à chaque tick', () => {
    // TaskTileCard doit être un composant mémoïsé : garde-fou contre une régression de la
    // mémoïsation (un composant React.memo expose $$typeof react.memo / un type objet).
    expect(typeof TaskTileCard).toBe('object');
    expect(TaskTileCard.$$typeof).toBeDefined();
  });
});
