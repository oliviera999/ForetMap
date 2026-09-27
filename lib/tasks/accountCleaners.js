'use strict';

/**
 * Tâches — ce que le domaine des tâches fait de ses lignes quand un compte ou un groupe
 * disparaît, ou qu'un élève est renommé (registre `lib/accounts/cleanerRegistry.js`).
 *
 * `task_assignments` et `task_logs` portent le nom de l'élève en clair (lignes héritées sans
 * identifiant, affichage) : la suppression apparie par identité (`assignmentIdentityMatch`),
 * le renommage recopie le nouveau nom. À la fusion, `student_id` suit les clés étrangères
 * découvertes en base : rien à déclarer ici.
 */

const { queryAll } = require('../../database');
const { syncTaskProjectCompletionForProjects } = require('../syncTaskProjectCompletion');
const { recalculateTaskStatusWithConn } = require('../taskStatusRecalc');
const { assignmentIdentityMatch } = require('./assignmentIdentityMatch');

/**
 * Suppression d'un élève : ses inscriptions et journaux de tâches, puis le statut des tâches
 * touchées recalculé dans la transaction.
 * @returns {Promise<{ affectedTaskIds: string[], affectedMapIds: string[] }>}
 */
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

/** Après validation : complétion des projets des tâches touchées. */
async function syncProjectsOfAffectedTasks(summary) {
  if (!(summary.ok && Array.isArray(summary.affectedTaskIds) && summary.affectedTaskIds.length > 0))
    return;
  const ph = summary.affectedTaskIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT DISTINCT project_id FROM tasks WHERE id IN (${ph}) AND project_id IS NOT NULL`,
    summary.affectedTaskIds,
  );
  const projectIds = rows.map((r) => r.project_id).filter(Boolean);
  await syncTaskProjectCompletionForProjects(projectIds);
}

module.exports = {
  domain: 'Tâches',
  product: 'foret',
  studentDelete: {
    order: 40,
    run: deleteTaskAssignmentsAndRecalcStatuses,
  },
  afterStudentDelete: {
    order: 40,
    run: syncProjectsOfAffectedTasks,
  },
  // `tasks.group_id` ne porte aucune contrainte vers `groups` : sans ce détachement, la tâche
  // restait rattachée à un groupe fantôme (filtrage, visibilité).
  groupDetach: {
    order: 10,
    async run(tx, groupId) {
      await tx.execute('UPDATE tasks SET group_id = NULL WHERE group_id = ?', [groupId]);
    },
  },
  studentRename: {
    order: 10,
    async run(db, { studentId, firstName, lastName }) {
      await db.execute(
        'UPDATE task_assignments SET student_first_name = ?, student_last_name = ? WHERE student_id = ?',
        [firstName, lastName, studentId],
      );
      await db.execute(
        'UPDATE task_logs SET student_first_name = ?, student_last_name = ? WHERE student_id = ?',
        [firstName, lastName, studentId],
      );
    },
  },
  deleteTaskAssignmentsAndRecalcStatuses,
};
