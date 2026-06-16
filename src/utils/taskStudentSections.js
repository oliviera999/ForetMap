/**
 * Logique pure des sections « côté n3beur » de la vue Tâches.
 *
 * Extraite de `tasks-views.jsx` (O6) : détection des filtres élève actifs
 * (affichage « Résultats filtrés »), propositions de l'élève courant, tâches
 * où il est inscrit, exclusion par id (sections « déjà prises ») et tâches
 * récemment validées. Sans React ni I/O, testable unitairement
 * (`tests-ui/utils/taskStudentSections.test.js`).
 */

import { isStudentAssignedToTask } from './task-assignments';
import { taskEffectiveStatus } from './taskListHelpers.js';

/** Au moins un filtre élève est-il actif ? (bascule la vue en « Résultats filtrés »). */
export function hasActiveStudentFilters({
  filterText = '',
  filterZone = '',
  filterProject = '',
  filterStatus = '',
  filterUrgentCategory = '',
  hasTouchedStatusFilter = false,
  filterMap = 'active',
} = {}) {
  return (
    !!filterText ||
    !!filterZone ||
    !!filterProject ||
    !!filterStatus ||
    !!filterUrgentCategory ||
    !!hasTouchedStatusFilter ||
    filterMap !== 'active'
  );
}

/** Propositions (statut `proposed`) soumises par l'élève courant. */
export function studentOwnProposals(tasks, student) {
  if (!student) return [];
  return (tasks || []).filter(
    (t) =>
      t?.status === 'proposed' &&
      String(t.proposed_by_student_id || '') === String(student.id || ''),
  );
}

/** Tâches non validées où l'élève courant est inscrit (section « Mes tâches »). */
export function studentActiveAssignedTasks(tasks, student) {
  if (!student) return [];
  return (tasks || []).filter(
    (t) => taskEffectiveStatus(t) !== 'validated' && isStudentAssignedToTask(t, student),
  );
}

/** Retire de `list` les tâches présentes dans `excluded` (comparaison par id). */
export function excludeTasksById(list, excluded) {
  const ids = new Set((excluded || []).map((t) => String(t?.id)));
  return (list || []).filter((t) => !ids.has(String(t?.id)));
}

/** Tâches validées où l'élève courant était inscrit (section « Récemment validées »). */
export function recentlyValidatedAssignedTasks(tasks, student) {
  if (!student) return [];
  return (tasks || []).filter(
    (t) => taskEffectiveStatus(t) === 'validated' && isStudentAssignedToTask(t, student),
  );
}
