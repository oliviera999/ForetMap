'use strict';

/**
 * Points d'appel du moteur des élèves référents (`lib/tasks/studentReferents.js`), sur le modèle
 * des crochets de badges (`lib/rewards/hooks.js`) : lancés **sans attendre**, hors transaction,
 * jamais bloquants. Le moteur est chargé à la demande (aucune dépendance circulaire avec les
 * services de tâches ou le clonage) et ne fait rien tant que `tasks.student_referent_enabled`
 * est faux. Une panne est journalisée ; le job quotidien `student_referents_sync` rattrape.
 */

const logger = require('../logger');

function engine() {
  return require('./studentReferents');
}

function safely(work, context) {
  return Promise.resolve()
    .then(work)
    .catch((err) => {
      logger.warn({ err, ...context }, 'student_referents_hook_failed');
      return null;
    });
}

/** Après la validation d'une occurrence, ou après un clonage récurrent : sa série seulement. */
function queueStudentReferentSyncForTask(taskId, reason = 'task') {
  if (!taskId) return Promise.resolve(null);
  return safely(() => engine().queueStudentReferentSyncForTask(taskId, reason), {
    taskId,
    reason,
  });
}

/** Après la modification d'un réglage `tasks.student_referent_*`. */
function queueStudentReferentSyncForSetting(key) {
  if (!String(key || '').startsWith('tasks.student_referent_')) return Promise.resolve(null);
  return safely(() => engine().queueStudentReferentSync({ reason: `setting:${key}` }), { key });
}

/** Après un ajout ou un retrait de membre : seulement si c'est le groupe de l'année. */
function queueStudentReferentSyncForGroup(groupId) {
  if (!groupId) return Promise.resolve(null);
  return safely(() => engine().queueStudentReferentSyncForGroup(groupId), { groupId });
}

module.exports = {
  queueStudentReferentSyncForTask,
  queueStudentReferentSyncForSetting,
  queueStudentReferentSyncForGroup,
};
