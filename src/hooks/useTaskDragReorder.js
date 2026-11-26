import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../services/api';
import { computeReorderedProjectTaskIds } from '../utils/taskDragReorder.js';
import {
  computeProjectStepInfo,
  sameStepBucket,
  sortProjectTasksBySteps,
} from '../utils/taskProjectSteps.js';

/** Message affiché quand un dépôt franchirait une étape numérotée du projet. */
export const STEP_MOVE_REFUSED_MESSAGE =
  'Ces tâches sont numérotées : pour changer d’étape, modifie le numéro au début du titre.';

/**
 * Drag & drop des tâches dans les projets (P2, extrait de tasks-views.jsx) : payload de
 * drag actif (prof/admin), indice de dépôt (`taskDropHint`), dépôt vers un projet
 * (changement de projet + réordonnancement via `POST /api/tasks/reorder-project`),
 * flèches ↑↓ (tactile, clavier) et nettoyage si la tâche glissée disparaît.
 *
 * Projets numérotés (`utils/taskProjectSteps.js`) : l'ordre affiché suit le numéro du
 * titre ; un dépôt ne réordonne qu'à l'intérieur d'une même étape (ou parmi les tâches
 * non numérotées). Un dépôt qui franchirait une étape est refusé avec un message.
 *
 * `canReorder` (droit `tasks.manage`) gouverne le geste ; à défaut on retombe sur
 * `isTeacher` pour les tests / appels historiques. Un **ref synchrone** du payload
 * évite la fenêtre où `dragOver` n'appelle pas `preventDefault` avant le commit React
 * de `startTaskDrag` (HTML5 refuse alors le drop).
 *
 * @param {object} params
 * @param {boolean} [params.isTeacher]
 * @param {boolean} [params.canReorder] droit de réordonner (`tasks.manage`)
 * @param {Array} params.tasks
 * @param {(key: string, fn: () => Promise<void>) => Promise<void>} params.withLoad
 * @param {(msg: string) => void} params.setToast
 */
export function useTaskDragReorder({ isTeacher, canReorder, tasks, withLoad, setToast }) {
  const allowReorder = canReorder ?? !!isTeacher;
  /** Payload de drag & drop actif (prof/admin) pour déplacer / réordonner les tâches dans un projet. */
  const [taskDragPayload, setTaskDragPayload] = useState(null);
  const [taskDropHint, setTaskDropHint] = useState({ projectId: '', beforeTaskId: '' });
  /** Miroir sync du payload : lu au drop / dragOver sans attendre le re-render. */
  const taskDragPayloadRef = useRef(null);

  const clearTaskDragState = useCallback(() => {
    taskDragPayloadRef.current = null;
    setTaskDragPayload(null);
    setTaskDropHint({ projectId: '', beforeTaskId: '' });
  }, []);

  const startTaskDrag = useCallback(
    (task) => {
      if (!allowReorder || !task?.id) return;
      const next = {
        taskId: String(task.id),
        sourceProjectId: String(task.project_id || '').trim(),
      };
      taskDragPayloadRef.current = next;
      setTaskDragPayload(next);
      setTaskDropHint({ projectId: '', beforeTaskId: '' });
    },
    [allowReorder],
  );

  const registerProjectDropHint = useCallback((projectIdRaw, beforeTaskIdRaw = '') => {
    if (!taskDragPayloadRef.current?.taskId) return;
    const projectId = String(projectIdRaw || '').trim();
    if (!projectId) return;
    const beforeTaskId = String(beforeTaskIdRaw || '').trim();
    setTaskDropHint((prev) => {
      if (prev.projectId === projectId && prev.beforeTaskId === beforeTaskId) return prev;
      return { projectId, beforeTaskId };
    });
  }, []);

  /**
   * Place `dragTaskId` dans `targetProjectId`, avant `beforeTaskId` (fin si vide).
   * @returns {boolean} false si le déplacement est refusé ou impossible
   */
  const moveTaskInProject = useCallback(
    (dragTaskIdRaw, targetProjectIdRaw, beforeTaskIdRaw = '') => {
      const dragTaskId = String(dragTaskIdRaw || '').trim();
      const targetProjectId = String(targetProjectIdRaw || '').trim();
      const beforeTaskId = String(beforeTaskIdRaw || '').trim();
      if (!allowReorder || !dragTaskId || !targetProjectId) return false;
      const draggedTask = tasks.find((task) => String(task.id) === dragTaskId);
      if (!draggedTask) return false;
      const sourceProjectId = String(draggedTask.project_id || '').trim();
      // Liste du projet cible telle qu'elle sera après le dépôt (tâche glissée incluse),
      // dans l'ordre affiché : étapes du titre, puis ordre manuel (`sort_order` / GET).
      const targetTasks = [
        ...tasks.filter(
          (task) =>
            String(task.id) !== dragTaskId &&
            String(task.project_id || '').trim() === targetProjectId,
        ),
        { ...draggedTask, project_id: targetProjectId },
      ];
      const stepInfo = computeProjectStepInfo(targetTasks);
      if (beforeTaskId && !sameStepBucket(stepInfo, dragTaskId, beforeTaskId)) {
        setToast(STEP_MOVE_REFUSED_MESSAGE);
        return false;
      }
      const orderedTaskIds = computeReorderedProjectTaskIds(
        sortProjectTasksBySteps(targetTasks, stepInfo),
        dragTaskId,
        targetProjectId,
        beforeTaskId,
      );
      const loadKey = `${dragTaskId}dnd:${targetProjectId}:${beforeTaskId || 'end'}`;
      void withLoad(loadKey, async () => {
        if (sourceProjectId !== targetProjectId) {
          await api(`/api/tasks/${dragTaskId}`, 'PUT', { project_id: targetProjectId });
        }
        await api('/api/tasks/reorder-project', 'POST', {
          project_id: targetProjectId,
          task_ids: orderedTaskIds,
        });
        setToast(
          sourceProjectId === targetProjectId
            ? 'Ordre des tâches du projet mis à jour ✓'
            : 'Tâche intégrée au projet et positionnée ✓',
        );
      });
      return true;
    },
    [allowReorder, tasks, withLoad, setToast],
  );

  const dropTaskToProject = useCallback(
    (targetProjectIdRaw, beforeTaskIdRaw = '', dragTaskIdFromTransfer = '') => {
      const dragTaskId = String(
        taskDragPayloadRef.current?.taskId ||
          taskDragPayload?.taskId ||
          dragTaskIdFromTransfer ||
          '',
      ).trim();
      if (!allowReorder || !dragTaskId) {
        clearTaskDragState();
        return;
      }
      // Déposer une tâche sur elle-même : rien à faire.
      if (String(beforeTaskIdRaw || '').trim() !== dragTaskId) {
        moveTaskInProject(dragTaskId, targetProjectIdRaw, beforeTaskIdRaw);
      }
      clearTaskDragState();
    },
    [allowReorder, clearTaskDragState, moveTaskInProject, taskDragPayload?.taskId],
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
    moveTaskInProject,
  };
}
