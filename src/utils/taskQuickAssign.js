/**
 * Affectation rapide n3boss (cases à cocher par tâche) — logique pure extraite de
 * `tasks-views.jsx` (O6). Calcule le delta d'inscriptions, l'applicabilité et le message
 * d'aide, à partir de la tâche, des ids cochés et de la liste des n3beurs du n3boss.
 */

import { getAvailableSlots, isStudentAlreadyAssignedToTask } from './taskComputations.js';
import { taskEffectiveStatus } from './taskListHelpers.js';

/** Inscriptions à ajouter / retirer (liste n3beurs chargée côté n3boss) pour l’affectation rapide. */
export function quickAssignDelta(task, selectedIds, teacherStudents) {
  const idSet = new Set((selectedIds || []).map(String));
  const students = Array.isArray(teacherStudents) ? teacherStudents : [];
  const toAdd = students.filter(
    (s) => idSet.has(String(s.id)) && !isStudentAlreadyAssignedToTask(task, s)
  );
  const toRemove = students.filter(
    (s) => !idSet.has(String(s.id)) && isStudentAlreadyAssignedToTask(task, s)
  );
  return { toAdd, toRemove };
}

/** Vrai si la sélection courante peut être appliquée (statuts, pause projet, places disponibles). */
export function quickAssignCanApply(task, selectedIds, teacherStudents, isTeacher) {
  if (!isTeacher || !task) return false;
  const { toAdd, toRemove } = quickAssignDelta(task, selectedIds, teacherStudents);
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

/** Message d'aide contextualisé de l'affectation rapide (pourquoi c'est bloqué, ou le résumé du delta). */
export function quickAssignHint(task, selectedIds, teacherStudents) {
  if (!task) return "Cette tâche n’est pas dispo ici";
  const te = taskEffectiveStatus(task);
  if (te === 'on_hold') return "Patience : tâche ou projet en pause";
  if (te === 'project_completed') return "Projet terminé : inscriptions fermées";
  if (te === 'project_validated') return "Projet validé : inscriptions fermées";
  const { toAdd, toRemove } = quickAssignDelta(task, selectedIds, teacherStudents);
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
