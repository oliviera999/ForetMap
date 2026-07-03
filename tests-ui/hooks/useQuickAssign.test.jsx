import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

import { api } from '../../src/services/api';
import { useQuickAssign } from '../../src/hooks/useQuickAssign.js';

const STUDENTS = [
  { id: 1, first_name: 'Ali', last_name: 'Ben' },
  { id: 2, first_name: 'Zoé', last_name: 'Martin' },
];

/** Tâche disponible avec Ali déjà inscrit et 3 places. */
const TASK = {
  id: 42,
  title: 'Pailler la butte',
  status: 'available',
  required_students: 3,
  assignments: [{ student_id: 1, student_first_name: 'Ali', student_last_name: 'Ben' }],
};

const BASE = {
  isTeacher: true,
  tasks: [TASK],
  teacherStudents: STUDENTS,
  loadingTeacherStudents: false,
  withLoad: async (_id, fn) => {
    await fn();
  },
  setToast: vi.fn(),
};

function setup(overrides = {}) {
  return renderHook((props) => useQuickAssign(props), {
    initialProps: { ...BASE, setToast: vi.fn(), ...overrides },
  });
}

describe('useQuickAssign', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockResolvedValue({});
  });

  it('état initial : aucun panneau ouvert, sélection vide, ref non éditée', () => {
    const { result } = setup();
    expect(result.current.quickAssignTaskId).toBeNull();
    expect(result.current.quickAssignStudentIds).toEqual([]);
    expect(result.current.quickAssignUserEditedRef.current).toBe(false);
  });

  it('préremplit la sélection avec les inscrits actuels à l’ouverture du panneau', async () => {
    const { result } = setup();
    act(() => result.current.setQuickAssignTaskId(42));
    await waitFor(() => expect(result.current.quickAssignStudentIds).toEqual(['1']));
  });

  it('ne préremplit pas si l’utilisateur a déjà édité la sélection', () => {
    const { result } = setup();
    act(() => {
      result.current.quickAssignUserEditedRef.current = true;
      result.current.setQuickAssignTaskId(42);
    });
    expect(result.current.quickAssignStudentIds).toEqual([]);
  });

  it('ne préremplit pas tant que la liste n3beurs charge, puis rattrape au chargement', async () => {
    const { result, rerender } = setup({ loadingTeacherStudents: true });
    act(() => result.current.setQuickAssignTaskId(42));
    expect(result.current.quickAssignStudentIds).toEqual([]);
    rerender({ ...BASE, loadingTeacherStudents: false });
    await waitFor(() => expect(result.current.quickAssignStudentIds).toEqual(['1']));
  });

  it('teacherQuickAssignDelta / canApply / hint délèguent aux utilitaires avec la liste n3beurs', () => {
    const { result } = setup();
    const { toAdd, toRemove } = result.current.teacherQuickAssignDelta(TASK, ['1', '2']);
    expect(toAdd.map((s) => s.id)).toEqual([2]);
    expect(toRemove).toEqual([]);
    expect(result.current.teacherQuickAssignCanApply(TASK, ['1', '2'])).toBe(true);
    expect(result.current.quickAssignHint(TASK, ['1'])).toContain('Coche ou décoche');
  });

  it('canApply retourne false hors mode prof, même avec un delta valide', () => {
    const { result } = setup({ isTeacher: false });
    expect(result.current.teacherQuickAssignCanApply(TASK, ['1', '2'])).toBe(false);
  });

  it('runTeacherQuickAssign applique le delta puis referme le panneau', async () => {
    const setToast = vi.fn();
    const { result } = setup({ setToast });
    act(() => result.current.setQuickAssignTaskId(42));
    await act(async () => {
      await result.current.runTeacherQuickAssign(TASK, ['2']);
    });
    // Retrait d'Ali (décoché) puis inscription de Zoé (cochée).
    expect(api).toHaveBeenCalledWith('/api/tasks/42/unassign', 'POST', {
      firstName: 'Ali',
      lastName: 'Ben',
      studentId: 1,
    });
    expect(api).toHaveBeenCalledWith('/api/tasks/42/assign', 'POST', {
      firstName: 'Zoé',
      lastName: 'Martin',
      studentId: 2,
    });
    expect(setToast).toHaveBeenCalledTimes(1);
    expect(result.current.quickAssignTaskId).toBeNull();
    expect(result.current.quickAssignStudentIds).toEqual([]);
  });

  it('runTeacherQuickAssign sans delta : toast « rien à faire », aucun appel réseau', async () => {
    const setToast = vi.fn();
    const { result } = setup({ setToast });
    await act(async () => {
      await result.current.runTeacherQuickAssign(TASK, ['1']);
    });
    expect(api).not.toHaveBeenCalled();
    expect(setToast).toHaveBeenCalledWith('Rien à faire : tout était déjà comme prévu.');
  });

  it('passe la clé de chargement `${id}assign_teacher_quick` à withLoad', async () => {
    const withLoad = vi.fn(async (_id, fn) => {
      await fn();
    });
    const { result } = setup({ withLoad });
    await act(async () => {
      await result.current.runTeacherQuickAssign(TASK, ['1']);
    });
    expect(withLoad).toHaveBeenCalledWith('42assign_teacher_quick', expect.any(Function));
  });
});
