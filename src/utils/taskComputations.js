/**
 * Calculs purs sur les tâches (assignation, créneaux, complétion, proposition).
 *
 * Extraits de `src/components/tasks-views.jsx` (O6) : logique métier pure, sans React ni I/O,
 * donc testable unitairement (`tests-ui/utils/taskComputations.test.js`) et réutilisable.
 * Aligné sur le contrat API (`assigned_count`, `assignments[]`, `completion_mode`, etc.).
 */

import { assignmentMatchesStudent } from './task-assignments.js';

/** Nombre d'inscrits sur une tâche (priorité au compteur API, repli sur la liste). */
export function getAssignedCount(task) {
  const fromApi = Number(task?.assigned_count);
  if (Number.isFinite(fromApi) && fromApi >= 0) return fromApi;
  return Array.isArray(task?.assignments) ? task.assignments.length : 0;
}

/** Créneaux restants (>= 0) : `required_students` (min 1) moins les inscrits. */
export function getAvailableSlots(task) {
  const required = Math.max(1, Number(task?.required_students || 1));
  return Math.max(0, required - getAssignedCount(task));
}

/** Mode de complétion : `all_assignees_done` (collectif) ou `single_done` (individuel, défaut). */
export function getCompletionMode(task) {
  return task?.completion_mode === 'all_assignees_done' ? 'all_assignees_done' : 'single_done';
}

/** Nombre d'inscrits ayant marqué leur part faite (compteur API, repli sur `done_at`). */
export function getAssigneesDoneCount(task) {
  const fromApi = Number(task?.assignees_done_count);
  if (Number.isFinite(fromApi) && fromApi >= 0) return fromApi;
  if (!Array.isArray(task?.assignments)) return 0;
  return task.assignments.reduce(
    (count, assignment) => (assignment?.done_at ? count + 1 : count),
    0,
  );
}

/** Libellé lisible du mode de complétion. */
export function completionModeLabel(mode) {
  return mode === 'all_assignees_done' ? 'Validation collective' : 'Validation individuelle';
}

/**
 * Indique si un élève est déjà inscrit sur la tâche.
 * Aligné sur l'API : match par `student_id` OU par (prénom, nom) insensible à la casse.
 * Délègue au matcher unique `assignmentMatchesStudent` (export conservé).
 */
export function isStudentAlreadyAssignedToTask(task, targetStudent = null) {
  if (!task || !targetStudent) return false;
  return (task.assignments || []).some((a) => assignmentMatchesStudent(a, targetStudent));
}

/**
 * Extrait le proposeur (« Proposition élève/n3beur: … ») d'une description de tâche proposée
 * et renvoie la description nettoyée (sans la ligne de proposition).
 */
export function proposalMetaFromDescription(description) {
  const raw = String(description || '');
  if (!raw) return { proposer: '', cleanedDescription: '' };
  const match = raw.match(/(?:^|\n)Proposition (?:élève|n3beur):\s*(.+)\s*$/m);
  const proposer = match?.[1]?.trim() || '';
  const cleanedDescription = raw
    .replace(/(?:^|\n)Proposition (?:élève|n3beur):\s*.+\s*$/m, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { proposer, cleanedDescription };
}
