/**
 * Logique pure de l'affectation rapide n3boss (panneau « Inscrire des n3beurs »).
 *
 * Extraite de `tasks-views.jsx` (O6) : calcul du delta inscriptions/retraits, faisabilité
 * et message d'aide — sans React ni I/O, testable unitairement
 * (`tests-ui/utils/taskQuickAssign.test.js`). Les appels API (`runTeacherQuickAssign`)
 * restent dans `TasksView`.
 */

import { getAvailableSlots, isStudentAlreadyAssignedToTask } from './taskComputations.js';
import { taskEffectiveStatus } from './taskListHelpers.js';

/** Inscriptions à ajouter / retirer (liste n3beurs chargée côté n3boss) pour l'affectation rapide. */
export function computeQuickAssignDelta(task, selectedIds, teacherStudents) {
  const idSet = new Set((selectedIds || []).map(String));
  const toAdd = (teacherStudents || []).filter(
    (s) => idSet.has(String(s.id)) && !isStudentAlreadyAssignedToTask(task, s)
  );
  const toRemove = (teacherStudents || []).filter(
    (s) => !idSet.has(String(s.id)) && isStudentAlreadyAssignedToTask(task, s)
  );
  return { toAdd, toRemove };
}

/** Le delta est-il applicable (statuts ouverts + places suffisantes) ? Le contrôle `isTeacher` reste côté composant. */
export function canApplyQuickAssign(task, selectedIds, teacherStudents) {
  if (!task) return false;
  const { toAdd, toRemove } = computeQuickAssignDelta(task, selectedIds, teacherStudents);
  if (toAdd.length === 0 && toRemove.length === 0) return false;
  const te = taskEffectiveStatus(task);
  if (te === 'on_hold' || te === 'project_completed' || te === 'project_validated') return false;
  if (toRemove.length > 0 && (task.status === 'done' || task.status === 'validated')) return false;
  if (toAdd.length > 0) {
    if (task.status === 'proposed' || task.status === 'done' || task.status === 'validated') return false;
    const slotsAfterRemovals = getAvailableSlots(task) + toRemove.length;
    if (toAdd.length > slotsAfterRemovals) return false;
  }
  return true;
}

/** Message d'aide contextualisé du panneau d'affectation rapide (pourquoi c'est bloqué, ou résumé du delta). */
export function quickAssignHintText(task, selectedIds, teacherStudents) {
  if (!task) return "Cette tâche n’est pas dispo ici";
  const te = taskEffectiveStatus(task);
  if (te === 'on_hold') return "Patience : tâche ou projet en pause";
  if (te === 'project_completed') return "Projet terminé : inscriptions fermées";
  if (te === 'project_validated') return "Projet validé : inscriptions fermées";
  const { toAdd, toRemove } = computeQuickAssignDelta(task, selectedIds, teacherStudents);
  if (toAdd.length === 0 && toRemove.length === 0) return "Coche ou décoche des n3beurs pour ajuster l’équipe sur la mission";
  if (toRemove.length > 0 && (task.status === 'done' || task.status === 'validated')) {
    return "Mission déjà bouclée : on ne retire plus les inscrits";
  }
  if (toAdd.length > 0) {
    if (task.status === 'proposed') return "Idée encore en discussion : inscriptions pas encore ouvertes";
    if (task.status === 'done' || task.status === 'validated') return "C’est déjà plié pour celle-ci";
    const slotsAfterRemovals = getAvailableSlots(task) + toRemove.length;
    if (toAdd.length > slotsAfterRemovals) {
      return `Pas assez de places (max. ${slotsAfterRemovals} après retrait${toRemove.length > 1 ? 's' : ''})`;
    }
  }
  const parts = [];
  if (toRemove.length > 0) parts.push(`Retirer ${toRemove.length} n3beur${toRemove.length > 1 ? 's' : ''}`);
  if (toAdd.length > 0) parts.push(`Inscrire ${toAdd.length} n3beur${toAdd.length > 1 ? 's' : ''}`);
  return parts.join(' · ');
}
