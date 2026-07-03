import React from 'react';
import { TaskDifficultyAndRiskChips } from '../../utils/badges';
import { isStudentAssignedToTask } from '../../utils/task-assignments';
import { canStudentAssignTask, taskEnrollmentMeta } from '../../utils/taskEnrollment.js';
import { TaskEnrollmentLegend } from './mapModalShared.jsx';

/**
 * Onglet « Tâches » des modales de lieu (ZoneInfoModal / MarkerModal) — variantes
 * enseignant / élève. Feuilles pilotées par props ; état (`linkTaskId`,
 * `selectedTaskIds`, `assigning`) et callbacks détenus par le modal parent.
 * Extrait de `ZoneInfoModal.jsx` (O6, 2e niveau), paramétré par `locationKind`
 * (libellés zone / repère) pour résorber les copies inline de MarkerModal (audit §5.3).
 */

/** Message d'état vide selon le type de lieu (zone / repère). */
function emptyLinkedTasksMessage(locationKind) {
  return locationKind === 'marker'
    ? 'Aucune tâche liée à ce repère.'
    : 'Aucune tâche liée à cette zone.';
}

/** Vue enseignant : tâches liées (avec « Délier ») + liaison d'une tâche existante. */
export function ZoneTasksTeacherPanel({
  locationKind = 'zone',
  linkedTasks,
  assignableTasks,
  linkTaskId,
  onChangeLinkTaskId,
  onUnlinkTask,
  onLinkTask,
}) {
  return (
    <div className="fade-in">
      <div style={{ marginTop: 12 }}>
        {linkedTasks.length === 0 ? (
          <p style={{ color: '#999', fontSize: '.85rem' }}>
            {emptyLinkedTasksMessage(locationKind)}
          </p>
        ) : (
          linkedTasks.map((t) => (
            <div key={t.id} className="history-item" style={{ alignItems: 'center' }}>
              <span>{t.title}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => onUnlinkTask?.(t)}>
                Délier
              </button>
            </div>
          ))
        )}
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label>Lier une tâche existante</label>
        <select value={linkTaskId} onChange={(e) => onChangeLinkTaskId(e.target.value)}>
          <option value="">— Choisir une tâche —</option>
          {assignableTasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </div>
      <button
        className="btn btn-primary btn-full"
        disabled={!linkTaskId}
        onClick={() => onLinkTask?.(linkTaskId)}
      >
        🔗 Lier la tâche
      </button>
    </div>
  );
}

/** Vue élève / visiteur : sélection multiple des tâches liées et inscription groupée. */
export function ZoneTasksStudentPanel({
  locationKind = 'zone',
  linkedTasks,
  student,
  canSelfAssignTasks,
  canEnroll,
  selectedTaskIds,
  assigning,
  onToggleTask,
  onAssign,
}) {
  if (linkedTasks.length === 0) {
    return (
      <div className="fade-in">
        <p style={{ color: '#999', fontSize: '.85rem' }}>{emptyLinkedTasksMessage(locationKind)}</p>
      </div>
    );
  }
  return (
    <div className="fade-in">
      <TaskEnrollmentLegend />
      <p style={{ color: '#666', fontSize: '.84rem', marginBottom: 10 }}>
        {canSelfAssignTasks
          ? 'Sélectionne une ou plusieurs tâches puis inscris-toi directement.'
          : 'Profil visiteur : consultation en lecture seule.'}
      </p>
      {canSelfAssignTasks && Number(student?.taskEnrollment?.maxActiveAssignments) > 0 && (
        <p
          style={{
            fontSize: '.78rem',
            color: student?.taskEnrollment?.atLimit ? '#92400e' : '#166534',
            marginBottom: 10,
            lineHeight: 1.45,
          }}
        >
          {student.taskEnrollment?.atLimit
            ? `Limite atteinte (${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} tâches actives). Retire-toi d’une tâche ou attends une validation.`
            : `Tâches actives : ${student.taskEnrollment.currentActiveAssignments}/${student.taskEnrollment.maxActiveAssignments} (non validées, toutes cartes).`}
        </p>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {linkedTasks.map((t) => {
          const canAssign = canStudentAssignTask(t, student);
          const isMine = isStudentAssignedToTask(t, student);
          const meta = taskEnrollmentMeta(t, student);
          const checked = selectedTaskIds.includes(t.id);
          return (
            <label
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                border: '1px solid rgba(0,0,0,.08)',
                borderRadius: 10,
                padding: '10px 12px',
                background: checked ? '#f0fdf4' : 'var(--parchment)',
                cursor: canAssign ? 'pointer' : 'default',
                opacity: canAssign || isMine ? 1 : 0.72,
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={!canEnroll || !canAssign || assigning}
                onChange={() => {
                  if (!canEnroll || !canAssign) return;
                  onToggleTask(t.id);
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--forest)', fontSize: '.9rem' }}>
                  {t.title}
                </div>
                <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    className="task-chip"
                    style={{ color: meta.tone, borderColor: meta.border, background: meta.bg }}
                  >
                    <span style={{ marginRight: 4, opacity: 0.8 }}>{meta.dot}</span>
                    {meta.label}
                  </span>
                  <TaskDifficultyAndRiskChips task={t} />
                </div>
              </div>
            </label>
          );
        })}
      </div>
      <button
        className="btn btn-primary btn-full"
        style={{ marginTop: 12 }}
        disabled={!canEnroll || assigning || selectedTaskIds.length === 0}
        onClick={onAssign}
      >
        {assigning
          ? 'Inscription...'
          : `✋ M'inscrire à ${selectedTaskIds.length || '...'} tâche(s)`}
      </button>
    </div>
  );
}
