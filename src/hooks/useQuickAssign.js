import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../services/api';
import { isStudentAlreadyAssignedToTask } from '../utils/taskComputations.js';
import {
  computeQuickAssignDelta,
  canApplyQuickAssign,
  quickAssignHintText,
  executeQuickAssignPlan,
  quickAssignOutcomeToast,
} from '../utils/taskQuickAssign.js';
import { toQuickAssignStudentId } from '../utils/taskDisplayHelpers.js';

/**
 * Affectation rapide côté n3boss (P2, extrait de tasks-views.jsx, iso-comportement) :
 * tuile ouverte (`quickAssignTaskId`), sélection (`quickAssignStudentIds`), préremplissage
 * différé avec les inscrits actuels dès que la liste n3beurs est chargée (sauf si
 * l'utilisateur a déjà modifié la sélection), et application du delta ajouts/retraits.
 */
export function useQuickAssign({
  isTeacher,
  tasks,
  teacherStudents,
  loadingTeacherStudents,
  withLoad,
  setToast,
}) {
  const [quickAssignTaskId, setQuickAssignTaskId] = useState(null);
  const [quickAssignStudentIds, setQuickAssignStudentIds] = useState([]);
  /** True dès que l’utilisateur modifie la sélection (évite d’écraser le préremplissage différé). */
  const quickAssignUserEditedRef = useRef(false);

  useEffect(() => {
    if (!isTeacher || !quickAssignTaskId || loadingTeacherStudents || teacherStudents.length === 0)
      return;
    if (quickAssignUserEditedRef.current) return;
    const task = tasks.find((x) => String(x.id) === String(quickAssignTaskId));
    if (!task) return;
    const wantIds = teacherStudents
      .filter((s) => isStudentAlreadyAssignedToTask(task, s))
      .map((s) => toQuickAssignStudentId(s.id));
    setQuickAssignStudentIds((prev) => {
      const prevStr = prev.map(toQuickAssignStudentId);
      if (prevStr.length === 0 && wantIds.length > 0) return wantIds;
      return prev;
    });
  }, [isTeacher, quickAssignTaskId, loadingTeacherStudents, teacherStudents, tasks]);

  /** Inscriptions à ajouter / retirer (liste n3beurs chargée côté n3boss) pour l’affectation rapide. */
  const teacherQuickAssignDelta = useCallback(
    (task, selectedIds) => computeQuickAssignDelta(task, selectedIds, teacherStudents),
    [teacherStudents],
  );
  const teacherQuickAssignCanApply = useCallback(
    (task, selectedIds) => !!isTeacher && canApplyQuickAssign(task, selectedIds, teacherStudents),
    [isTeacher, teacherStudents],
  );
  const quickAssignHint = useCallback(
    (task, selectedIds) => quickAssignHintText(task, selectedIds, teacherStudents),
    [teacherStudents],
  );
  const runTeacherQuickAssign = useCallback(
    (task, selectedIds) =>
      withLoad(`${task.id}assign_teacher_quick`, async () => {
        const { toAdd, toRemove } = teacherQuickAssignDelta(task, selectedIds);
        if (toAdd.length === 0 && toRemove.length === 0) {
          setToast('Rien à faire : tout était déjà comme prévu.');
          return;
        }
        const outcome = await executeQuickAssignPlan(api, task, { toAdd, toRemove });
        setToast(quickAssignOutcomeToast(task, outcome));
        setQuickAssignTaskId(null);
        setQuickAssignStudentIds([]);
      }),
    [withLoad, teacherQuickAssignDelta, setToast],
  );

  return {
    quickAssignTaskId,
    setQuickAssignTaskId,
    quickAssignStudentIds,
    setQuickAssignStudentIds,
    quickAssignUserEditedRef,
    teacherQuickAssignDelta,
    teacherQuickAssignCanApply,
    quickAssignHint,
    runTeacherQuickAssign,
  };
}
