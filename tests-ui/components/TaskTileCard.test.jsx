import React, { useRef, useState } from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

describe('TaskTileCard — interactions (les handlers passés en props restent câblés)', () => {
  test('côté n3boss : cliquer Modifier / Dupliquer / Supprimer appelle les handlers', () => {
    const setEditTask = vi.fn();
    const setDuplicateTask = vi.fn();
    const setShowForm = vi.fn();
    const setNewTaskDefaultProjectId = vi.fn();
    const deleteTask = vi.fn();
    render(
      <TaskTileCard
        {...makeProps({
          isTeacher: true,
          setEditTask,
          setDuplicateTask,
          setShowForm,
          setNewTaskDefaultProjectId,
          deleteTask,
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('Modifier la tâche'));
    expect(setEditTask).toHaveBeenCalledTimes(1);
    expect(setEditTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
    expect(setShowForm).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText('Dupliquer la tâche'));
    expect(setDuplicateTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));

    fireEvent.click(screen.getByLabelText('Supprimer la tâche'));
    expect(deleteTask).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
  });

  test('côté n3boss : cliquer un bouton de statut appelle setTaskStatus(task, value)', () => {
    const setTaskStatus = vi.fn();
    render(
      <TaskTileCard
        {...makeProps({
          isTeacher: true,
          setTaskStatus,
          teacherStatusActions: [{ value: 'validated', label: 'Valider', icon: '✅' }],
          teacherTaskPerms: null,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Valider/ }));
    expect(setTaskStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'task-1' }),
      'validated',
    );
  });

  test('côté n3beur : « Je m’en occupe » appelle assign ; « Me retirer » appelle unassign', () => {
    const assign = vi.fn();
    const student = { id: 's1', first_name: 'Léa', last_name: 'Martin' };

    const { unmount } = render(
      <TaskTileCard
        {...makeProps({
          isTeacher: false,
          student,
          canEnrollNewTask: true,
          canSelfAssignTasks: true,
          assign,
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Je m.en occupe/ }));
    expect(assign).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
    unmount();

    // Tâche déjà prise par l’élève → boutons « Marquer terminée » et « Me retirer ».
    const unassign = vi.fn();
    const setLogTask = vi.fn();
    render(
      <TaskTileCard
        {...makeProps({
          isTeacher: false,
          student,
          canSelfAssignTasks: true,
          unassign,
          setLogTask,
          t: {
            id: 'task-1',
            title: 'Arroser les tomates',
            status: 'in_progress',
            required_students: 2,
            assignments: [
              {
                id: 'a1',
                student_id: 's1',
                student_first_name: 'Léa',
                student_last_name: 'Martin',
              },
            ],
          },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Marquer termin/ }));
    expect(setLogTask).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
    fireEvent.click(screen.getByRole('button', { name: /Me retirer/ }));
    expect(unassign).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
  });
});

describe('TaskTileCard — React.memo (pas de re-rendu quand l’état parent non lié change)', () => {
  test('un changement d’état parent sans rapport ne re-rend pas la tuile (props stables)', () => {
    // tooltipText est appelé pendant le rendu (tooltips Modifier/Dupliquer/Supprimer côté n3boss) :
    // on s’en sert comme sonde fiable du nombre de rendus de TaskTileCard.
    const renderProbe = vi.fn(() => '');

    function Harness() {
      const [unrelated, setUnrelated] = useState(0);
      // taskTileProps stable : référence figée pour toute la durée du test (comme le useMemo réel).
      const stablePropsRef = useRef(null);
      if (stablePropsRef.current === null) {
        stablePropsRef.current = makeProps({ isTeacher: true, tooltipText: renderProbe });
      }
      return (
        <div>
          <button type="button" onClick={() => setUnrelated((n) => n + 1)}>
            bump-parent ({unrelated})
          </button>
          <TaskTileCard {...stablePropsRef.current} />
        </div>
      );
    }

    render(<Harness />);
    const initialRenders = renderProbe.mock.calls.length;
    expect(initialRenders).toBeGreaterThan(0);

    // Re-rendu du parent via un état non lié à la tuile.
    fireEvent.click(screen.getByRole('button', { name: /bump-parent/ }));
    fireEvent.click(screen.getByRole('button', { name: /bump-parent/ }));

    // Le parent a bien changé (compteur visible mis à jour)…
    expect(screen.getByRole('button', { name: /bump-parent \(2\)/ })).toBeInTheDocument();
    // …mais la tuile mémoïsée n’a PAS été re-rendue (sonde inchangée).
    expect(renderProbe.mock.calls.length).toBe(initialRenders);
  });
});
