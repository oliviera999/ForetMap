import { useMemo } from 'react';

/**
 * Tâches du plan actif et compteurs des pastilles d'onglets — mémos extraits tels quels
 * d'`App.jsx` (lot 6). Aucun effet.
 *
 * @param {object} params
 * @param {object[]} params.tasks Toutes les tâches chargées.
 * @param {string|null} params.activeMapId Plan actif.
 * @param {object|null} params.studentForUi Élève courant (ou aperçu « vue élève »).
 * @returns {{ tasksForActiveMap: object[], teacherPendingValidationCount: number,
 *   studentActiveAssignedTasksCount: number }}
 */
export function useActiveMapTasks({ tasks, activeMapId, studentForUi }) {
  const tasksForActiveMap = useMemo(
    () =>
      tasks.filter((t) => {
        const effectiveMapId =
          t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
        return effectiveMapId === activeMapId || effectiveMapId == null;
      }),
    [tasks, activeMapId],
  );
  const teacherPendingValidationCount = useMemo(
    () => tasksForActiveMap.filter((t) => t.status === 'done').length,
    [tasksForActiveMap],
  );
  // NB : comparaison stricte (===, sensible casse/espaces, sans match par student_id) —
  // volontairement NON alignée sur `assignmentMatchesStudent` (task-assignments), dont la
  // normalisation (trim + minuscules + id) changerait le comptage ; conservée iso-comportement.
  const studentActiveAssignedTasksCount = useMemo(() => {
    if (!studentForUi) return 0;
    return tasksForActiveMap.filter(
      (t) =>
        t.assignments?.some(
          (a) =>
            a.student_first_name === studentForUi.first_name &&
            a.student_last_name === studentForUi.last_name,
        ) &&
        (t.status === 'available' || t.status === 'in_progress'),
    ).length;
  }, [studentForUi, tasksForActiveMap]);

  return { tasksForActiveMap, teacherPendingValidationCount, studentActiveAssignedTasksCount };
}
