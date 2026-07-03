import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../src/services/api', () => ({ api: vi.fn() }));

import { api } from '../../src/services/api';
import { useTaskDragReorder } from '../../src/hooks/useTaskDragReorder.js';

const TASKS = [
  { id: 1, project_id: 'p1', project_task_order: 1 },
  { id: 2, project_id: 'p1', project_task_order: 2 },
  { id: 3, project_id: 'p2', project_task_order: 1 },
];

function setup(overrides = {}) {
  const withLoad = vi.fn(async (_id, fn) => {
    await fn();
  });
  const setToast = vi.fn();
  const utils = renderHook((props) => useTaskDragReorder(props), {
    initialProps: { isTeacher: true, tasks: TASKS, withLoad, setToast, ...overrides },
  });
  return { ...utils, withLoad, setToast };
}

describe('useTaskDragReorder', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockResolvedValue({});
  });

  it('état initial : aucun drag, indice de dépôt vide', () => {
    const { result } = setup();
    expect(result.current.taskDragPayload).toBeNull();
    expect(result.current.taskDropHint).toEqual({ projectId: '', beforeTaskId: '' });
  });

  it('startTaskDrag mémorise la tâche et son projet source (prof uniquement)', () => {
    const { result } = setup();
    act(() => result.current.startTaskDrag(TASKS[0]));
    expect(result.current.taskDragPayload).toEqual({ taskId: '1', sourceProjectId: 'p1' });
  });

  it('hors mode prof, startTaskDrag est inopérant', () => {
    const { result } = setup({ isTeacher: false });
    act(() => result.current.startTaskDrag(TASKS[0]));
    expect(result.current.taskDragPayload).toBeNull();
  });

  it('registerProjectDropHint n’enregistre l’indice que pendant un drag, avec projet non vide', () => {
    const { result } = setup();
    act(() => result.current.registerProjectDropHint('p2', '3'));
    expect(result.current.taskDropHint).toEqual({ projectId: '', beforeTaskId: '' });
    act(() => result.current.startTaskDrag(TASKS[0]));
    act(() => result.current.registerProjectDropHint('', '3'));
    expect(result.current.taskDropHint).toEqual({ projectId: '', beforeTaskId: '' });
    act(() => result.current.registerProjectDropHint('p2', '3'));
    expect(result.current.taskDropHint).toEqual({ projectId: 'p2', beforeTaskId: '3' });
  });

  it('dépôt dans le même projet : réordonnancement seul + toast « ordre mis à jour »', async () => {
    const { result, withLoad, setToast } = setup();
    act(() => result.current.startTaskDrag(TASKS[1]));
    await act(async () => {
      result.current.dropTaskToProject('p1', '1');
    });
    expect(withLoad).toHaveBeenCalledWith('2dnd:p1:1', expect.any(Function));
    expect(api).toHaveBeenCalledTimes(1);
    expect(api).toHaveBeenCalledWith(
      '/api/tasks/reorder-project',
      'POST',
      expect.objectContaining({ project_id: 'p1' }),
    );
    expect(setToast).toHaveBeenCalledWith('Ordre des tâches du projet mis à jour ✓');
    expect(result.current.taskDragPayload).toBeNull();
  });

  it('dépôt vers un autre projet : PUT project_id puis réordonnancement + toast « intégrée »', async () => {
    const { result, withLoad, setToast } = setup();
    act(() => result.current.startTaskDrag(TASKS[0]));
    await act(async () => {
      result.current.dropTaskToProject('p2');
    });
    expect(withLoad).toHaveBeenCalledWith('1dnd:p2:end', expect.any(Function));
    expect(api).toHaveBeenNthCalledWith(1, '/api/tasks/1', 'PUT', { project_id: 'p2' });
    expect(api).toHaveBeenNthCalledWith(
      2,
      '/api/tasks/reorder-project',
      'POST',
      expect.objectContaining({ project_id: 'p2' }),
    );
    expect(setToast).toHaveBeenCalledWith('Tâche intégrée au projet et positionnée ✓');
  });

  it('dépôt sans projet cible : abandon silencieux et drag nettoyé', async () => {
    const { result, withLoad } = setup();
    act(() => result.current.startTaskDrag(TASKS[0]));
    await act(async () => {
      result.current.dropTaskToProject('');
    });
    expect(withLoad).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
    expect(result.current.taskDragPayload).toBeNull();
  });

  it('nettoie le drag si la tâche glissée disparaît de la liste', () => {
    const { result, rerender, withLoad, setToast } = setup();
    act(() => result.current.startTaskDrag(TASKS[0]));
    expect(result.current.taskDragPayload?.taskId).toBe('1');
    rerender({ isTeacher: true, tasks: TASKS.slice(1), withLoad, setToast });
    expect(result.current.taskDragPayload).toBeNull();
    expect(result.current.taskDropHint).toEqual({ projectId: '', beforeTaskId: '' });
  });
});
