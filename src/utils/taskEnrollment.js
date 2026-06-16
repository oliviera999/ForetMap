/**
 * Logique d'inscription des élèves aux tâches et statut visuel sur la carte.
 *
 * Extrait de `map-views.jsx` (O6) : fonctions pures (les couleurs/labels de
 * `taskEnrollmentMeta` sont de simples données, pas de JSX). `TaskEnrollmentLegend`
 * (rendu JSX) reste dans le composant.
 */
import { isStudentAssignedToTask } from './task-assignments.js';
import { taskEffectiveStatus } from './taskListHelpers.js';

/** Places restantes (élèves requis − inscrits), bornées à 0. */
export function taskOpenSlots(task) {
  const required = Number(task?.required_students || 1);
  const assigned = Array.isArray(task?.assignments) ? task.assignments.length : 0;
  return Math.max(0, required - assigned);
}

/** Un élève peut-il s'inscrire : tâche ouverte, non déjà prise, places restantes. */
export function canStudentAssignTask(task, student) {
  if (!task || !student) return false;
  const effectiveStatus = taskEffectiveStatus(task);
  if (
    effectiveStatus === 'validated' ||
    effectiveStatus === 'done' ||
    effectiveStatus === 'on_hold' ||
    effectiveStatus === 'project_completed' ||
    effectiveStatus === 'project_validated'
  )
    return false;
  if (isStudentAssignedToTask(task, student)) return false;
  return taskOpenSlots(task) > 0;
}

/** Métadonnées d'affichage (ton/fond/bordure/label) de l'état d'inscription côté carte. */
export function taskEnrollmentMeta(task, student) {
  const isMine = isStudentAssignedToTask(task, student);
  const slots = taskOpenSlots(task);
  const effectiveStatus = taskEffectiveStatus(task);
  const isClosed = effectiveStatus === 'validated' || effectiveStatus === 'done';
  if (isMine) {
    return {
      tone: '#0f766e',
      bg: '#f0fdfa',
      border: '#99f6e4',
      dot: '●',
      label: 'Déjà prise par toi',
    };
  }
  if (effectiveStatus === 'on_hold') {
    return { tone: '#92400e', bg: '#fffbeb', border: '#fde68a', dot: '●', label: 'En attente' };
  }
  if (effectiveStatus === 'project_completed') {
    return { tone: '#92400e', bg: '#fffbeb', border: '#fde68a', dot: '●', label: 'Projet terminé' };
  }
  if (effectiveStatus === 'project_validated') {
    return { tone: '#166534', bg: '#f0fdf4', border: '#86efac', dot: '●', label: 'Projet validé' };
  }
  if (isClosed) {
    return {
      tone: '#92400e',
      bg: '#fffbeb',
      border: '#fde68a',
      dot: '●',
      label: effectiveStatus === 'done' ? 'Terminée (en attente)' : 'Validée',
    };
  }
  if (slots <= 0) {
    return { tone: '#991b1b', bg: '#fef2f2', border: '#fecaca', dot: '●', label: 'Complet' };
  }
  return {
    tone: '#166534',
    bg: '#f0fdf4',
    border: '#86efac',
    dot: '●',
    label: `${slots} place${slots > 1 ? 's' : ''} disponible${slots > 1 ? 's' : ''}`,
  };
}

// ── Statut visuel agrégé d'un lieu (priorité todo > progress > done : on met en
//    avant la tâche la plus actionnable quand un lieu en cumule plusieurs) ──────
export const TASK_VISUAL_PRIORITY = { done: 1, progress: 2, todo: 3 };
export const TASK_VISUAL_LABEL = {
  todo: 'Tâche à faire',
  progress: 'Tâche en cours',
  done: 'Tâche terminée',
};

export function taskVisualStatus(status) {
  if (status === 'on_hold') return null;
  if (status === 'available') return 'todo';
  if (status === 'in_progress') return 'progress';
  if (status === 'done' || status === 'validated') return 'done';
  return null;
}

export function mergeTaskVisualStatus(current, next) {
  if (!current) return next;
  if (!next) return current;
  return (TASK_VISUAL_PRIORITY[next] || 0) > (TASK_VISUAL_PRIORITY[current] || 0) ? next : current;
}
