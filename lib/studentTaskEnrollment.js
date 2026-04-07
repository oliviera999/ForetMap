'use strict';

const { queryOne } = require('../database');
const { getSettingValue } = require('./settings');

const MAX_CONCURRENT_TASKS_CAP = 99;

/**
 * Plafond effectif pour les auto-inscriptions n3beur : colonne `roles.max_concurrent_tasks` si renseignée,
 * sinon réglage global `tasks.student_max_active_assignments`. 0 = pas de limite.
 */
async function getEffectiveMaxActiveTaskAssignments(studentId) {
  const globalRaw = await getSettingValue('tasks.student_max_active_assignments', 0);
  const globalVal = Math.min(
    MAX_CONCURRENT_TASKS_CAP,
    Math.max(0, parseInt(globalRaw, 10) || 0)
  );
  if (!studentId) return globalVal;
  const row = await queryOne(
    `SELECT r.max_concurrent_tasks AS mct
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = 'student' AND ur.is_primary = 1
       INNER JOIN roles r ON r.id = ur.role_id
      WHERE u.id = ? AND u.user_type = 'student'
      LIMIT 1`,
    [String(studentId)]
  );
  if (row && row.mct != null) {
    return Math.min(MAX_CONCURRENT_TASKS_CAP, Math.max(0, parseInt(row.mct, 10) || 0));
  }
  return globalVal;
}

/**
 * Nombre de tâches distinctes où le n3beur est inscrit et la tâche n'est pas encore validée par un n3boss,
 * sauf les tâches en mode collectif (`all_assignees_done`) pour lesquelles il a déjà marqué sa part
 * (`task_assignments.done_at`), afin qu'il puisse s'inscrire ailleurs sans attendre les autres inscrits.
 */
async function countStudentActiveTaskAssignments(studentId, firstName, lastName) {
  const sid = studentId != null && String(studentId).trim() !== '' ? String(studentId) : null;
  const fn = String(firstName || '').trim();
  const ln = String(lastName || '').trim();
  const row = await queryOne(
    `SELECT COUNT(DISTINCT ta.task_id) AS c
       FROM task_assignments ta
       INNER JOIN tasks t ON t.id = ta.task_id
      WHERE LOWER(t.status) <> 'validated'
        AND NOT (
          LOWER(TRIM(COALESCE(t.completion_mode, 'single_done'))) = 'all_assignees_done'
          AND ta.done_at IS NOT NULL
        )
        AND (
          (? IS NOT NULL AND ta.student_id = ?)
          OR (ta.student_first_name = ? AND ta.student_last_name = ?)
        )`,
    [sid, sid, fn, ln]
  );
  return Math.max(0, parseInt(row?.c, 10) || 0);
}

module.exports = { countStudentActiveTaskAssignments, getEffectiveMaxActiveTaskAssignments };
