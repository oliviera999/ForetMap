const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const {
  requirePermission,
  JWT_SECRET,
  hydrateAuthFromTokenClaims,
} = require('../../middleware/requireTeacher');
const { saveBase64ToDisk } = require('../../lib/uploads');
const asyncHandler = require('../../lib/asyncHandler');
const { logAudit } = require('../audit');
const { emitTasksChanged } = require('../../lib/realtime');
const { syncTaskProjectCompletionForProjects } = require('../../lib/syncTaskProjectCompletion');
const {
  ensurePrimaryRole,
  buildAuthzPayload,
  verifyRolePin,
  syncStudentPrimaryRoleFromProgress,
} = require('../../lib/rbac');
const { syncStudentRoleFromGroups } = require('../../lib/groupRole');
const {
  countStudentActiveTaskAssignments,
  getEffectiveMaxActiveTaskAssignments,
} = require('../../lib/studentTaskEnrollment');
const {
  normalizeTaskStatusForRead,
  normalizeTaskCompletionMode,
  recalculateTaskStatusWithConn,
} = require('../../lib/taskStatusRecalc');
const { getScopedStudentIds, canAccessStudentId } = require('../../lib/groupScope');
const { parseOptionalForetAuth } = require('../../lib/auth/jwtPipeline');
const {
  resolveTaskMapId,
  taskDangerLevelForResponse,
  taskDifficultyLevelForResponse,
  taskImportanceLevelForResponse,
  attachTaskLivingBeingsApiFields,
  attachTaskImagePublicFields,
  countDoneAssignments,
  isTaskBeforeStartDate,
  normalizeOptionalId,
  enrichTaskRow,
  trimName,
} = require('../../lib/taskRouteHelpers');
const { canRunTeacherStyleTaskStudentAction } = require('../../lib/taskAuthzHelpers');

const router = express.Router();

// Helpers recopiés depuis routes/tasks.js pour rester autonome et éviter
// tout import circulaire (même convention que routes/tasks/logs.js).
async function recalculateTaskStatus(taskLike) {
  return recalculateTaskStatusWithConn({ queryOne, execute }, taskLike);
}

async function parseOptionalAuth(req) {
  return parseOptionalForetAuth(req, { jwtSecret: JWT_SECRET, hydrateAuthFromTokenClaims });
}

async function getTaskProposerStudentId(taskId) {
  if (!taskId) return null;
  try {
    const row = await queryOne(
      `SELECT actor_user_id AS student_id
         FROM audit_log
        WHERE action = 'propose_task'
          AND target_type = 'task'
          AND target_id = ?
          AND actor_user_type = 'student'
          AND actor_user_id IS NOT NULL
        ORDER BY id DESC
        LIMIT 1`,
      [taskId],
    );
    return row?.student_id ? String(row.student_id) : null;
  } catch (err) {
    void err;
    return null;
  }
}

async function fetchZonesForTasks(taskIds) {
  if (!taskIds.length) return new Map();
  const ph = taskIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT tz.task_id, z.id AS zone_id, z.name AS zone_name, z.map_id
       FROM task_zones tz
       INNER JOIN zones z ON z.id = tz.zone_id
      WHERE tz.task_id IN (${ph})
      ORDER BY z.name`,
    taskIds,
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.task_id)) m.set(r.task_id, []);
    m.get(r.task_id).push({ id: r.zone_id, name: r.zone_name, map_id: r.map_id });
  }
  return m;
}

async function fetchMarkersForTasks(taskIds) {
  if (!taskIds.length) return new Map();
  const ph = taskIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT tm.task_id, m.id AS marker_id, m.label AS marker_label, m.map_id
       FROM task_markers tm
       INNER JOIN map_markers m ON m.id = tm.marker_id
      WHERE tm.task_id IN (${ph})
      ORDER BY m.label`,
    taskIds,
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.task_id)) m.set(r.task_id, []);
    m.get(r.task_id).push({ id: r.marker_id, label: r.marker_label, map_id: r.map_id });
  }
  return m;
}

async function fetchTutorialsForTasks(taskIds) {
  if (!taskIds.length) return new Map();
  const ph = taskIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT tt.task_id, tu.id AS tutorial_id, tu.title, tu.slug, tu.type, tu.source_url, tu.source_file_path
       FROM task_tutorials tt
       INNER JOIN tutorials tu ON tu.id = tt.tutorial_id
      WHERE tt.task_id IN (${ph}) AND tu.is_active = 1
      ORDER BY tu.sort_order ASC, tu.title ASC`,
    taskIds,
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.task_id)) m.set(r.task_id, []);
    m.get(r.task_id).push({
      id: Number(r.tutorial_id),
      title: r.title,
      slug: r.slug,
      type: r.type,
      source_url: r.source_url,
      source_file_path: r.source_file_path,
    });
  }
  return m;
}

async function fetchReferentsForTasks(taskIds) {
  if (!taskIds.length) return new Map();
  const ph = taskIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT tr.task_id, u.id AS uid, u.user_type, u.first_name, u.last_name, u.display_name, r.slug AS role_slug
       FROM task_referents tr
       INNER JOIN users u ON u.id = tr.user_id AND u.is_active = 1
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = u.user_type AND ur.is_primary = 1
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE tr.task_id IN (${ph})
      ORDER BY tr.task_id,
               COALESCE(NULLIF(TRIM(u.display_name), ''), CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')))`,
    taskIds,
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.task_id)) m.set(r.task_id, []);
    m.get(r.task_id).push({
      id: String(r.uid),
      user_type: r.user_type,
      first_name: r.first_name,
      last_name: r.last_name,
      display_name: r.display_name,
      role_slug: r.role_slug || null,
    });
  }
  return m;
}

async function getTaskWithAssignments(taskId) {
  const task = await queryOne(
    `SELECT t.*, z.name AS zone_name_legacy, mkr.label AS marker_label_legacy,
            tp.map_id AS project_map_id, tp.title AS project_title, tp.status AS project_status,
            t.image_path AS task_cover_image_path
       FROM tasks t
       LEFT JOIN zones z ON t.zone_id = z.id
       LEFT JOIN map_markers mkr ON t.marker_id = mkr.id
       LEFT JOIN task_projects tp ON tp.id = t.project_id
      WHERE t.id = ?`,
    [taskId],
  );
  if (!task) return null;
  const zm = await fetchZonesForTasks([taskId]);
  const mm = await fetchMarkersForTasks([taskId]);
  const tm = await fetchTutorialsForTasks([taskId]);
  const rm = await fetchReferentsForTasks([taskId]);
  enrichTaskRow(task, zm.get(taskId), mm.get(taskId), tm.get(taskId), rm.get(taskId));
  task.status = normalizeTaskStatusForRead(task.status);
  task.completion_mode = normalizeTaskCompletionMode(task.completion_mode) || 'single_done';
  task.danger_level = taskDangerLevelForResponse(task.danger_level);
  task.difficulty_level = taskDifficultyLevelForResponse(task.difficulty_level);
  task.importance_level = taskImportanceLevelForResponse(task.importance_level);
  task.is_before_start_date = isTaskBeforeStartDate(task);
  if (!task.zone_name && task.zone_name_legacy) task.zone_name = task.zone_name_legacy;
  if (!task.marker_label && task.marker_label_legacy) task.marker_label = task.marker_label_legacy;
  delete task.zone_name_legacy;
  delete task.marker_label_legacy;
  const m = await queryOne('SELECT id, label FROM maps WHERE id = ?', [task.map_id_resolved]);
  task.map_label = m ? m.label : null;
  task.assignments = await queryAll(
    'SELECT * FROM task_assignments WHERE task_id = ? ORDER BY assigned_at',
    [taskId],
  );
  task.assigned_count = Array.isArray(task.assignments) ? task.assignments.length : 0;
  task.assignees_total_count = task.assigned_count;
  task.assignees_done_count = countDoneAssignments(task.assignments);
  task.proposed_by_student_id = await getTaskProposerStudentId(taskId);
  attachTaskLivingBeingsApiFields(task);
  attachTaskImagePublicFields(task);
  return task;
}

async function ensureStudentPermission({ studentId, permissionKey, profilePin }) {
  await syncStudentRoleFromGroups(studentId);
  await ensurePrimaryRole('student', studentId, 'eleve_novice');
  await syncStudentPrimaryRoleFromProgress(studentId, null, null, { recordPromotionNotice: true });
  const base = await buildAuthzPayload('student', studentId, false);
  if (!base) return { ok: false, error: 'Profil introuvable' };
  if (base.permissions.includes(permissionKey)) return { ok: true, elevated: false };
  if (!profilePin) return { ok: false, error: 'Permission insuffisante' };
  const pinOk = await verifyRolePin(base.roleId, profilePin);
  if (!pinOk) return { ok: false, error: 'PIN profil incorrect' };
  const elevated = await buildAuthzPayload('student', studentId, true);
  if (!elevated || !elevated.permissions.includes(permissionKey)) {
    return { ok: false, error: 'Permission insuffisante' };
  }
  return { ok: true, elevated: true };
}

async function resolveStudentActionContext(req, payload = {}, permissionKey) {
  const auth = await parseOptionalAuth(req);
  const profilePin = payload?.profilePin;
  const providedStudentId = normalizeOptionalId(payload?.studentId);
  const providedFirstName = trimName(payload?.firstName);
  const providedLastName = trimName(payload?.lastName);
  const isTeacherAction = canRunTeacherStyleTaskStudentAction(auth);

  const byId = async (studentId) =>
    queryOne(
      "SELECT id, first_name, last_name FROM users WHERE user_type = 'student' AND id = ? LIMIT 1",
      [studentId],
    );

  const pickNames = (student) => ({
    firstName: providedFirstName || trimName(student?.first_name),
    lastName: providedLastName || trimName(student?.last_name),
  });

  if (providedStudentId) {
    const student = await byId(providedStudentId);
    if (!student) return { errorStatus: 401, error: 'Compte supprimé', deleted: true };
    if (!isTeacherAction) {
      if (!(
        auth?.userType === 'student' && String(auth?.userId || '') === String(providedStudentId)
      )) {
        return { errorStatus: 403, error: 'Session n3beur requise' };
      }
      const permission = await ensureStudentPermission({
        studentId: providedStudentId,
        permissionKey,
        profilePin,
      });
      if (!permission.ok) return { errorStatus: 403, error: permission.error };
    }
    if (isTeacherAction) {
      const allowed = await canAccessStudentId(auth, providedStudentId);
      if (!allowed) return { errorStatus: 403, error: 'n3beur hors périmètre de groupe' };
    }
    const names = pickNames(student);
    if (!names.firstName || !names.lastName) return { errorStatus: 400, error: 'Nom requis' };
    return {
      auth,
      studentId: String(providedStudentId),
      firstName: names.firstName,
      lastName: names.lastName,
      actorUserType: isTeacherAction ? auth?.userType || null : 'student',
      actorUserId: isTeacherAction ? auth?.userId || null : String(providedStudentId),
    };
  }

  if (auth?.userType === 'student' && auth?.userId) {
    const student = await byId(auth.userId);
    if (!student) return { errorStatus: 401, error: 'Compte supprimé', deleted: true };
    const permission = await ensureStudentPermission({
      studentId: auth.userId,
      permissionKey,
      profilePin,
    });
    if (!permission.ok) return { errorStatus: 403, error: permission.error };
    const names = pickNames(student);
    if (!names.firstName || !names.lastName) return { errorStatus: 400, error: 'Nom requis' };
    return {
      auth,
      studentId: String(auth.userId),
      firstName: names.firstName,
      lastName: names.lastName,
      actorUserType: 'student',
      actorUserId: String(auth.userId),
    };
  }

  if (isTeacherAction && providedFirstName && providedLastName && !providedStudentId) {
    return {
      errorStatus: 400,
      error: 'Identifiant n3beur requis (studentId obligatoire pour une action prof)',
    };
  }

  return { errorStatus: 400, error: 'Identifiant n3beur requis' };
}

router.post(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
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
  requirePermission('tasks.assign.group', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
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
    } else {
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
