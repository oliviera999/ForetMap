import React from 'react';
import { dueDateChip, TaskDifficultyAndRiskChips } from '../../utils/badges';
import { normalizeDateOnly } from '../../utils/taskListHelpers.js';
import { completionModeLabel } from '../../utils/taskComputations.js';

function startDateChip(startDate) {
  const normalized = normalizeDateOnly(startDate);
  if (!normalized) return null;
  const parsed = new Date(`${normalized}T00:00:00`);
  const label = Number.isNaN(parsed.getTime())
    ? normalized
    : parsed.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  return <span className="task-chip">🚦 Départ: {label}</span>;
}

/**
 * Ligne de méta d'une tuile de tâche (feuille prop-driven).
 *
 * Extraite de `TaskTileCard` (O6) : la rangée de « chips » au-dessus de la
 * description (zones, marqueurs, projet, dates, mode de complétion, difficulté,
 * récurrence…). Bloc purement présentationnel — aucun state, le parent calcule
 * et passe `completionMode`, `proposalMeta`, `doneCount`/`totalCount`, etc.
 */
export function TaskTileMeta({
  t,
  isTeacher,
  roleTerms,
  proposalMeta,
  completionMode,
  isCollectiveCompletion,
  doneCount,
  totalCount,
}) {
  return (
    <div className="task-meta">
      {(t.zones_linked || []).map((z) => (
        <span key={z.id} className="task-chip">{z.name}</span>
      ))}
      {!((t.zones_linked || []).length) && t.zone_name && <span className="task-chip">{t.zone_name}</span>}
      {(t.markers_linked || []).map((m) => (
        <span key={m.id} className="task-chip">📍 {m.label}</span>
      ))}
      {!((t.markers_linked || []).length) && t.marker_label && <span className="task-chip">📍 {t.marker_label}</span>}
      {t.project_title && <span className="task-chip">📁 {t.project_title}</span>}
      {t.project_title && t.project_status === 'on_hold' && <span className="task-chip">⏸️ Projet en attente</span>}
      {t.project_title && t.project_status === 'completed' && <span className="task-chip">Terminé (projet)</span>}
      {t.project_title && t.project_status === 'validated' && <span className="task-chip">Validé (projet)</span>}
      {startDateChip(t.start_date)}
      {isTeacher && t.status === 'proposed' && proposalMeta.proposer && (
        <span className="task-chip proposal">🙋 Proposée par {proposalMeta.proposer}</span>
      )}
      {dueDateChip(t.due_date)}
      {!isTeacher && <span className="task-chip">👤 {t.required_students} {t.required_students > 1 ? roleTerms.studentPlural : roleTerms.studentSingular}</span>}
      <span className="task-chip">🧩 {completionModeLabel(completionMode)}</span>
      <TaskDifficultyAndRiskChips task={t} />
      {isCollectiveCompletion && <span className="task-chip">✅ {doneCount}/{totalCount} terminé{totalCount > 1 ? 's' : ''}</span>}
      {t.recurrence && <span className="task-chip">🔄 {t.recurrence === 'weekly' ? 'Hebdo' : t.recurrence === 'biweekly' ? 'Bi-hebdo' : t.recurrence === 'monthly' ? 'Mensuel' : t.recurrence}</span>}
    </div>
  );
}
