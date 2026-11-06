'use strict';

/**
 * Points d'appel de l'évaluateur, après l'action et **hors transaction** de la route :
 * l'évaluation est lancée sans attendre (`scheduleRewardsEvaluation`) et ne fait jamais
 * échouer l'action. Une panne est journalisée ; la passe de nuit (`rewards_evaluate`) rattrape.
 *
 *  - validation d'une tâche, passage hors de « proposée » : élèves inscrits, référents
 *    (badge « Tuteur ») et auteur de la proposition (« Semeur d'idées ») ;
 *  - validation d'un projet : élèves crédités dans ses tâches (« Cycle complet ») ;
 *  - décision sur une observation, réponse de quiz, lecture d'un tutoriel : savoirs
 *    naturalistes de l'élève concerné.
 */

const database = require('../../database');
const logger = require('../logger');
const { scheduleRewardsEvaluation } = require('./evaluator');

function safely(work, context) {
  return Promise.resolve()
    .then(work)
    .catch((err) => {
      logger.error({ err, ...context }, 'rewards_hook_failed');
    });
}

/** Comptes concernés par une tâche : inscrits, référents, auteur de la proposition. */
async function taskRewardRecipients(taskId, db = database) {
  const rows = await db.queryAll(
    `SELECT student_id AS id FROM task_assignments WHERE task_id = ? AND student_id IS NOT NULL
     UNION SELECT user_id AS id FROM task_referents WHERE task_id = ?
     UNION SELECT proposed_by_user_id AS id FROM tasks WHERE id = ? AND proposed_by_user_id IS NOT NULL`,
    [taskId, taskId, taskId],
  );
  return rows.map((r) => r.id);
}

/** Après la validation (ou l'acceptation) d'une tâche. */
function queueRewardsForTask(taskId, reason = 'task') {
  if (!taskId) return Promise.resolve();
  return safely(
    async () =>
      scheduleRewardsEvaluation(await taskRewardRecipients(taskId), {
        source: { type: 'task', ref: String(taskId) },
        reason,
      }),
    { taskId, reason },
  );
}

/** Après la validation d'un projet. */
function queueRewardsForProject(projectId) {
  if (!projectId) return Promise.resolve();
  return safely(
    async () => {
      const rows = await database.queryAll(
        `SELECT DISTINCT ta.student_id AS id FROM task_assignments ta
           JOIN tasks t ON t.id = ta.task_id
          WHERE t.project_id = ? AND ta.student_id IS NOT NULL`,
        [projectId],
      );
      return scheduleRewardsEvaluation(
        rows.map((r) => r.id),
        { source: { type: 'task_project', ref: String(projectId) }, reason: 'project_validate' },
      );
    },
    { projectId },
  );
}

/** Après une action de savoir (observation validée, quiz, tutoriel) d'un élève. */
function queueNatureRewards(userId, source = {}) {
  if (!userId) return Promise.resolve();
  return safely(
    () =>
      scheduleRewardsEvaluation([userId], {
        families: ['nature'],
        source,
        reason: source.type || 'nature',
      }),
    { userId, source: source.type || null },
  );
}

module.exports = {
  taskRewardRecipients,
  queueRewardsForTask,
  queueRewardsForProject,
  queueNatureRewards,
};
