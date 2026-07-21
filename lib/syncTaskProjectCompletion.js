'use strict';

const { queryOne, execute } = require('../database');
const { emitTasksChanged } = require('./realtime');

/**
 * Met à jour le statut d’un projet selon l’état de ses tâches :
 * - `completed` dès qu’il existe au moins une tâche liée et que toutes sont `done` ou `validated` ;
 * - repasse à `active` si le projet était `completed` mais qu’il n’y a plus aucune tâche ou qu’au moins une tâche n’est pas terminée.
 * Les projets `on_hold` et `validated` restent inchangés : décisions manuelles du professeur.
 *
 * @param {string|null|undefined} projectId
 * @returns {Promise<boolean>} true si une ligne BDD a été modifiée
 */
async function syncTaskProjectCompletionForProject(projectId) {
  const pid = projectId != null ? String(projectId).trim() : '';
  if (!pid) return false;

  const project = await queryOne('SELECT id, status, map_id FROM task_projects WHERE id = ?', [
    pid,
  ]);
  if (!project) return false;

  const row = await queryOne(
    `SELECT COUNT(*) AS n,
            SUM(CASE WHEN LOWER(TRIM(IFNULL(status, ''))) IN ('done', 'validated') THEN 1 ELSE 0 END) AS done_n
       FROM tasks WHERE project_id = ? AND archived_at IS NULL`,
    [pid],
  );
  const total = Number(row?.n) || 0;
  const doneCount = Number(row?.done_n) || 0;
  const allDone = total > 0 && doneCount === total;

  const cur = String(project.status || 'active')
    .trim()
    .toLowerCase();
  if (cur === 'on_hold' || cur === 'validated') return false;

  let next;
  if (allDone) {
    next = 'completed';
  } else if (cur === 'completed') {
    next = 'active';
  } else {
    return false;
  }

  if (next === cur) return false;

  await execute('UPDATE task_projects SET status = ? WHERE id = ?', [next, pid]);
  emitTasksChanged({
    reason: 'project_completion_sync',
    projectId: pid,
    mapId: project.map_id != null ? String(project.map_id).trim() || null : null,
  });
  return true;
}

/**
 * @param {Array<string|null|undefined>} projectIds
 */
async function syncTaskProjectCompletionForProjects(projectIds) {
  const seen = new Set();
  for (const raw of projectIds || []) {
    const id = raw != null ? String(raw).trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    await syncTaskProjectCompletionForProject(id);
  }
}

module.exports = {
  syncTaskProjectCompletionForProject,
  syncTaskProjectCompletionForProjects,
};
