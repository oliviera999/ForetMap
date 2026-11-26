import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

import { api } from '../../src/services/api';
import { ASSIGNABLES_IDLE_MS, useTeacherTaskData } from '../../src/hooks/useTeacherTaskData.js';

const STUDENTS = [
  { id: 2, first_name: 'Zoé', last_name: 'Martin' },
  { id: 1, first_name: 'Ali', last_name: 'Ben' },
];

function mockApiOk({ students = STUDENTS, groups = [{ id: 1, name: 'G1' }], referents = [] } = {}) {
  api.mockImplementation(async (url) => {
    if (url.startsWith('/api/groups/options')) return { groups };
    if (url.startsWith('/api/tasks/assignable-students')) return students;
    if (url.startsWith('/api/tasks/referent-candidates')) return referents;
    throw new Error('URL inattendue : ' + url);
  });
}

function setup(
  initialProps = { isTeacher: true, filterGroupId: '', loadReferents: false },
  setToast = vi.fn(),
) {
  return renderHook(
    ({ isTeacher, filterGroupId, loadReferents }) =>
      useTeacherTaskData(isTeacher, filterGroupId, setToast, { loadReferents }),
    { initialProps },
  );
}

/** Avance l’idle assignables (setTimeout ou requestIdleCallback selon l’environnement). */
async function flushAssignablesIdle() {
  await act(async () => {
    vi.advanceTimersByTime(ASSIGNABLES_IDLE_MS);
  });
  // Laisser les promesses api se résoudre.
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useTeacherTaskData', () => {
  beforeEach(() => {
    api.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hors mode prof : aucun appel réseau, listes vides', () => {
    mockApiOk();
    const { result } = setup({ isTeacher: false, filterGroupId: '', loadReferents: false });
    expect(api).not.toHaveBeenCalled();
    expect(result.current.teacherStudents).toEqual([]);
    expect(result.current.groupOptions).toEqual([]);
    expect(result.current.referentCandidates).toEqual([]);
    expect(result.current.loadingTeacherStudents).toBe(false);
  });

  it('mode prof sans loadReferents : groupes tout de suite, assignables après idle, pas de référents', async () => {
    mockApiOk({ referents: [{ id: 9 }] });
    const { result } = setup({ isTeacher: true, filterGroupId: '', loadReferents: false });

    await waitFor(() => expect(result.current.groupOptions).toEqual([{ id: 1, name: 'G1' }]));
    expect(api.mock.calls.some(([url]) => String(url).includes('assignable-students'))).toBe(false);
    expect(api.mock.calls.some(([url]) => String(url).includes('referent-candidates'))).toBe(false);
    expect(result.current.referentCandidates).toEqual([]);

    await flushAssignablesIdle();
    await waitFor(() => expect(result.current.teacherStudents).toHaveLength(2));
    expect(result.current.teacherStudents.map((s) => s.first_name)).toEqual(['Ali', 'Zoé']);
    expect(result.current.referentCandidates).toEqual([]);
    expect(result.current.loadingTeacherStudents).toBe(false);
  });

  it('mode prof avec loadReferents : charge aussi les candidats référents', async () => {
    mockApiOk({ referents: [{ id: 9 }] });
    const { result } = setup({ isTeacher: true, filterGroupId: '', loadReferents: true });
    await flushAssignablesIdle();
    await waitFor(() => expect(result.current.teacherStudents).toHaveLength(2));
    await waitFor(() => expect(result.current.referentCandidates).toEqual([{ id: 9 }]));
    expect(api.mock.calls.some(([url]) => String(url).includes('referent-candidates'))).toBe(true);
  });

  it('passe loadReferents false → true : charge les référents à l’ouverture du formulaire', async () => {
    mockApiOk({ referents: [{ id: 9 }] });
    const { result, rerender } = setup({
      isTeacher: true,
      filterGroupId: '',
      loadReferents: false,
    });
    await flushAssignablesIdle();
    await waitFor(() => expect(result.current.teacherStudents).toHaveLength(2));
    expect(result.current.referentCandidates).toEqual([]);

    rerender({ isTeacher: true, filterGroupId: '', loadReferents: true });
    await waitFor(() => expect(result.current.referentCandidates).toEqual([{ id: 9 }]));
  });

  it('accepte le format enveloppé `{ students: [...] }` de /api/tasks/assignable-students', async () => {
    mockApiOk({ students: { students: STUDENTS } });
    const { result } = setup();
    await flushAssignablesIdle();
    await waitFor(() => expect(result.current.teacherStudents).toHaveLength(2));
  });

  it('refetch des n3beurs avec ?group_id= quand le filtre groupe change', async () => {
    mockApiOk();
    const { rerender } = setup();
    await flushAssignablesIdle();
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/tasks/assignable-students'));
    rerender({ isTeacher: true, filterGroupId: 'g 1', loadReferents: false });
    await flushAssignablesIdle();
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/api/tasks/assignable-students?group_id=g%201'),
    );
  });

  it('échec /api/tasks/assignable-students → toast d’erreur, loading redescend', async () => {
    api.mockImplementation(async (url) => {
      if (url.startsWith('/api/tasks/assignable-students')) throw new Error('boom');
      if (url.startsWith('/api/groups/options')) return { groups: [] };
      return [];
    });
    const setToast = vi.fn();
    const { result } = setup(undefined, setToast);
    await flushAssignablesIdle();
    await waitFor(() => expect(setToast).toHaveBeenCalled());
    expect(setToast.mock.calls[0][0]).toContain('boom');
    expect(result.current.loadingTeacherStudents).toBe(false);
  });

  it('échec groupes / référents → listes vides sans toast', async () => {
    api.mockImplementation(async (url) => {
      if (url.startsWith('/api/tasks/assignable-students')) return STUDENTS;
      throw new Error('boom');
    });
    const setToast = vi.fn();
    const { result } = setup({ isTeacher: true, filterGroupId: '', loadReferents: true }, setToast);
    await flushAssignablesIdle();
    await waitFor(() => expect(result.current.teacherStudents).toHaveLength(2));
    expect(result.current.groupOptions).toEqual([]);
    expect(result.current.referentCandidates).toEqual([]);
    expect(setToast).not.toHaveBeenCalled();
  });
});
