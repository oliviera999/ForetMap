import React from 'react';
import { STAGE_LABELS, STAGE_CLASS } from '../constants/garden';

export function stageBadge(stage) {
  return (
    <span className={`stage-badge ${STAGE_CLASS[stage] || 'stage-empty'}`}>
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

export function statusBadge(status) {
  const labels = {
    available: 'Disponible',
    in_progress: 'En cours',
    done: 'Terminée',
    validated: 'Validée ✓',
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
