const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { nowIsoUtc } = require('../../lib/shared/isoTimestamp');
const {
  assignmentIdentityMatch,
  assignmentRowMatchesStudent,
} = require('../../lib/tasks/assignmentIdentityMatch');
const { requirePermission } = require('../../middleware/requireTeacher');
const { saveBase64ToDisk } = require('../../lib/uploads');
const asyncHandler = require('../../lib/asyncHandler');
const { logAudit } = require('../../lib/auditLog');
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
const { claimAssignmentSeat, SEAT_REFUSAL } = require('../../lib/tasks/assignmentSeat');
const { assertLinkedTutorialsRead } = require('../../lib/taskTutorialPrerequisites');

const router = express.Router();

router.post(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    // Une tâche archivée est retirée du jeu : elle a disparu des listes, mais un client
    // resté ouvert garde son id — sans ce garde-fou, l'inscription passait encore et
    // échappait au plafond de tâches actives (qui ignore les archives).
    if (task.archived_at != null)
      return res.status(400).json({ error: 'Tâche archivée : inscription indisponible' });
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

    const already = task.assignments.find((a) =>
      assignmentRowMatchesStudent(a, {
        studentId: action.studentId,
        firstName: action.firstName,
        lastName: action.lastName,
      }),
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

    // Prise de place et recalcul de statut sous le verrou de la ligne `tasks`
    // (cf. lib/tasks/assignmentSeat.js pour le détail des deux courses couvertes).
    let newStatus = normalizeTaskStatusForRead(task.status);
    try {
      const outcome = await withTransaction((tx) =>
        claimAssignmentSeat(tx, {
          taskId: task.id,
          studentId: action.studentId,
          firstName: action.firstName,
          lastName: action.lastName,
          assignedAt: nowIsoUtc(),
        }),
      );
      if (!outcome.ok) {
        const refusal = SEAT_REFUSAL[outcome.reason] || SEAT_REFUSAL.full;
        return res.status(refusal.status).json({ error: refusal.error });
      }
      newStatus = outcome.status;
    } catch (err) {
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
        return res.status(400).json({ error: 'Déjà assigné à cette tâche' });
      }
      throw err;
    }

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
    if (task.archived_at != null)
      return res.status(400).json({ error: 'Tâche archivée : inscription indisponible' });
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
    // Toute l'inscription de groupe se fait **sous le verrou** de la ligne `tasks` : sans
    // cela, `maxSlots` était calculé à partir d'une lecture antérieure (getTaskWithAssignments)
    // et une inscription concurrente pouvait faire dépasser `required_students` (l'index unique
    // de la migration 170 ne couvre que le doublon n3beur, pas la capacité). Même garde que le
    // chemin individuel (`claimAssignmentSeat`).
    const outcome = await withTransaction(async (tx) => {
      const locked = await tx.queryOne(
        'SELECT id, status, completion_mode, required_students FROM tasks WHERE id = ? FOR UPDATE',
        [task.id],
      );
      if (!locked) return { http: 404, error: 'Tâche introuvable' };
      const lockedStatus = normalizeTaskStatusForRead(locked.status);
      if (lockedStatus === 'validated') return { http: 400, error: 'Tâche déjà validée' };
      if (lockedStatus === 'on_hold')
        return { http: 400, error: 'Tâche en attente : inscription indisponible' };

      const assignedRows = await tx.queryAll(
        'SELECT student_id FROM task_assignments WHERE task_id = ?',
        [task.id],
      );
      const already = new Set(assignedRows.map((a) => String(a.student_id || '')));
      const maxSlots = Math.max(0, Number(locked.required_students || 1) - assignedRows.length);

      // `skipped` compte les déjà-affectés rencontrés AVANT que les créneaux soient pleins.
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
      if (toAssign.length > 0) {
        const assignedAt = nowIsoUtc();
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
        // `ON DUPLICATE KEY UPDATE` neutre : filet anti-doublon (index unique migration 170).
        await tx.execute(
          `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE student_first_name = VALUES(student_first_name),
                               student_last_name = VALUES(student_last_name)`,
          params,
        );
      }
      await recalculateTaskStatus(locked, tx);
      return { assigned: toAssign.length, skipped };
    });

    if (outcome.http) return res.status(outcome.http).json({ error: outcome.error });
    const { assigned, skipped } = outcome;
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
    if (task.archived_at != null)
      return res.status(400).json({ error: 'Tâche archivée : action indisponible' });
    const completionMode = normalizeTaskCompletionMode(task.completion_mode) || 'single_done';

    const { comment, imageData } = req.body || {};
    const action = await resolveStudentActionContext(req, req.body || {}, 'tasks.done_self');
    if (action.error) {
      return res
        .status(action.errorStatus || 400)
        .json({ error: action.error, ...(action.deleted ? { deleted: true } : {}) });
    }

    // Une inscription qui porte un identifiant n'est reconnue que par lui : sans cela,
    // marquer sa part « faite » pouvait cocher la ligne d'un homonyme.
    const identity = assignmentIdentityMatch('');
    const assignment = await queryOne(
      `SELECT id, done_at
         FROM task_assignments
        WHERE task_id = ?
          AND ${identity.clause}
        ORDER BY assigned_at DESC
        LIMIT 1`,
      [task.id, ...identity.params(action.studentId, action.firstName, action.lastName)],
    );
    if (!assignment) {
      return res
        .status(400)
        .json({ error: 'Tu dois être inscrit à cette tâche avant de la terminer' });
    }

    const tutorialsGate = await assertLinkedTutorialsRead(
      { queryAll, queryOne, execute },
      { taskId: task.id, userId: action.studentId },
    );
    if (!tutorialsGate.ok) {
      return res.status(403).json({
        error: 'Lis d’abord les tutoriels liés à cette tâche avant de la marquer comme faite.',
        missing_tutorials: tutorialsGate.missing,
      });
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
          nowIsoUtc(),
        ],
      );
      const logId = result.insertId;
      if (imageData) {
        const relativePath = `task-logs/${task.id}_${logId}.jpg`;
        try {
          await saveBase64ToDisk(relativePath, imageData);
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
          nowIsoUtc(),
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
    if (task.status === 'done' || task.status === 'validated') {
      return res.status(400).json({ error: 'Impossible de quitter une tâche déjà terminée' });
    }

    const action = await resolveStudentActionContext(req, req.body || {}, 'tasks.unassign_self');
    if (action.error) {
      return res
        .status(action.errorStatus || 400)
        .json({ error: action.error, ...(action.deleted ? { deleted: true } : {}) });
    }

    // Même règle qu'à l'inscription : se désinscrire ne doit pas retirer l'inscription
    // d'un camarade qui porte le même nom.
    const unassign = assignmentIdentityMatch('');
    await execute(`DELETE FROM task_assignments WHERE task_id = ? AND ${unassign.clause}`, [
      task.id,
      ...unassign.params(action.studentId, action.firstName, action.lastName),
    ]);
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
