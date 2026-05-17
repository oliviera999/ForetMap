'use strict';

const { withTransaction, queryAll } = require('../database');
const { deleteFile } = require('./uploads');
const { syncTaskProjectCompletionForProjects } = require('./syncTaskProjectCompletion');
const { recalculateTaskStatusWithConn } = require('./taskStatusRecalc');

/**
 * Supprime le contenu forum / commentaires contextuels lié à un n3beur (pas de FK vers users).
 */
async function purgeStudentForumAndComments(tx, studentId) {
  await tx.execute(
    `DELETE FROM forum_post_reactions WHERE reactor_user_type = 'student' AND reactor_user_id = ?`,
    [studentId]
  );
  await tx.execute(
    `DELETE FROM forum_reports WHERE reporter_user_type = 'student' AND reporter_user_id = ?`,
    [studentId]
  );
  await tx.execute(
    `DELETE FROM forum_posts WHERE author_user_type = 'student' AND author_user_id = ?`,
    [studentId]
  );
  await tx.execute(
    `DELETE FROM forum_threads WHERE author_user_type = 'student' AND author_user_id = ?`,
    [studentId]
  );
  await tx.execute(
    `DELETE FROM context_comment_reactions WHERE reactor_user_type = 'student' AND reactor_user_id = ?`,
    [studentId]
  );
  await tx.execute(
    `DELETE FROM context_comment_reports WHERE reporter_user_type = 'student' AND reporter_user_id = ?`,
    [studentId]
  );
  await tx.execute(
    `DELETE FROM context_comments WHERE author_user_type = 'student' AND author_user_id = ?`,
    [studentId]
  );
}

async function purgeStudentRbacAndTokens(tx, studentId) {
  await tx.execute(`DELETE FROM user_roles WHERE user_type = 'student' AND user_id = ?`, [studentId]);
  await tx.execute(`DELETE FROM password_reset_tokens WHERE user_type = 'student' AND user_id = ?`, [studentId]);
  await tx.execute(`DELETE FROM elevation_audit WHERE user_type = 'student' AND user_id = ?`, [studentId]);
}

async function deleteTaskAssignmentsAndRecalcStatuses(tx, s) {
  const { id, first_name, last_name } = s;
  const affectedRows = await tx.queryAll(
    'SELECT DISTINCT task_id FROM task_assignments WHERE student_id = ? OR (student_first_name = ? AND student_last_name = ?)',
    [id, first_name, last_name]
  );
  const affectedTaskIds = affectedRows.map((r) => r.task_id);
  const affectedMapIds = new Set();

  await tx.execute(
    'DELETE FROM task_assignments WHERE student_id = ? OR (student_first_name = ? AND student_last_name = ?)',
    [id, first_name, last_name]
  );
  await tx.execute(
    'DELETE FROM task_logs WHERE student_id = ? OR (student_first_name = ? AND student_last_name = ?)',
    [id, first_name, last_name]
  );

  for (const taskId of affectedTaskIds) {
    const task = await tx.queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) continue;
    if (task.map_id != null && String(task.map_id).trim()) {
      affectedMapIds.add(String(task.map_id).trim());
    }
    await recalculateTaskStatusWithConn(tx, task);
  }

  return { affectedTaskIds, affectedMapIds: [...affectedMapIds] };
}

/**
 * Suppression complète d’un compte élève (même logique métier que DELETE /api/students/:id),
 * plus nettoyage forum, commentaires contextuels, RBAC, tokens reset, élévation, avatar disque.
 * @param {string} studentId
 * @returns {Promise<{ ok: true, studentId: string, displayName: string, affectedTaskIds: string[], affectedMapIds: string[] } | { ok: false, reason: string }>}
 */
async function deleteStudentById(studentId) {
  const id = String(studentId || '').trim();
  if (!id) return { ok: false, reason: 'missing_id' };

  let avatarPath = null;
  const summary = await withTransaction(async (tx) => {
    const s = await tx.queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [id]);
    if (!s) return { ok: false, reason: 'not_found' };
    avatarPath = s.avatar_path || null;

    await purgeStudentForumAndComments(tx, id);
    await purgeStudentRbacAndTokens(tx, id);
    const { affectedTaskIds, affectedMapIds } = await deleteTaskAssignmentsAndRecalcStatuses(tx, s);

    await tx.execute("DELETE FROM users WHERE id = ? AND user_type = 'student'", [id]);

    const displayName = `${s.first_name || ''} ${s.last_name || ''}`.trim() || id;
    return {
      ok: true,
      studentId: id,
      displayName,
      affectedTaskIds,
      affectedMapIds,
    };
  });

  if (summary.ok && avatarPath) deleteFile(avatarPath);

  if (summary.ok && Array.isArray(summary.affectedTaskIds) && summary.affectedTaskIds.length > 0) {
    const ph = summary.affectedTaskIds.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT DISTINCT project_id FROM tasks WHERE id IN (${ph}) AND project_id IS NOT NULL`,
      summary.affectedTaskIds
    );
    const projectIds = rows.map((r) => r.project_id).filter(Boolean);
    await syncTaskProjectCompletionForProjects(projectIds);
  }

  return summary;
}

module.exports = {
  deleteStudentById,
  purgeStudentForumAndComments,
  purgeStudentRbacAndTokens,
  deleteTaskAssignmentsAndRecalcStatuses,
};
