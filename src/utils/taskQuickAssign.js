/**
 * Logique pure de l'affectation rapide n3boss (panneau « Inscrire des n3beurs »).
 *
 * Extraite de `tasks-views.jsx` (O6) : calcul du delta inscriptions/retraits, faisabilité,
 * message d'aide et résumé d'exécution — sans React, testable unitairement
 * (`tests-ui/utils/taskQuickAssign.test.js`). `executeQuickAssignPlan` reçoit le client
 * API en injection (`apiCall`) : aucune dépendance directe aux services côté util.
 */

import { getAvailableSlots, isStudentAlreadyAssignedToTask } from './taskComputations.js';
import { taskEffectiveStatus } from './taskListHelpers.js';

/** Inscriptions à ajouter / retirer (liste n3beurs chargée côté n3boss) pour l'affectation rapide. */
export function computeQuickAssignDelta(task, selectedIds, teacherStudents) {
  const idSet = new Set((selectedIds || []).map(String));
  const toAdd = (teacherStudents || []).filter(
    (s) => idSet.has(String(s.id)) && !isStudentAlreadyAssignedToTask(task, s),
  );
  const toRemove = (teacherStudents || []).filter(
    (s) => !idSet.has(String(s.id)) && isStudentAlreadyAssignedToTask(task, s),
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
    if (task.status === 'proposed' || task.status === 'done' || task.status === 'validated')
      return false;
    const slotsAfterRemovals = getAvailableSlots(task) + toRemove.length;
    if (toAdd.length > slotsAfterRemovals) return false;
  }
  return true;
}

/** Message d'aide contextualisé du panneau d'affectation rapide (pourquoi c'est bloqué, ou résumé du delta). */
export function quickAssignHintText(task, selectedIds, teacherStudents) {
  if (!task) return 'Cette tâche n’est pas dispo ici';
  const te = taskEffectiveStatus(task);
  if (te === 'on_hold') return 'Patience : tâche ou projet en pause';
  if (te === 'project_completed') return 'Projet terminé : inscriptions fermées';
  if (te === 'project_validated') return 'Projet validé : inscriptions fermées';
  const { toAdd, toRemove } = computeQuickAssignDelta(task, selectedIds, teacherStudents);
  if (toAdd.length === 0 && toRemove.length === 0)
    return 'Coche ou décoche des n3beurs pour ajuster l’équipe sur la mission';
  if (toRemove.length > 0 && (task.status === 'done' || task.status === 'validated')) {
    return 'Mission déjà bouclée : on ne retire plus les inscrits';
  }
  if (toAdd.length > 0) {
    if (task.status === 'proposed')
      return 'Idée encore en discussion : inscriptions pas encore ouvertes';
    if (task.status === 'done' || task.status === 'validated')
      return 'C’est déjà plié pour celle-ci';
    const slotsAfterRemovals = getAvailableSlots(task) + toRemove.length;
    if (toAdd.length > slotsAfterRemovals) {
      return `Pas assez de places (max. ${slotsAfterRemovals} après retrait${toRemove.length > 1 ? 's' : ''})`;
    }
  }
  const parts = [];
  if (toRemove.length > 0)
    parts.push(`Retirer ${toRemove.length} n3beur${toRemove.length > 1 ? 's' : ''}`);
  if (toAdd.length > 0) parts.push(`Inscrire ${toAdd.length} n3beur${toAdd.length > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

/**
 * Exécute le plan d'affectation rapide : retraits d'abord (ils libèrent des places),
 * puis inscriptions tant qu'il reste des places. Les erreurs sont comptées sans
 * interrompre le lot (sauf « plus de place », qui stoppe les inscriptions).
 * `apiCall(path, method, body)` est injecté — retourne les compteurs pour le toast.
 */
export async function executeQuickAssignPlan(apiCall, task, { toAdd, toRemove }) {
  let removeOk = 0;
  let removeFail = 0;
  let firstRemoveError = '';
  for (const targetStudent of toRemove) {
    try {
      await apiCall(`/api/tasks/${task.id}/unassign`, 'POST', {
        firstName: targetStudent.first_name,
        lastName: targetStudent.last_name,
        studentId: targetStudent.id,
      });
      removeOk += 1;
    } catch (e) {
      removeFail += 1;
      if (!firstRemoveError) firstRemoveError = e.message || 'Erreur inconnue';
    }
  }
  let slotsRemaining = getAvailableSlots(task) + removeOk;
  let addOk = 0;
  let addFail = 0;
  let firstAddError = '';
  for (const targetStudent of toAdd) {
    if (slotsRemaining <= 0) break;
    try {
      await apiCall(`/api/tasks/${task.id}/assign`, 'POST', {
        firstName: targetStudent.first_name,
        lastName: targetStudent.last_name,
        studentId: targetStudent.id,
      });
      addOk += 1;
      slotsRemaining -= 1;
    } catch (e) {
      addFail += 1;
      if (!firstAddError) firstAddError = e.message || 'Erreur inconnue';
      if (
        String(e.message || '')
          .toLowerCase()
          .includes('plus de place')
      )
        break;
    }
  }
  return { removeOk, removeFail, firstRemoveError, addOk, addFail, firstAddError };
}

/** Message de toast résumant l'issue du quick-assign (réussites, échecs partiels, rien à faire). */
export function quickAssignOutcomeToast(task, outcome) {
  const {
    removeOk = 0,
    removeFail = 0,
    firstRemoveError = '',
    addOk = 0,
    addFail = 0,
    firstAddError = '',
  } = outcome || {};
  const bits = [];
  if (removeOk > 0) bits.push(`${removeOk} retrait${removeOk > 1 ? 's' : ''}`);
  if (addOk > 0) bits.push(`${addOk} inscription${addOk > 1 ? 's' : ''}`);
  const errBits = [];
  if (removeFail > 0) errBits.push(`${removeFail} retrait${removeFail > 1 ? 's' : ''}`);
  if (addFail > 0) errBits.push(`${addFail} inscription${addFail > 1 ? 's' : ''}`);
  if (bits.length > 0 && errBits.length > 0) {
    return `${bits.join(', ')} — échec : ${errBits.join(', ')}${firstRemoveError || firstAddError ? ` (${firstRemoveError || firstAddError})` : ''}`;
  }
  if (bits.length > 0) return `${bits.join(', ')} sur « ${task.title} »`;
  if (firstRemoveError || firstAddError)
    return `Aucune mise à jour : ${firstRemoveError || firstAddError}`;
  return 'Aucun changement appliqué — déjà à jour.';
}
