import React from 'react';
import { STAGE_LABELS, STAGE_CLASS } from '../constants/garden';
import { getRoleTerms } from './n3-terminology';

export function stageBadge(stage) {
  return (
    <span className={`stage-badge ${STAGE_CLASS[stage] || 'stage-empty'}`}>
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

function taskStatusAria(status, isN3Affiliated) {
  const roleTerms = getRoleTerms(isN3Affiliated);
  const labels = {
    available: 'À faire',
    in_progress: 'En cours',
    done: 'Terminée',
    validated: 'Validée',
    proposed: `Proposition ${roleTerms.studentSingular}`,
    on_hold: 'En attente',
  };
  return labels[status] || status;
}

/** Pastille discrète : rouge/orange pulsés, vert fixe une fois terminée. */
export function taskStatusIndicator(status, isN3Affiliated = false) {
  const aria = taskStatusAria(status, isN3Affiliated);
  const pulseClass =
    status === 'available'
      ? 'task-status-dot--todo'
      : status === 'proposed'
        ? 'task-status-dot--todo'
      : status === 'on_hold'
        ? 'task-status-dot--progress'
      : status === 'in_progress'
        ? 'task-status-dot--progress'
        : 'task-status-dot--done';
  return (
    <span
      className={`task-status-dot ${pulseClass}`}
      role="img"
      aria-label={aria}
      title={aria}
    />
  );
}

export function statusBadge(status) {
  const labels = {
    available: 'Disponible',
    in_progress: 'En cours',
    done: 'Terminée',
    validated: 'Validée ✓',
    proposed: 'Proposée',
    on_hold: 'En attente',
  };
  return <span className={`status-badge status-${status}`}>{labels[status] || status}</span>;
}

export function daysUntil(date) {
  if (!date) return null;
  const diff = Math.ceil((new Date(date) - new Date()) / 86400000);
  return diff;
}

export function dueDateChip(date) {
  if (!date) return null;
  const d = daysUntil(date);
  const label =
    d < 0 ? `En retard de ${-d}j` : d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : `Dans ${d}j`;
  return (
    <span className={`task-chip ${d <= 1 ? 'urgent' : ''}`}>📅 {label}</span>
  );
}

const TASK_DIFFICULTY_LEVELS = new Set(['easy', 'medium', 'hard', 'very_hard']);
const TASK_DANGER_LEVELS = new Set(['safe', 'potential_danger', 'dangerous', 'very_dangerous']);
const TASK_IMPORTANCE_LEVELS = new Set(['not_important', 'low', 'medium', 'high', 'absolute']);

/** Niveau renseigné explicitement (sinon null — pas d’affichage). */
export function getDefinedTaskDifficultyLevel(task) {
  const v = task?.difficulty_level;
  if (v == null) return null;
  const raw = String(v).trim().toLowerCase();
  return TASK_DIFFICULTY_LEVELS.has(raw) ? raw : null;
}

export function getDefinedTaskDangerLevel(task) {
  const v = task?.danger_level;
  if (v == null) return null;
  const raw = String(v).trim().toLowerCase();
  return TASK_DANGER_LEVELS.has(raw) ? raw : null;
}

export function getDefinedTaskImportanceLevel(task) {
  const v = task?.importance_level;
  if (v == null) return null;
  const raw = String(v).trim().toLowerCase();
  return TASK_IMPORTANCE_LEVELS.has(raw) ? raw : null;
}

const TASK_DIFFICULTY_DISPLAY = {
  easy: { emoji: '🌱', label: 'Facile', title: 'Difficulté : facile' },
  medium: { emoji: '🪜', label: 'Moyen', title: 'Difficulté : moyenne' },
  hard: { emoji: '🧗', label: 'Compliqué', title: 'Difficulté : compliquée' },
  very_hard: { emoji: '⛰️', label: 'Super compliqué', title: 'Difficulté : très élevée' },
};

const TASK_IMPORTANCE_DISPLAY = {
  not_important: { emoji: '○', label: 'Pas important', title: 'Importance : pas important' },
  low: { emoji: '◔', label: 'Peu important', title: 'Importance : peu important' },
  medium: { emoji: '◕', label: 'Modéré', title: 'Importance : modéré' },
  high: { emoji: '⏫', label: 'Important', title: 'Importance : important' },
  absolute: { emoji: '🎯', label: 'Priorité absolue', title: 'Importance : priorité absolue' },
};

const TASK_DANGER_DISPLAY = {
  safe: { emoji: '🛡️', label: 'Sans danger', title: 'Danger : sans danger' },
  potential_danger: {
    emoji: '🔸',
    label: 'Danger potentiel',
    title: 'Danger : potentiel — vigilance recommandée',
  },
  dangerous: { emoji: '⚠️', label: 'Dangereux', title: 'Danger : dangereux — précautions requises' },
  very_dangerous: { emoji: '🚨', label: 'Très dangereux', title: 'Danger : très dangereux — accord adulte requis' },
};

/** Tâche à traiter avec les référents avant toute action (difficulté élevée ou risque). */
export function taskRequiresReferentBriefingBeforeStart(task) {
  const d = getDefinedTaskDifficultyLevel(task);
  const g = getDefinedTaskDangerLevel(task);
  return d === 'hard' || d === 'very_hard' || g === 'dangerous' || g === 'very_dangerous';
}

/** Pastilles importance, difficulté et/ou danger uniquement si renseignés côté fiche tâche. */
export function TaskDifficultyAndRiskChips({ task }) {
  const i = getDefinedTaskImportanceLevel(task);
  const d = getDefinedTaskDifficultyLevel(task);
  const g = getDefinedTaskDangerLevel(task);
  const imp = i ? TASK_IMPORTANCE_DISPLAY[i] : null;
  const diff = d ? TASK_DIFFICULTY_DISPLAY[d] : null;
  const risk = g ? TASK_DANGER_DISPLAY[g] : null;
  const riskExtraClass = g === 'very_dangerous' ? ' urgent' : '';
  const riskStyle =
    g === 'potential_danger'
      ? { background: '#ecfeff', color: '#0e7490' }
      : g === 'dangerous'
        ? { background: '#fffbeb', color: '#b45309' }
        : undefined;
  const impExtraClass = i === 'absolute' || i === 'high' ? ' urgent' : '';
  if (!imp && !diff && !risk) return null;
  return (
    <>
      {imp ? (
        <span className={`task-chip${impExtraClass}`} title={imp.title}>
          {imp.emoji} {imp.label}
        </span>
      ) : null}
      {diff ? (
        <span className="task-chip" title={diff.title}>
          {diff.emoji} {diff.label}
        </span>
      ) : null}
      {risk ? (
        <span className={`task-chip${riskExtraClass}`} title={risk.title} style={riskStyle}>
          {risk.emoji} {risk.label}
        </span>
      ) : null}
    </>
  );
}
