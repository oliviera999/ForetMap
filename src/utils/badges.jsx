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
