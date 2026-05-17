'use strict';

/**
 * Recalcul du statut de tâche aligné sur routes/tasks.js, utilisable avec le pool
 * ou une connexion transactionnelle ({ queryOne, execute }).
 */

const ALLOWED_TASK_STATUSES = new Set(['available', 'in_progress', 'done', 'validated', 'proposed', 'on_hold']);
const ALLOWED_TASK_COMPLETION_MODES = new Set(['single_done', 'all_assignees_done']);

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeImportTaskStatus(value) {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return 'available';
  if (['disponible'].includes(raw)) return 'available';
  if (['en_cours', 'encours', 'en cours'].includes(raw)) return 'in_progress';
  if (['terminee', 'terminée'].includes(raw)) return 'done';
  if (['validee', 'validée'].includes(raw)) return 'validated';
  if (['proposee', 'proposée'].includes(raw)) return 'proposed';
  if (['en_attente', 'en attente', 'attente'].includes(raw)) return 'on_hold';
  return ALLOWED_TASK_STATUSES.has(raw) ? raw : null;
}

function normalizeTaskStatusForRead(value) {
  return normalizeImportTaskStatus(value) || 'available';
}

function normalizeTaskCompletionMode(value) {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return 'single_done';
  return ALLOWED_TASK_COMPLETION_MODES.has(raw) ? raw : null;
}

function computeTaskStatusFromProgress({ currentStatus, completionMode, assignedCount, doneCount }) {
  if (currentStatus === 'validated' || currentStatus === 'proposed' || currentStatus === 'on_hold') {
    return currentStatus;
  }
  if (completionMode === 'all_assignees_done') {
    if (assignedCount <= 0) return 'available';
    if (doneCount >= assignedCount) return 'done';
    return 'in_progress';
  }
  if (currentStatus === 'done') return 'done';
  if (assignedCount <= 0) return 'available';
  return 'in_progress';
}

async function fetchTaskAssignmentProgressConn(conn, taskId) {
  const progress = await conn.queryOne(
    `SELECT COUNT(*) AS assigned_count,
            SUM(CASE WHEN done_at IS NOT NULL THEN 1 ELSE 0 END) AS done_count
       FROM task_assignments
      WHERE task_id = ?`,
    [taskId]
  );
  return {
    assignedCount: Number(progress?.assigned_count) || 0,
    doneCount: Number(progress?.done_count) || 0,
  };
}

/**
 * @param {{ queryOne: Function, execute: Function }} conn Pool ou objet transaction `tx`.
 * @param {object|string} taskLike Ligne `tasks` avec id/status/completion_mode ou id string.
 */
async function recalculateTaskStatusWithConn(conn, taskLike) {
  const task =
    typeof taskLike === 'string'
      ? await conn.queryOne('SELECT id, status, completion_mode FROM tasks WHERE id = ?', [taskLike])
      : taskLike;
  if (!task || !task.id) return null;
  const currentStatus = normalizeTaskStatusForRead(task.status);
  const completionMode = normalizeTaskCompletionMode(task.completion_mode) || 'single_done';
  const progress = await fetchTaskAssignmentProgressConn(conn, task.id);
  const nextStatus = computeTaskStatusFromProgress({
    currentStatus,
    completionMode,
    assignedCount: progress.assignedCount,
    doneCount: progress.doneCount,
  });
  if (nextStatus !== currentStatus) {
    await conn.execute('UPDATE tasks SET status = ? WHERE id = ?', [nextStatus, task.id]);
  }
  return {
    status: nextStatus,
    completionMode,
    assignedCount: progress.assignedCount,
    doneCount: progress.doneCount,
  };
}

module.exports = {
  computeTaskStatusFromProgress,
  normalizeTaskStatusForRead,
  normalizeTaskCompletionMode,
  fetchTaskAssignmentProgressConn,
  recalculateTaskStatusWithConn,
};
