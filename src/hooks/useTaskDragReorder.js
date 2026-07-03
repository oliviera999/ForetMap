import { useCallback, useEffect, useState } from 'react';

import { api } from '../services/api';
import { computeReorderedProjectTaskIds } from '../utils/taskDragReorder.js';

/**
 * Drag & drop des tâches dans les projets (P2, extrait de tasks-views.jsx,
 * iso-comportement) : payload de drag actif (prof/admin), indice de dépôt
 * (`taskDropHint`), dépôt vers un projet (changement de projet + réordonnancement via
 * `POST /api/tasks/reorder-project`) et nettoyage si la tâche glissée disparaît.
 */
export function useTaskDragReorder({ isTeacher, tasks, withLoad, setToast }) {
  /** Payload de drag & drop actif (prof/admin) pour déplacer / réordonner les tâches dans un projet. */
  const [taskDragPayload, setTaskDragPayload] = useState(null);
  const [taskDropHint, setTaskDropHint] = useState({ projectId: '', beforeTaskId: '' });

  const clearTaskDragState = useCallback(() => {
    setTaskDragPayload(null);
    setTaskDropHint({ projectId: '', beforeTaskId: '' });
  }, []);

  const startTaskDrag = useCallback(
    (task) => {
      if (!isTeacher || !task?.id) return;
      setTaskDragPayload({
        taskId: String(task.id),
        sourceProjectId: String(task.project_id || '').trim(),
      });
      setTaskDropHint({ projectId: '', beforeTaskId: '' });
    },
    [isTeacher],
  );

  const registerProjectDropHint = useCallback(
    (projectIdRaw, beforeTaskIdRaw = '') => {
      if (!taskDragPayload?.taskId) return;
      const projectId = String(projectIdRaw || '').trim();
      if (!projectId) return;
      setTaskDropHint({
        projectId,
        beforeTaskId: String(beforeTaskIdRaw || '').trim(),
      });
    },
    [taskDragPayload?.taskId],
  );

  const dropTaskToProject = useCallback(
    (targetProjectIdRaw, beforeTaskIdRaw = '') => {
      const dragTaskId = String(taskDragPayload?.taskId || '').trim();
      if (!isTeacher || !dragTaskId) return;
      const targetProjectId = String(targetProjectIdRaw || '').trim();
      if (!targetProjectId) {
        clearTaskDragState();
        return;
      }
      const draggedTask = tasks.find((task) => String(task.id) === dragTaskId);
      if (!draggedTask) {
        clearTaskDragState();
        return;
      }
      const sourceProjectId = String(draggedTask.project_id || '').trim();
      const beforeTaskId = String(beforeTaskIdRaw || '').trim();
      const loadKey = `${dragTaskId}dnd:${targetProjectId}:${beforeTaskId || 'end'}`;
      void withLoad(loadKey, async () => {
        if (sourceProjectId !== targetProjectId) {
          await api(`/api/tasks/${dragTaskId}`, 'PUT', { project_id: targetProjectId });
        }
        const orderedTaskIds = computeReorderedProjectTaskIds(
          tasks,
          dragTaskId,
          targetProjectId,
          beforeTaskId,
        );
        await api('/api/tasks/reorder-project', 'POST', {
          project_id: targetProjectId,
          task_ids: orderedTaskIds,
        });
        setToast(
          sourceProjectId === targetProjectId
            ? 'Ordre des tâches du projet mis à jour ✓'
            : 'Tâche intégrée au projet et positionnée ✓',
        );
        clearTaskDragState();
      });
    },
    [clearTaskDragState, isTeacher, taskDragPayload?.taskId, tasks, withLoad, setToast],
  );

  useEffect(() => {
    if (!taskDragPayload?.taskId) return;
    const stillExists = tasks.some((task) => String(task.id) === String(taskDragPayload.taskId));
    if (!stillExists) clearTaskDragState();
  }, [clearTaskDragState, taskDragPayload, tasks]);

  return {
    taskDragPayload,
    taskDropHint,
    clearTaskDragState,
    startTaskDrag,
    registerProjectDropHint,
    dropTaskToProject,
  };
}
