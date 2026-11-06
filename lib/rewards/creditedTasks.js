'use strict';

/**
 * Règle de crédit d'une tâche — **seule source** de tous les badges de tâches.
 *
 * Une tâche crédite un élève quand :
 *  - `status = 'validated'` et `validated_at` non nul ;
 *  - l'élève y est inscrit (`task_assignments.student_id`, identifiant de compte) ;
 *  - en validation collective (`completion_mode = 'all_assignees_done'`), il a marqué sa part
 *    (`done_at` non nul) ;
 *  - ce n'est pas une tâche de test (titre exactement « test », casse et espaces ignorés :
 *    aucun autre critère n'existe en base au 06/11/2026, une seule tâche concernée).
 * Une tâche archivée après validation **compte** : c'est du travail réel.
 *
 * Écart signalé (non corrigé) avec la progression n3beur (`countValidatedAssignmentsForStudent`,
 * `lib/rbac.js`) : celle-ci compte `status = 'validated'` sans exiger `validated_at` ni la part
 * faite en mode collectif, retrouve aussi les inscriptions anciennes par prénom et nom, et
 * n'exclut pas la tâche « test ». En production (06/11/2026) : 3 inscriptions anciennes sans
 * identifiant de compte et 1 tâche « test » — les badges ne les comptent pas.
 */

/** Titre exact (normalisé) d'une tâche de test, jamais créditée. */
const TEST_TASK_TITLE = 'test';

/**
 * Sous-requête des couples (élève, tâche) crédités, une ligne par couple, à utiliser en
 * table dérivée : `FROM (${creditedTasksQuery().sql}) c`. Filtrée sur un élève quand
 * `userId` est donné (paramètre lié).
 *
 * Colonnes : user_id, task_id, title, category, format, project_id, project_phase,
 * recurrence_series_id, due_date, recurrence_anchor_date, created_at, validated_at,
 * assigned_at.
 *
 * @param {{ userId?: string }} [options]
 * @returns {{ sql: string, params: unknown[] }}
 */
function creditedTasksQuery({ userId } = {}) {
  const params = [];
  let userFilter = '';
  if (userId) {
    userFilter = 'AND student_id = ?';
    params.push(String(userId));
  }
  params.push(TEST_TASK_TITLE);
  // Inscriptions regroupées par (tâche, élève) d'abord : une ligne par couple, sans
  // dépendre du mode ONLY_FULL_GROUP_BY du serveur.
  const sql = `
    SELECT ta.student_id AS user_id, t.id AS task_id, t.title, t.category, t.format,
           t.project_id, t.project_phase, t.recurrence_series_id, t.due_date,
           t.recurrence_anchor_date, t.created_at, t.validated_at, ta.assigned_at
      FROM (
        SELECT task_id, student_id, MIN(assigned_at) AS assigned_at, MAX(done_at) AS done_at
          FROM task_assignments
         WHERE student_id IS NOT NULL ${userFilter}
         GROUP BY task_id, student_id
      ) ta
      JOIN tasks t ON t.id = ta.task_id
     WHERE t.status = 'validated'
       AND t.validated_at IS NOT NULL
       AND (t.completion_mode IS NULL OR t.completion_mode <> 'all_assignees_done'
            OR ta.done_at IS NOT NULL)
       AND LOWER(TRIM(t.title)) <> ?`;
  return { sql, params };
}

module.exports = { TEST_TASK_TITLE, creditedTasksQuery };
