'use strict';

/**
 * Actions de cycle de vie d'une tâche — validation, archivage, désarchivage, suppression —
 * extraites **à l'identique** des gestionnaires de `routes/tasks.js` (lot D du connecteur
 * Claude, 05/11/2026) pour être testables et réutilisables sans HTTP. Les routes les appellent
 * et traduisent le résultat ; aucun changement de comportement : mêmes écritures, mêmes
 * transactions, même journal d'audit, mêmes événements temps réel, mêmes notifications, même
 * recalcul de la progression et de l'avancement du projet.
 *
 * Signature commune : `(taskId, { req }) → résultat`. `req` porte l'acteur (`req.auth`) et sert
 * au journal d'audit. Une règle métier non satisfaite lève `TaskActionError` (statut HTTP +
 * message, repris tels quels par la route).
 */

const { queryOne, execute, withTransaction } = require('../../database');
const { deleteFile } = require('../uploads');
const { deletePublicUploadThumb } = require('../imageThumb');
const { logAudit } = require('../auditLog');
const { emitTasksChanged } = require('../realtime');
const { getActor } = require('../shared/participationGuards');
const { listTaskAssigneeIds } = require('../notifications');
const {
  fireAndForget,
  notifyTaskStatusChange,
  notifyTaskDeleted,
} = require('../notificationEvents');
const { syncTaskProjectCompletionForProjects } = require('../syncTaskProjectCompletion');
const { syncProgressionForValidatedTask } = require('../rbac');
const { normalizeTaskStatusForRead } = require('../taskStatusRecalc');
const {
  setTaskZones,
  setTaskMarkers,
  syncLegacyLocationColumns,
  getTaskProposerStudentId,
  getTaskWithAssignments,
  getTaskZoneIds,
  getTaskMarkerIds,
  persistDetachedLocationsSnapshot,
} = require('./taskQueries');
const { resolveTaskMapId } = require('../taskRouteHelpers');
const { spawnRecurringTaskOnValidation } = require('../recurringTasks');

class TaskActionError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'TaskActionError';
    this.status = status;
  }
}

/**
 * Supprime une tâche, ses comptes rendus et ses inscriptions (transaction), puis ses fichiers.
 * @returns {Promise<{ success: true }>}
 */
async function deleteTaskAction(taskId, { req } = {}) {
  const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) throw new TaskActionError(404, 'Tâche introuvable');
  // Lus avant la transaction : la suppression efface les inscriptions.
  const deletedAssigneeIds = await listTaskAssigneeIds(task.id);
  const deletedProposerId =
    normalizeTaskStatusForRead(task.status) === 'proposed'
      ? await getTaskProposerStudentId(task.id)
      : null;
  // Suppression atomique : sans transaction, un échec entre deux DELETE laissait une tâche
  // amputée de ses logs/assignations (les écritures composées de ce fichier — POST/PUT/validate —
  // sont déjà transactionnelles).
  const logImagePaths = await withTransaction(async (tx) => {
    const rows = await tx.queryAll(
      "SELECT image_path FROM task_logs WHERE task_id = ? AND image_path IS NOT NULL AND image_path <> ''",
      [taskId],
    );
    await tx.execute('DELETE FROM task_logs WHERE task_id = ?', [taskId]);
    await tx.execute('DELETE FROM task_assignments WHERE task_id = ?', [taskId]);
    await tx.execute('DELETE FROM tasks WHERE id = ?', [taskId]);
    return rows.map((r) => r.image_path);
  });
  // Fichiers supprimés après validation seulement : un retour arrière garderait sinon une
  // tâche sans sa couverture ni les photos de ses rapports.
  if (task.image_path) {
    deleteFile(task.image_path);
    deletePublicUploadThumb(task.image_path);
  }
  for (const relativePath of logImagePaths) deleteFile(relativePath);
  logAudit('delete_task', 'task', taskId, task.title, { req });
  emitTasksChanged({
    reason: 'delete_task',
    taskId,
    mapId: resolveTaskMapId(task),
  });
  fireAndForget(
    () =>
      notifyTaskDeleted({
        task: { ...task, status: normalizeTaskStatusForRead(task.status) },
        assigneeIds: deletedAssigneeIds,
        proposerId: deletedProposerId,
        actorUserId: getActor(req?.auth)?.userId || null,
      }),
    { taskId: task.id },
  );
  const delProjectId =
    task.project_id != null && String(task.project_id).trim()
      ? String(task.project_id).trim()
      : null;
  await syncTaskProjectCompletionForProjects([delProjectId]);
  return { success: true };
}

/**
 * Archivage (soft-delete) : masque la tâche des listes actives sans la supprimer.
 * L'archivage est réversible et n'altère ni le statut ni les données liées (assignations, logs,
 * zones). Idempotent : sans changement d'état, renvoie la tâche sans réécrire ni ré-émettre.
 * @returns {Promise<object>} tâche avec ses inscriptions
 */
async function setTaskArchivedAction(taskId, { archive, req } = {}) {
  const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) throw new TaskActionError(404, 'Tâche introuvable');
  const alreadyArchived = task.archived_at != null;
  if (archive === alreadyArchived) {
    // Idempotent : renvoyer l'état courant sans réécrire ni ré-émettre.
    return getTaskWithAssignments(task.id);
  }
  if (archive) {
    // Archivage manuel : marqueur cascade à 0 (ne sera pas restauré par le désarchivage
    // d'un projet — seul un désarchivage individuel le rétablit).
    await execute('UPDATE tasks SET archived_at = NOW(), archived_via_project = 0 WHERE id = ?', [
      taskId,
    ]);
  } else {
    await execute('UPDATE tasks SET archived_at = NULL, archived_via_project = 0 WHERE id = ?', [
      taskId,
    ]);
  }
  const projectId =
    task.project_id != null && String(task.project_id).trim()
      ? String(task.project_id).trim()
      : null;
  logAudit(archive ? 'archive_task' : 'unarchive_task', 'task', taskId, task.title, { req });
  emitTasksChanged({
    reason: archive ? 'archive_task' : 'unarchive_task',
    taskId,
    projectId,
    mapId: resolveTaskMapId(task),
  });
  // Une tâche archivée ne compte plus dans la complétion du projet (et inversement).
  await syncTaskProjectCompletionForProjects([projectId]);
  return getTaskWithAssignments(task.id);
}

/**
 * Validation d'une tâche : détachement des lieux (instantané conservé pour la restauration),
 * statut `validated`, progression des élèves, notifications, avancement du projet, occurrence
 * récurrente suivante.
 * @returns {Promise<object>} tâche validée avec ses inscriptions
 */
async function validateTaskAction(taskId, { req } = {}) {
  const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) throw new TaskActionError(404, 'Tâche introuvable');
  if (task.archived_at != null) {
    throw new TaskActionError(409, 'Désarchivez la tâche avant de la valider');
  }
  const currentStatus = normalizeTaskStatusForRead(task.status);
  if (currentStatus === 'validated') {
    throw new TaskActionError(400, 'Tâche déjà validée');
  }
  const zonesBeforeValidate = await getTaskZoneIds(task.id);
  const markersBeforeValidate = await getTaskMarkerIds(task.id);
  // Écritures atomiques : snapshot récurrence + détachement zones/repères + statut
  // dans UNE transaction — un échec au milieu ne doit pas laisser une tâche
  // « validée » encore liée, ni détachée sans être validée.
  await withTransaction(async (tx) => {
    await persistDetachedLocationsSnapshot(task.id, zonesBeforeValidate, markersBeforeValidate, tx);
    // Comme PUT avec statut validated : une tâche validée ne reste pas liée à des zones/repères.
    await setTaskZones(task.id, [], tx);
    await setTaskMarkers(task.id, [], tx);
    await syncLegacyLocationColumns(task.id, [], [], tx);
    await tx.execute("UPDATE tasks SET status = 'validated', validated_at = NOW() WHERE id = ?", [
      taskId,
    ]);
  });
  logAudit('validate_task', 'task', taskId, task.title, { req });
  await syncProgressionForValidatedTask(task.id);
  const updated = await getTaskWithAssignments(task.id);
  emitTasksChanged({ reason: 'validate', taskId: task.id, mapId: resolveTaskMapId(updated) });
  fireAndForget(
    () =>
      notifyTaskStatusChange({
        task: updated,
        previousStatus: currentStatus,
        actorUserId: getActor(req?.auth)?.userId || null,
      }),
    { taskId: task.id },
  );
  await syncTaskProjectCompletionForProjects([task.project_id]);
  fireAndForget(() => spawnRecurringTaskOnValidation(task.id), { taskId: task.id });
  return updated;
}

module.exports = {
  TaskActionError,
  deleteTaskAction,
  setTaskArchivedAction,
  validateTaskAction,
};
