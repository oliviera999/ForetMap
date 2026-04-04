'use strict';

const { withTransaction } = require('../database');
const { deleteFile } = require('./uploads');

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
    if (task.status === 'validated') continue;

    const remainingRow = await tx.queryOne('SELECT COUNT(*) AS c FROM task_assignments WHERE task_id = ?', [taskId]);
    const remaining = remainingRow ? Number(remainingRow.c) : 0;

    let newStatus;
    if (remaining === 0) {
      newStatus = 'available';
    } else if (remaining >= task.required_students) {
      newStatus = task.status === 'done' ? 'done' : 'in_progress';
    } else {
      newStatus = 'available';
    }
    await tx.execute('UPDATE tasks SET status = ? WHERE id = ?', [newStatus, taskId]);
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

  return summary;
}

module.exports = {
  deleteStudentById,
  purgeStudentForumAndComments,
  purgeStudentRbacAndTokens,
  deleteTaskAssignmentsAndRecalcStatuses,
};
