import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

import { api } from '../../src/services/api';
import { useTeacherTaskData } from '../../src/hooks/useTeacherTaskData.js';

const STUDENTS = [
  { id: 2, first_name: 'Zoé', last_name: 'Martin' },
  { id: 1, first_name: 'Ali', last_name: 'Ben' },
];

function mockApiOk({ students = STUDENTS, groups = [{ id: 1, name: 'G1' }], referents = [] } = {}) {
  api.mockImplementation(async (url) => {
    if (url.startsWith('/api/groups/options')) return { groups };
    if (url.startsWith('/api/stats/all')) return students;
    if (url.startsWith('/api/tasks/referent-candidates')) return referents;
    throw new Error('URL inattendue : ' + url);
  });
}

function setup(initialProps = { isTeacher: true, filterGroupId: '' }, setToast = vi.fn()) {
  return renderHook(
    ({ isTeacher, filterGroupId }) => useTeacherTaskData(isTeacher, filterGroupId, setToast),
    { initialProps },
  );
}

describe('useTeacherTaskData', () => {
  beforeEach(() => {
    api.mockReset();
  });

  it('hors mode prof : aucun appel réseau, listes vides', () => {
    mockApiOk();
    const { result } = setup({ isTeacher: false, filterGroupId: '' });
    expect(api).not.toHaveBeenCalled();
    expect(result.current.teacherStudents).toEqual([]);
    expect(result.current.groupOptions).toEqual([]);
    expect(result.current.referentCandidates).toEqual([]);
    expect(result.current.loadingTeacherStudents).toBe(false);
  });

  it('mode prof : charge groupes, n3beurs (triés fr) et référents', async () => {
    mockApiOk({ referents: [{ id: 9 }] });
    const { result } = setup();
    await waitFor(() => expect(result.current.teacherStudents).toHaveLength(2));
    expect(result.current.teacherStudents.map((s) => s.first_name)).toEqual(['Ali', 'Zoé']);
    expect(result.current.groupOptions).toEqual([{ id: 1, name: 'G1' }]);
    expect(result.current.referentCandidates).toEqual([{ id: 9 }]);
    expect(result.current.loadingTeacherStudents).toBe(false);
  });

  it('accepte le format enveloppé `{ students: [...] }` de /api/stats/all', async () => {
    mockApiOk({ students: { students: STUDENTS } });
    const { result } = setup();
    await waitFor(() => expect(result.current.teacherStudents).toHaveLength(2));
  });

  it('refetch des n3beurs avec ?group_id= quand le filtre groupe change', async () => {
    mockApiOk();
    const { rerender } = setup();
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/stats/all'));
    rerender({ isTeacher: true, filterGroupId: 'g 1' });
    await waitFor(() => expect(api).toHaveBeenCalledWith('/api/stats/all?group_id=g%201'));
  });

  it('échec /api/stats/all → toast d’erreur, loading redescend', async () => {
    api.mockImplementation(async (url) => {
      if (url.startsWith('/api/stats/all')) throw new Error('boom');
      if (url.startsWith('/api/groups/options')) return { groups: [] };
      return [];
    });
    const setToast = vi.fn();
    const { result } = setup(undefined, setToast);
    await waitFor(() => expect(setToast).toHaveBeenCalled());
    expect(setToast.mock.calls[0][0]).toContain('boom');
    expect(result.current.loadingTeacherStudents).toBe(false);
  });

  it('échec groupes / référents → listes vides sans toast', async () => {
    api.mockImplementation(async (url) => {
      if (url.startsWith('/api/stats/all')) return STUDENTS;
      throw new Error('boom');
    });
    const setToast = vi.fn();
    const { result } = setup(undefined, setToast);
    await waitFor(() => expect(result.current.teacherStudents).toHaveLength(2));
    expect(result.current.groupOptions).toEqual([]);
    expect(result.current.referentCandidates).toEqual([]);
    expect(setToast).not.toHaveBeenCalled();
  });
});
