const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requirePermission } = require('../../middleware/requireTeacher');
const { saveBase64ToDisk } = require('../../lib/uploads');
const asyncHandler = require('../../lib/asyncHandler');
const { logAudit } = require('../audit');
const { emitTasksChanged } = require('../../lib/realtime');
const { syncTaskProjectCompletionForProjects } = require('../../lib/syncTaskProjectCompletion');
const {
  countStudentActiveTaskAssignments,
  getEffectiveMaxActiveTaskAssignments,
} = require('../../lib/studentTaskEnrollment');
const {
  normalizeTaskStatusForRead,
  normalizeTaskCompletionMode,
} = require('../../lib/taskStatusRecalc');
const { getScopedStudentIds } = require('../../lib/groupScope');
// Helpers du cluster « tasks » mutualisés dans lib/tasks/taskQueries.js (aucun import circulaire).
const { recalculateTaskStatus, getTaskWithAssignments } = require('../../lib/tasks/taskQueries');
const {
  resolveTaskMapId,
  isTaskBeforeStartDate,
  normalizeOptionalId,
} = require('../../lib/taskRouteHelpers');
const { resolveStudentActionContext } = require('../../lib/tasks/studentActionContext');

const router = express.Router();

router.post(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.archived_at)
      return res.status(409).json({ error: 'Tâche archivée : action indisponible' });
    if (task.status === 'validated') return res.status(400).json({ error: 'Tâche déjà validée' });
    if (task.status === 'on_hold')
      return res.status(400).json({ error: 'Tâche en attente : inscription indisponible' });
    if (task.project_status === 'on_hold') {
      return res.status(400).json({ error: 'Projet en attente : inscription indisponible' });
    }
    if (task.project_status === 'completed') {
      return res.status(400).json({ error: 'Projet terminé : inscription indisponible' });
    }
    if (task.project_status === 'validated') {
      return res.status(400).json({ error: 'Projet validé : inscription indisponible' });
    }
    if (isTaskBeforeStartDate(task))
      return res
        .status(400)
        .json({ error: 'Date de départ non atteinte : inscription indisponible' });

    const action = await resolveStudentActionContext(req, req.body || {}, 'tasks.assign_self');
    if (action.error) {
      return res
        .status(action.errorStatus || 400)
        .json({ error: action.error, ...(action.deleted ? { deleted: true } : {}) });
    }

    const already = task.assignments.find(
      (a) =>
        (action.studentId && a.student_id && String(a.student_id) === String(action.studentId)) ||
        (String(a.student_first_name || '').toLowerCase() === action.firstName.toLowerCase() &&
          String(a.student_last_name || '').toLowerCase() === action.lastName.toLowerCase()),
    );
    if (already) return res.status(400).json({ error: 'Déjà assigné à cette tâche' });

    if (action.actorUserType === 'student' && action.studentId) {
      const maxActive = await getEffectiveMaxActiveTaskAssignments(action.studentId);
      if (maxActive > 0) {
        const current = await countStudentActiveTaskAssignments(
          action.studentId,
          action.firstName,
          action.lastName,
        );
        if (current >= maxActive) {
          return res.status(400).json({
            error: `Limite atteinte : tu as déjà ${maxActive} tâche(s) active(s) (non validées par un n3boss). Retire-toi d’une tâche ou attends une validation.`,
            code: 'TASK_ENROLLMENT_LIMIT',
            maxActiveAssignments: maxActive,
            currentActiveAssignments: current,
          });
        }
      }
    }

    if (task.assignments.length >= task.required_students) {
      return res.status(400).json({ error: 'Plus de place disponible sur cette tâche' });
    }

    await execute(
      'INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at) VALUES (?, ?, ?, ?, ?)',
      [
        task.id,
        action.studentId || null,
        action.firstName,
        action.lastName,
        new Date().toISOString(),
      ],
    );

    const recalculated = await recalculateTaskStatus(task);
    const newStatus = recalculated?.status || normalizeTaskStatusForRead(task.status);

    const updated = await getTaskWithAssignments(task.id);
    logAudit('assign_task', 'task', task.id, `${action.firstName} ${action.lastName}`, {
      req,
      actorUserType: action.actorUserType,
      actorUserId: action.actorUserId,
      payload: { student_id: action.studentId || null, status: newStatus },
    });
    emitTasksChanged({ reason: 'assign', taskId: task.id, mapId: resolveTaskMapId(updated) });
    await syncTaskProjectCompletionForProjects([updated.project_id]);
    res.json(updated);
  }),
);

router.post(
  '/:id/assign-group',
  requirePermission('tasks.assign.group'),
  asyncHandler(async (req, res) => {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.archived_at)
      return res.status(409).json({ error: 'Tâche archivée : action indisponible' });
    if (task.status === 'validated') return res.status(400).json({ error: 'Tâche déjà validée' });
    const groupId = normalizeOptionalId(req.body?.group_id);
    if (!groupId) return res.status(400).json({ error: 'group_id requis' });
    const scope = await getScopedStudentIds(req.auth, { groupId });
    if (scope.unauthorizedGroup) return res.status(403).json({ error: 'Groupe hors périmètre' });
    if (!scope.studentIds.length)
      return res.status(400).json({ error: 'Aucun n3beur dans ce groupe' });
    const students = await queryAll(
      `SELECT id, first_name, last_name
       FROM users
      WHERE user_type = 'student'
        AND is_active = 1
        AND id IN (${scope.studentIds.map(() => '?').join(',')})`,
      scope.studentIds,
    );
    const already = new Set((task.assignments || []).map((a) => String(a.student_id || '')));
    const maxSlots = Math.max(
      0,
      Number(task.required_students || 1) - Number(task.assignments?.length || 0),
    );
    // Sélectionne (dans l'ordre) les n3beurs à affecter en préservant la sémantique de la boucle :
    // `skipped` compte les déjà-affectés rencontrés AVANT que les créneaux soient pleins, puis on
    // insère tout en UNE requête multi-valeurs (au lieu d'un INSERT par n3beur).
    const toAssign = [];
    let skipped = 0;
    for (const student of students) {
      if (already.has(String(student.id))) {
        skipped += 1;
        continue;
      }
      if (toAssign.length >= maxSlots) break;
      toAssign.push(student);
    }
    const assigned = toAssign.length;
    if (toAssign.length > 0) {
      const assignedAt = new Date().toISOString();
      const placeholders = toAssign.map(() => '(?, ?, ?, ?, ?)').join(', ');
      const params = [];
      for (const student of toAssign) {
        params.push(
          task.id,
          student.id,
          student.first_name || '',
          student.last_name || '',
          assignedAt,
        );
      }
      await execute(
        `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
       VALUES ${placeholders}`,
        params,
      );
    }
    await recalculateTaskStatus(task);
    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'assign_group', taskId: task.id, mapId: resolveTaskMapId(updated) });
    await syncTaskProjectCompletionForProjects([updated.project_id]);
    return res.json({ task: updated, assigned, skipped, considered: students.length });
  }),
);

router.post(
  '/:id/done',
  asyncHandler(async (req, res) => {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.archived_at)
      return res.status(409).json({ error: 'Tâche archivée : action indisponible' });
    const completionMode = normalizeTaskCompletionMode(task.completion_mode) || 'single_done';

    const { comment, imageData } = req.body || {};
    const action = await resolveStudentActionContext(req, req.body || {}, 'tasks.done_self');
    if (action.error) {
      return res
        .status(action.errorStatus || 400)
        .json({ error: action.error, ...(action.deleted ? { deleted: true } : {}) });
    }

    const assignment = action.studentId
      ? await queryOne(
          `SELECT id, done_at
         FROM task_assignments
        WHERE task_id = ?
          AND (student_id = ? OR (student_first_name = ? AND student_last_name = ?))
        ORDER BY assigned_at DESC
        LIMIT 1`,
          [task.id, action.studentId, action.firstName, action.lastName],
        )
      : await queryOne(
          `SELECT id, done_at
         FROM task_assignments
        WHERE task_id = ?
          AND student_first_name = ?
          AND student_last_name = ?
        ORDER BY assigned_at DESC
        LIMIT 1`,
          [task.id, action.firstName, action.lastName],
        );
    if (!assignment) {
      return res
        .status(400)
        .json({ error: 'Tu dois être inscrit à cette tâche avant de la terminer' });
    }

    if (comment || imageData) {
      const result = await execute(
        'INSERT INTO task_logs (task_id, student_id, student_first_name, student_last_name, comment, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          task.id,
          action.studentId || null,
          action.firstName,
          action.lastName,
          comment || '',
          null,
          new Date().toISOString(),
        ],
      );
      const logId = result.insertId;
      if (imageData) {
        const relativePath = `task-logs/${task.id}_${logId}.jpg`;
        try {
          saveBase64ToDisk(relativePath, imageData);
        } catch (fileErr) {
          await execute('DELETE FROM task_logs WHERE id = ?', [logId]);
          throw fileErr;
        }
        await execute('UPDATE task_logs SET image_path = ? WHERE id = ?', [relativePath, logId]);
      }
    }

    if (completionMode === 'all_assignees_done') {
      if (!assignment.done_at) {
        await execute('UPDATE task_assignments SET done_at = ? WHERE id = ?', [
          new Date().toISOString(),
          assignment.id,
        ]);
      }
      await recalculateTaskStatus({
        id: task.id,
        status: task.status,
        completion_mode: completionMode,
      });
    } else if (task.status !== 'validated' && task.status !== 'on_hold') {
      // Ne pas faire régresser une tâche validée ou en pause vers « done » (dévalidation).
      await execute("UPDATE tasks SET status = 'done' WHERE id = ?", [task.id]);
    }
    const updated = await getTaskWithAssignments(task.id);
    logAudit('done_task', 'task', task.id, `${action.firstName} ${action.lastName}`.trim(), {
      req,
      actorUserType: action.actorUserType,
      actorUserId: action.actorUserId,
      payload: {
        student_id: action.studentId || null,
        with_comment: !!comment,
        with_image: !!imageData,
        completion_mode: completionMode,
      },
    });
    emitTasksChanged({ reason: 'done', taskId: task.id, mapId: resolveTaskMapId(updated) });
    await syncTaskProjectCompletionForProjects([updated.project_id]);
    res.json(updated);
  }),
);

/** Même modèle que POST assign, avec identité n3beur vérifiée (session ou permission n3boss). */
router.post(
  '/:id/unassign',
  asyncHandler(async (req, res) => {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.archived_at)
      return res.status(409).json({ error: 'Tâche archivée : action indisponible' });
    if (task.status === 'done' || task.status === 'validated') {
      return res.status(400).json({ error: 'Impossible de quitter une tâche déjà terminée' });
    }

    const action = await resolveStudentActionContext(req, req.body || {}, 'tasks.unassign_self');
    if (action.error) {
      return res
        .status(action.errorStatus || 400)
        .json({ error: action.error, ...(action.deleted ? { deleted: true } : {}) });
    }

    if (action.studentId) {
      await execute(
        'DELETE FROM task_assignments WHERE task_id = ? AND (student_id = ? OR (student_first_name = ? AND student_last_name = ?))',
        [task.id, action.studentId, action.firstName, action.lastName],
      );
    } else {
      await execute(
        'DELETE FROM task_assignments WHERE task_id = ? AND student_first_name = ? AND student_last_name = ?',
        [task.id, action.firstName, action.lastName],
      );
    }
    const recalculated = await recalculateTaskStatus(task);
    const newStatus = recalculated?.status || normalizeTaskStatusForRead(task.status);

    const updated = await getTaskWithAssignments(task.id);
    logAudit('unassign_task', 'task', task.id, `${action.firstName} ${action.lastName}`, {
      req,
      actorUserType: action.actorUserType,
      actorUserId: action.actorUserId,
      payload: { student_id: action.studentId || null, status: newStatus },
    });
    emitTasksChanged({ reason: 'unassign', taskId: task.id, mapId: resolveTaskMapId(updated) });
    await syncTaskProjectCompletionForProjects([updated.project_id]);
    res.json(updated);
  }),
);

module.exports = router;
