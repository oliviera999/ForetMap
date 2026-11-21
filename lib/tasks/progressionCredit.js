'use strict';

/**
 * Règle de crédit de la **progression n3beur** — source unique.
 *
 * Une inscription crédite un élève quand la tâche est `status = 'validated'` et que la ligne
 * `task_assignments` lui est rattachée par `assignmentIdentityJoin` (identifiant de compte ; et,
 * pour les inscriptions anciennes sans identifiant, prénom et nom). Rien d'autre : ni
 * `validated_at`, ni la part faite en mode collectif, ni exclusion de la tâche « test ».
 *
 * Consommateurs :
 *  - `countValidatedAssignmentsForStudent` (`lib/rbac.js`) : paliers de progression ;
 *  - le moteur des élèves référents (`lib/tasks/studentReferents.js`) : comptage par série.
 *
 * Elle diffère volontairement de la règle des badges (`creditedTasksQuery`,
 * `lib/rewards/creditedTasks.js`) ; l'écart est décrit dans ce fichier-là.
 *
 * Granularité : **une ligne par inscription créditée** (et non par couple élève-tâche), pour
 * que `COUNT(*)` rende exactement l'ancien compteur de progression. Un consommateur qui veut
 * des tâches distinctes compte `DISTINCT task_id`.
 */

const { assignmentIdentityJoin } = require('./assignmentIdentityMatch');

/**
 * Sous-requête à utiliser en table dérivée : `FROM (${q.sql}) pc`.
 *
 * Colonnes : user_id, task_id, series_id (`COALESCE(recurrence_series_id, id)`), recurrence,
 * validated_at, assigned_at.
 *
 * @param {{ userId?: string, recurringOnly?: boolean, seriesId?: string }} [options]
 *   `userId` : un seul élève (paramètre lié) ; `recurringOnly` : tâches récurrentes seulement ;
 *   `seriesId` : une seule série (paramètre lié).
 * @returns {{ sql: string, params: unknown[] }}
 */
function progressionCreditedAssignmentsQuery({ userId, recurringOnly = false, seriesId } = {}) {
  const params = [];
  let userFilter = '';
  if (userId != null && String(userId).trim() !== '') {
    userFilter = 'AND u.id = ?';
    params.push(String(userId));
  }
  const filters = [];
  if (recurringOnly) filters.push("AND t.recurrence IN ('weekly','biweekly','monthly')");
  if (seriesId != null && String(seriesId).trim() !== '') {
    filters.push('AND COALESCE(t.recurrence_series_id, t.id) = ?');
    params.push(String(seriesId));
  }
  const sql = `
    SELECT u.id AS user_id, t.id AS task_id,
           COALESCE(t.recurrence_series_id, t.id) AS series_id,
           t.recurrence, t.validated_at, ta.assigned_at
      FROM task_assignments ta
      INNER JOIN tasks t ON t.id = ta.task_id
      INNER JOIN users u ON u.user_type = 'student' ${userFilter}
     WHERE t.status = 'validated'
       AND ${assignmentIdentityJoin('ta', 'u')}
       ${filters.join('\n       ')}`;
  return { sql, params };
}

module.exports = { progressionCreditedAssignmentsQuery };
