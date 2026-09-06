'use strict';

const { withTransaction, queryAll } = require('../database');
const { deleteFile } = require('./uploads');
const logger = require('./logger');
const { syncTaskProjectCompletionForProjects } = require('./syncTaskProjectCompletion');
const { recalculateTaskStatusWithConn } = require('./taskStatusRecalc');
const { assignmentIdentityMatch } = require('./tasks/assignmentIdentityMatch');

/**
 * Supprime le contenu forum / commentaires contextuels lié à un n3beur (pas de FK vers users).
 */
async function purgeStudentForumAndComments(tx, studentId) {
  await tx.execute(
    `DELETE FROM forum_post_reactions WHERE reactor_user_type = 'student' AND reactor_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM forum_reports WHERE reporter_user_type = 'student' AND reporter_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM forum_posts WHERE author_user_type = 'student' AND author_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM forum_threads WHERE author_user_type = 'student' AND author_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM context_comment_reactions WHERE reactor_user_type = 'student' AND reactor_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM context_comment_reports WHERE reporter_user_type = 'student' AND reporter_user_id = ?`,
    [studentId],
  );
  await tx.execute(
    `DELETE FROM context_comments WHERE author_user_type = 'student' AND author_user_id = ?`,
    [studentId],
  );
}

/**
 * Profil de jeu Gnomes & Licornes lié au compte (unification des identités, migration 211) :
 * supprimer l'élève supprime aussi son joueur — mêmes règles que `DELETE /api/gl/admin/players/:id`.
 * La FK `fk_gl_players_user` (ON DELETE CASCADE) est un filet ; le chemin applicatif est
 * préféré pour purger proprement et pour répondre 409 quand une partie retient le joueur
 * (`fk_gl_spell_cast_contrib_player` RESTRICT).
 * @returns {Promise<{ ok: true, playerId: number|null } | { ok: false, reason: string }>}
 */
async function purgeLinkedGlPlayer(tx, studentId) {
  const player = await tx.queryOne(
    'SELECT id FROM gl_players WHERE linked_foretmap_user_id = ? LIMIT 1',
    [studentId],
  );
  if (!player) return { ok: true, playerId: null };
  const activeGames = await tx.queryOne(
    `SELECT COUNT(*) AS c
       FROM gl_team_members tm
 INNER JOIN gl_games g ON g.id = tm.game_id
      WHERE tm.player_id = ? AND g.status IN ('draft', 'live', 'paused')`,
    [player.id],
  );
  if (Number(activeGames?.c || 0) > 0) {
    return { ok: false, reason: 'gl_player_in_active_game', playerId: Number(player.id) };
  }
  await tx.execute('DELETE FROM gl_team_members WHERE player_id = ?', [player.id]);
  await tx.execute(
    `DELETE FROM password_reset_tokens WHERE user_type = 'gl_player' AND user_id = ?`,
    [String(player.id)],
  );
  await tx.execute('DELETE FROM gl_players WHERE id = ?', [player.id]);
  return { ok: true, playerId: Number(player.id) };
}

async function purgeStudentRbacAndTokens(tx, studentId) {
  await tx.execute(`DELETE FROM user_roles WHERE user_type = 'student' AND user_id = ?`, [
    studentId,
  ]);
  await tx.execute(
    `DELETE FROM password_reset_tokens WHERE user_type = 'student' AND user_id = ?`,
    [studentId],
  );
}

async function deleteTaskAssignmentsAndRecalcStatuses(tx, s) {
  const { id, first_name, last_name } = s;
  // Supprimer un compte ne doit emporter QUE ses lignes : l'appariement par nom seul
  // effaçait aussi les inscriptions et journaux d'un homonyme (cf. assignmentIdentityMatch).
  const match = assignmentIdentityMatch('');
  const params = match.params(id, first_name, last_name);
  const affectedRows = await tx.queryAll(
    `SELECT DISTINCT task_id FROM task_assignments WHERE ${match.clause}`,
    params,
  );
  const affectedTaskIds = affectedRows.map((r) => r.task_id);
  const affectedMapIds = new Set();

  await tx.execute(`DELETE FROM task_assignments WHERE ${match.clause}`, params);
  await tx.execute(`DELETE FROM task_logs WHERE ${match.clause}`, params);

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
async function deleteStudentById(studentId, options = {}) {
  const id = String(studentId || '').trim();
  if (!id) return { ok: false, reason: 'missing_id' };
  const { skipLinkedGlPlayer = false } = options;

  let avatarPath = null;
  let summary;
  try {
    summary = await withTransaction(async (tx) => {
      const s = await tx.queryOne("SELECT * FROM users WHERE id = ? AND user_type = 'student'", [
        id,
      ]);
      if (!s) return { ok: false, reason: 'not_found' };
      avatarPath = s.avatar_path || null;

      let glPlayerId = null;
      if (!skipLinkedGlPlayer) {
        const gl = await purgeLinkedGlPlayer(tx, id);
        if (!gl.ok) return { ok: false, reason: gl.reason, glPlayerId: gl.playerId };
        glPlayerId = gl.playerId;
      }

      await purgeStudentForumAndComments(tx, id);
      await purgeStudentRbacAndTokens(tx, id);
      const { affectedTaskIds, affectedMapIds } = await deleteTaskAssignmentsAndRecalcStatuses(
        tx,
        s,
      );

      await tx.execute("DELETE FROM users WHERE id = ? AND user_type = 'student'", [id]);

      const displayName = `${s.first_name || ''} ${s.last_name || ''}`.trim() || id;
      return {
        ok: true,
        studentId: id,
        displayName,
        affectedTaskIds,
        affectedMapIds,
        glPlayerId,
      };
    });
  } catch (err) {
    // Une contribution à un sortilège dans une partie TERMINÉE référence encore le joueur
    // (`fk_gl_spell_cast_contrib_player` ON DELETE RESTRICT) : refus explicite plutôt qu'un 500.
    if (err && (err.errno === 1451 || err.code === 'ER_ROW_IS_REFERENCED_2')) {
      logger.warn({ studentId: id, err }, 'Suppression élève refusée : joueur GL référencé');
      return { ok: false, reason: 'gl_player_referenced' };
    }
    throw err;
  }

  if (summary.ok && avatarPath) deleteFile(avatarPath);

  if (summary.ok && Array.isArray(summary.affectedTaskIds) && summary.affectedTaskIds.length > 0) {
    const ph = summary.affectedTaskIds.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT DISTINCT project_id FROM tasks WHERE id IN (${ph}) AND project_id IS NOT NULL`,
      summary.affectedTaskIds,
    );
    const projectIds = rows.map((r) => r.project_id).filter(Boolean);
    await syncTaskProjectCompletionForProjects(projectIds);
  }

  return summary;
}

module.exports = {
  deleteStudentById,
  purgeLinkedGlPlayer,
  purgeStudentForumAndComments,
  purgeStudentRbacAndTokens,
  deleteTaskAssignmentsAndRecalcStatuses,
};
