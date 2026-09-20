const express = require('express');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { nowDbTimestamp } = require('../lib/shared/isoTimestamp');
const { requirePermission } = require('../middleware/requireTeacher');
const { deleteFile, writeBufferToDisk } = require('../lib/uploads');
const { respondInternalError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const logger = require('../lib/logger');
const { logAudit } = require('../lib/auditLog');
const { emitTasksChanged } = require('../lib/realtime');
const { syncTaskProjectCompletionForProjects } = require('../lib/syncTaskProjectCompletion');
const { syncTaskSpecies, loadTaskSpeciesMap } = require('../lib/speciesJunction');
const dbSpecies = { queryAll, queryOne, execute, withTransaction };
const { syncProgressionForValidatedTask } = require('../lib/rbac');
const {
  normalizeTaskStatusForRead,
  normalizeTaskCompletionMode,
} = require('../lib/taskStatusRecalc');
const { getScopedStudentIds, getUserAccessibleGroupIds } = require('../lib/groupScope');
const { listN3beurStudents, filterN3beurStudentIds } = require('../lib/n3beurStudents');
const { normalizeImportTaskStatus } = require('../lib/tasks/taskImport');
const {
  parseOptionalAuth,
  recalculateTaskStatus,
  mapExists,
  validateTaskLocations,
  setTaskZones,
  setTaskMarkers,
  setTaskTutorials,
  setTaskReferents,
  syncLegacyLocationColumns,
  getTaskProposerStudentId,
  fetchZonesForTasks,
  fetchMarkersForTasks,
  fetchTutorialsForTasks,
  fetchReferentsForTasks,
  getTaskWithAssignments,
} = require('../lib/tasks/taskQueries');
const {
  resolveTaskMapId,
  parseTaskDangerLevelFromClient,
  parseTaskDifficultyLevelFromClient,
  parseTaskImportanceLevelFromClient,
  taskDangerLevelForResponse,
  taskDifficultyLevelForResponse,
  taskImportanceLevelForResponse,
  taskImportanceOrderBySql,
  attachTaskLivingBeingsApiFields,
  decodeTaskImageBuffer,
  attachTaskImagePublicFields,
  isTaskBeforeStartDate,
  sanitizeRequiredStudents,
  normalizeIdArray,
  normalizeTutorialIdArray,
  normalizeOptionalId,
  enrichTaskRow,
  referentPublicLabel,
  normalizeArchivedFilter,
  archivedFilterSql,
  normalizeTaskDateInput,
  validateTaskDateRange,
} = require('../lib/taskRouteHelpers');
const {
  canReadAllAssignments,
  canManageTasks,
  canValidateTasks,
  assertCanTeacherSetTaskStatus,
  isVisitorRole,
} = require('../lib/taskAuthzHelpers');
const {
  getRecurrenceToday,
  resolveRecurrenceAnchor,
  computeNextOccurrenceWindow,
  createOpenDayResolver,
  parseTemplateIdArray,
} = require('../lib/recurringTasks');

const router = express.Router();
const MAX_TASK_REFERENTS = 15;

async function getTaskProject(projectId) {
  if (!projectId) return null;
  return queryOne('SELECT id, map_id, title, status FROM task_projects WHERE id = ?', [projectId]);
}

async function validateTaskProject(projectId, resolvedMapId) {
  if (!projectId) return { projectId: null, mapId: resolvedMapId || null };
  const project = await getTaskProject(projectId);
  if (!project) return { error: 'Projet introuvable' };
  if (resolvedMapId && project.map_id !== resolvedMapId) {
    return { error: 'Le projet doit appartenir à la même carte que la tâche' };
  }
  return { projectId: project.id, mapId: resolvedMapId || project.map_id };
}

async function getTaskZoneIds(taskId) {
  const rows = await queryAll('SELECT zone_id FROM task_zones WHERE task_id = ? ORDER BY zone_id', [
    taskId,
  ]);
  return rows.map((r) => r.zone_id);
}

async function getTaskMarkerIds(taskId) {
  const rows = await queryAll(
    'SELECT marker_id FROM task_markers WHERE task_id = ? ORDER BY marker_id',
    [taskId],
  );
  return rows.map((r) => r.marker_id);
}

/** Récurrences acceptées par l'API (et seules à engendrer une occurrence suivante). */
const RECURRENCE_WITH_TEMPLATE_LOCS = new Set(['weekly', 'biweekly', 'monthly']);

/**
 * Normalise recurrence pour POST/PUT JSON (whitelist).
 * @returns {{ value: string|null } | { error: string }}
 */
function normalizeTaskRecurrenceInput(raw, { requiredPresent = false } = {}) {
  if (raw === undefined || raw === null || raw === '') {
    if (requiredPresent) return { value: null };
    return { value: null };
  }
  const r = String(raw).trim().toLowerCase();
  if (!r) return { value: null };
  if (!RECURRENCE_WITH_TEMPLATE_LOCS.has(r)) {
    return { error: 'Récurrence invalide (weekly, biweekly ou monthly)' };
  }
  return { value: r };
}

let recurrenceTemplateColumnsReady = null;

async function hasRecurrenceTemplateColumns() {
  if (recurrenceTemplateColumnsReady !== null) return recurrenceTemplateColumnsReady;
  try {
    const row = await queryOne(
      `SELECT COUNT(*) AS c
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tasks'
          AND COLUMN_NAME = 'recurrence_template_zone_ids'`,
    );
    recurrenceTemplateColumnsReady = Number(row?.c) > 0;
  } catch (err) {
    logger.warn({ err }, 'Vérification colonnes recurrence_template_* en échec');
    recurrenceTemplateColumnsReady = false;
  }
  return recurrenceTemplateColumnsReady;
}

/**
 * Lieux à rendre à une tâche qui quitte l'état « validée », lus dans la mémoire posée au
 * moment du détachement.
 *
 * Prudence volontaire : un lieu supprimé depuis la validation, ou qui a changé de carte,
 * est simplement laissé de côté, et une mémoire inexploitable ne rend rien. Rendre un lieu
 * est un **confort de reprise**, jamais une raison de refuser le changement de statut que le
 * professeur a demandé.
 *
 * @returns {Promise<{ zoneIds: string[], markerIds: string[] }>} vide si rien à rendre.
 */
async function restoreDetachedLocations(task, explicitMapId) {
  const vide = { zoneIds: [], markerIds: [] };
  if (!(await hasRecurrenceTemplateColumns())) return vide;
  const zoneIds = parseTemplateIdArray(task.recurrence_template_zone_ids);
  const markerIds = parseTemplateIdArray(task.recurrence_template_marker_ids);
  if (!zoneIds.length && !markerIds.length) return vide;
  const check = await validateTaskLocations(zoneIds, markerIds, explicitMapId);
  if (check.error) {
    logger.warn(
      { taskId: task.id, reason: check.error },
      'Lieux mémorisés inexploitables — tâche remise à un statut actif sans lieu',
    );
    return vide;
  }
  return { zoneIds, markerIds };
}

/**
 * Mémorise les zones/repères d'une tâche **avant** qu'une validation ne l'en détache.
 *
 * Deux usages, un seul enregistrement (colonnes `recurrence_template_*`, migration 051) :
 * - le job de récurrence y reprend les lieux de l'occurrence suivante ;
 * - une tâche remise à un statut actif y retrouve les siens (`restoreDetachedLocations`).
 *
 * Ce second usage vaut pour **toute** tâche, récurrente ou non : sans lui, repasser une tâche
 * validée en « à faire » la laissait sans lieu — donc sans pastille et introuvable sur la
 * carte, alors que rien à l'écran ne le signalait.
 */
async function persistDetachedLocationsSnapshot(taskId, zoneIds, markerIds, dbx) {
  if (!(await hasRecurrenceTemplateColumns())) {
    logger.warn(
      { taskId },
      'Colonnes recurrence_template_* absentes — mémoire des lieux ignorée (migration 051 ?)',
    );
    return;
  }
  const z = Array.isArray(zoneIds) ? zoneIds : [];
  const m = Array.isArray(markerIds) ? markerIds : [];
  try {
    await (dbx || { execute }).execute(
      'UPDATE tasks SET recurrence_template_zone_ids = ?, recurrence_template_marker_ids = ? WHERE id = ?',
      [JSON.stringify(z), JSON.stringify(m), taskId],
    );
  } catch (err) {
    if (err && (err.errno === 1054 || err.code === 'ER_BAD_FIELD_ERROR')) {
      recurrenceTemplateColumnsReady = false;
      logger.warn({ err, taskId }, 'Snapshot récurrence ignoré — colonnes manquantes');
      return;
    }
    throw err;
  }
}

async function getTaskTutorialIds(taskId) {
  const rows = await queryAll(
    'SELECT tutorial_id FROM task_tutorials WHERE task_id = ? ORDER BY tutorial_id',
    [taskId],
  );
  return rows.map((r) => Number(r.tutorial_id));
}

async function fetchTaskProposerMap(taskIds) {
  if (!taskIds.length) return new Map();
  try {
    const placeholders = taskIds.map(() => '?').join(',');
    const rows = await queryAll(
      `SELECT target_id AS task_id, actor_user_id AS student_id
         FROM audit_log
        WHERE action = 'propose_task'
          AND target_type = 'task'
          AND actor_user_type = 'student'
          AND actor_user_id IS NOT NULL
          AND target_id IN (${placeholders})
        ORDER BY id DESC`,
      taskIds,
    );
    const map = new Map();
    for (const row of rows) {
      if (!row?.task_id || !row?.student_id) continue;
      if (!map.has(row.task_id)) {
        map.set(row.task_id, String(row.student_id));
      }
    }
    return map;
  } catch (err) {
    logger.warn(
      { err, taskCount: taskIds.length },
      'Liste proposeurs (audit_log) en échec — tâches renvoyées sans proposed_by',
    );
    return new Map();
  }
}

/** Colonnes assignations pour listes (évite SELECT * × N tâches). */
const TASK_ASSIGNMENT_LIST_COLUMNS =
  'id, task_id, student_id, student_first_name, student_last_name, done_at, assigned_at';

/**
 * Projection SQL liste polling — omet living_beings brut et recurrence_template_* (TEXT).
 * Le détail `GET /api/tasks/:id` conserve `SELECT t.*` via getTaskWithAssignments.
 */
const TASK_LIST_SQL_BASE = `
    SELECT t.id, t.title, t.description, t.image_path, t.map_id, t.project_id, t.group_id,
           t.zone_id, t.marker_id, t.start_date, t.due_date, t.required_students, t.completion_mode,
           t.danger_level, t.difficulty_level, t.importance_level, t.sort_order, t.status,
           t.archived_at, t.archived_via_project, t.validated_at, t.created_at,
           t.recurrence, t.parent_task_id, t.recurrence_series_id,
           tp.map_id AS project_map_id, tp.title AS project_title, tp.status AS project_status,
           m.id AS map_id_resolved_join, m.label AS map_label,
           t.image_path AS task_cover_image_path
      FROM tasks t
      LEFT JOIN zones z ON t.zone_id = z.id
      LEFT JOIN map_markers mkr ON t.marker_id = mkr.id
      LEFT JOIN task_projects tp ON tp.id = t.project_id
      LEFT JOIN maps m ON m.id = COALESCE(t.map_id, z.map_id, mkr.map_id)
  `;

/** Assignations pour GET /api/tasks (liste), selon le rôle. */
async function fetchTaskListAssignments(auth, taskIds) {
  if (!taskIds.length) return [];
  if (canReadAllAssignments(auth)) {
    const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
    const hasGlobalRead =
      perms.includes('stats.read.all') ||
      perms.includes('tasks.manage') ||
      perms.includes('tasks.validate');
    const ph = taskIds.map(() => '?').join(',');
    if (hasGlobalRead) {
      return queryAll(
        `SELECT ${TASK_ASSIGNMENT_LIST_COLUMNS} FROM task_assignments WHERE task_id IN (${ph})`,
        taskIds,
      );
    }
    const scope = await getScopedStudentIds(auth);
    if (!scope.studentIds.length) return [];
    const sph = scope.studentIds.map(() => '?').join(',');
    return queryAll(
      `SELECT ${TASK_ASSIGNMENT_LIST_COLUMNS} FROM task_assignments
        WHERE task_id IN (${ph})
          AND student_id IN (${sph})`,
      [...taskIds, ...scope.studentIds],
    );
  }
  if (auth?.userType === 'student' && auth?.userId) {
    const ph = taskIds.map(() => '?').join(',');
    if (isVisitorRole(auth)) {
      return queryAll(
        `SELECT ${TASK_ASSIGNMENT_LIST_COLUMNS} FROM task_assignments WHERE task_id IN (${ph}) AND student_id = ?`,
        [...taskIds, auth.userId],
      );
    }
    return queryAll(
      `SELECT id, task_id, student_first_name, student_last_name, done_at, assigned_at
         FROM task_assignments
        WHERE task_id IN (${ph})
        ORDER BY assigned_at`,
      taskIds,
    );
  }
  return [];
}

async function fetchTaskAssignmentAggregates(taskIds) {
  if (!taskIds.length) return [];
  const ph = taskIds.map(() => '?').join(',');
  return queryAll(
    `SELECT task_id,
            COUNT(*) AS assigned_count,
            SUM(CASE WHEN done_at IS NOT NULL THEN 1 ELSE 0 END) AS done_count
       FROM task_assignments
      WHERE task_id IN (${ph})
      GROUP BY task_id`,
    taskIds,
  );
}

async function validateReferentUserIds(userIds) {
  if (!userIds.length) return { userIds };
  if (userIds.length > MAX_TASK_REFERENTS) {
    return { error: `Au plus ${MAX_TASK_REFERENTS} référents par tâche` };
  }
  const placeholders = userIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT id, user_type FROM users
      WHERE id IN (${placeholders}) AND is_active = 1 AND user_type IN ('teacher','student')`,
    userIds,
  );
  const existing = new Map(rows.map((r) => [String(r.id), r.user_type]));
  for (const uid of userIds) {
    if (!existing.has(String(uid))) return { error: 'Référent introuvable ou compte inactif' };
  }
  return { userIds };
}

async function validateTutorialIds(tutorialIds) {
  if (!tutorialIds.length) return { tutorialIds };
  const placeholders = tutorialIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT id FROM tutorials WHERE id IN (${placeholders}) AND is_active = 1`,
    tutorialIds,
  );
  const existing = new Set(rows.map((r) => Number(r.id)));
  for (const tid of tutorialIds) {
    if (!existing.has(Number(tid))) return { error: 'Tutoriel introuvable' };
  }
  return { tutorialIds };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = await parseOptionalAuth(req);
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    const projectId = req.query.project_id ? String(req.query.project_id).trim() : '';
    const groupId = req.query.group_id ? String(req.query.group_id).trim() : '';
    // Portée d'archivage : 'active' (défaut) masque les tâches archivées. Les portées
    // 'archived'/'all' sont réservées à la gestion (prof) — un élève ne voit jamais
    // d'archive : on force 'active' hors permission tasks.manage.
    const archivedScope = canManageTasks(auth)
      ? normalizeArchivedFilter(req.query.archived)
      : 'active';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    if (projectId && !(await getTaskProject(projectId))) {
      return res.status(400).json({ error: 'Projet introuvable' });
    }
    const sqlBase = TASK_LIST_SQL_BASE;
    const where = [];
    const params = [];
    if (mapId) {
      where.push(`(
         t.id IN (SELECT tz.task_id FROM task_zones tz INNER JOIN zones zz ON zz.id = tz.zone_id WHERE zz.map_id = ?)
         OR t.id IN (SELECT tm.task_id FROM task_markers tm INNER JOIN map_markers mm ON mm.id = tm.marker_id WHERE mm.map_id = ?)
         OR (
           NOT EXISTS (SELECT 1 FROM task_zones tz2 WHERE tz2.task_id = t.id)
           AND NOT EXISTS (SELECT 1 FROM task_markers tm2 WHERE tm2.task_id = t.id)
           AND (t.map_id = ? OR t.map_id IS NULL)
         )
       )`);
      params.push(mapId, mapId, mapId);
    }
    if (projectId) {
      where.push('t.project_id = ?');
      params.push(projectId);
    }
    if (groupId) {
      where.push('t.group_id = ?');
      params.push(groupId);
    }
    const archivedSql = archivedFilterSql(archivedScope, 't.archived_at');
    if (archivedSql) where.push(archivedSql);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderSql = `ORDER BY ${taskImportanceOrderBySql('t.')}`;
    const tasks = await queryAll(`${sqlBase} ${whereSql} ${orderSql}`, params);
    const taskIds = tasks.map((t) => t.id);
    const proposedTaskIds = tasks
      .filter((t) => normalizeTaskStatusForRead(t?.status) === 'proposed')
      .map((t) => t.id);
    const [
      zm,
      mm,
      tutorialsMap,
      referentsMap,
      proposerByTask,
      assignments,
      countRows,
      taskSpeciesMap,
    ] = await Promise.all([
      fetchZonesForTasks(taskIds),
      fetchMarkersForTasks(taskIds),
      fetchTutorialsForTasks(taskIds),
      fetchReferentsForTasks(taskIds),
      fetchTaskProposerMap(proposedTaskIds),
      fetchTaskListAssignments(auth, taskIds),
      fetchTaskAssignmentAggregates(taskIds),
      loadTaskSpeciesMap(dbSpecies, taskIds),
    ]);
    const assignmentsByTask = new Map();
    for (const a of assignments) {
      if (!assignmentsByTask.has(a.task_id)) assignmentsByTask.set(a.task_id, []);
      assignmentsByTask.get(a.task_id).push(a);
    }
    const assignedCountByTask = new Map();
    const doneCountByTask = new Map();
    for (const row of countRows) {
      assignedCountByTask.set(row.task_id, Number(row.assigned_count) || 0);
      doneCountByTask.set(row.task_id, Number(row.done_count) || 0);
    }
    const enriched = tasks.map((t) => {
      const row = { ...t };
      enrichTaskRow(
        row,
        zm.get(t.id),
        mm.get(t.id),
        tutorialsMap.get(t.id),
        referentsMap.get(t.id),
      );
      row.status = normalizeTaskStatusForRead(row.status);
      row.completion_mode = normalizeTaskCompletionMode(row.completion_mode) || 'single_done';
      row.danger_level = taskDangerLevelForResponse(row.danger_level);
      row.difficulty_level = taskDifficultyLevelForResponse(row.difficulty_level);
      row.importance_level = taskImportanceLevelForResponse(row.importance_level);
      row.is_before_start_date = isTaskBeforeStartDate(row);
      delete row.map_id_resolved_join;
      row.assignments = assignmentsByTask.get(t.id) || [];
      row.assigned_count = assignedCountByTask.get(t.id) || 0;
      row.assignees_total_count = row.assigned_count;
      row.assignees_done_count = doneCountByTask.get(t.id) || 0;
      row.proposed_by_student_id = proposerByTask.get(t.id) || null;
      attachTaskLivingBeingsApiFields(row, taskSpeciesMap.get(t.id) || [], {
        includeSpeciesObjects: false,
      });
      attachTaskImagePublicFields(row);
      return row;
    });
    const mapLabelIds = [...new Set(enriched.map((r) => r.map_id_resolved).filter(Boolean))];
    if (mapLabelIds.length) {
      const ph = mapLabelIds.map(() => '?').join(',');
      const mrows = await queryAll(`SELECT id, label FROM maps WHERE id IN (${ph})`, mapLabelIds);
      const labelByMap = Object.fromEntries(mrows.map((r) => [r.id, r.label]));
      for (const row of enriched) {
        if (row.map_id_resolved && labelByMap[row.map_id_resolved]) {
          row.map_label = labelByMap[row.map_id_resolved];
        }
      }
    }
    res.json(enriched);
  }),
);

router.post(
  '/reorder-project',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const projectId = normalizeOptionalId(req.body?.project_id);
    const orderedTaskIdsInput = normalizeIdArray(req.body?.task_ids);
    if (!projectId) return res.status(400).json({ error: 'Projet requis' });
    if (!orderedTaskIdsInput.length)
      return res.status(400).json({ error: 'Liste de tâches requise' });
    const project = await getTaskProject(projectId);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const mapId = project.map_id || null;
    const projectTasks = await queryAll(
      `SELECT id, sort_order, importance_level, due_date
       FROM tasks
      WHERE project_id = ?
      ORDER BY ${taskImportanceOrderBySql()},
        id ASC`,
      [projectId],
    );
    if (!projectTasks.length)
      return res.status(400).json({ error: 'Ce projet ne contient aucune tâche à ordonner' });

    const knownIds = new Set(projectTasks.map((row) => String(row.id)));
    const orderedTaskIds = [];
    const seen = new Set();
    for (const tid of orderedTaskIdsInput) {
      const normalized = String(tid || '').trim();
      if (!normalized || seen.has(normalized)) continue;
      if (!knownIds.has(normalized)) {
        return res
          .status(400)
          .json({ error: 'La liste contient une tâche qui n’appartient pas au projet cible' });
      }
      seen.add(normalized);
      orderedTaskIds.push(normalized);
    }
    for (const row of projectTasks) {
      const tid = String(row.id);
      if (!seen.has(tid)) orderedTaskIds.push(tid);
    }

    await withTransaction(async (tx) => {
      for (let idx = 0; idx < orderedTaskIds.length; idx += 1) {
        await tx.execute('UPDATE tasks SET sort_order = ? WHERE id = ?', [
          idx + 1,
          orderedTaskIds[idx],
        ]);
      }
    });

    logAudit('reorder_project_tasks', 'task_project', projectId, project.title || 'Projet', {
      req,
      payload: {
        project_id: projectId,
        task_count: orderedTaskIds.length,
      },
    });
    emitTasksChanged({ reason: 'reorder_project_tasks', projectId, mapId });
    res.json({ success: true, project_id: projectId, ordered_task_ids: orderedTaskIds });
  }),
);

async function getScopedAssignableStudentIds(auth) {
  const scope = await getScopedStudentIds(auth);
  return scope.all ? null : scope.studentIds;
}

async function getScopedTeacherIds(auth) {
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  const isAdmin = String(auth?.roleSlug || '').toLowerCase() === 'admin';
  if (isAdmin || perms.includes('stats.read.all')) return null;
  const groupIds = await getUserAccessibleGroupIds(auth, { includeDescendants: true });
  if (!groupIds.length) return [];
  const rows = await queryAll(
    `SELECT DISTINCT gm.user_id
       FROM group_members gm
       INNER JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id IN (${groupIds.map(() => '?').join(',')})
        AND u.user_type = 'teacher'
        AND u.is_active = 1`,
    groupIds,
  );
  return rows.map((r) => String(r.user_id));
}

router.get(
  '/assignable-students',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const groupId = req.query.group_id ? String(req.query.group_id).trim() : '';
    const scope = await getScopedStudentIds(req.auth, { groupId: groupId || null });
    if (scope.unauthorizedGroup) return res.status(403).json({ error: 'Groupe hors périmètre' });
    const rows = await listN3beurStudents(scope.all ? null : scope.studentIds);
    rows.sort((a, b) =>
      `${a.first_name || ''} ${a.last_name || ''}`
        .trim()
        .localeCompare(`${b.first_name || ''} ${b.last_name || ''}`.trim(), 'fr', {
          sensitivity: 'base',
        }),
    );
    res.json({
      students: rows.map((row) => ({
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        pseudo: row.pseudo,
        avatar_path: row.avatar_path,
        role_slug: row.role_slug ?? null,
        role_display_name: row.role_display_name ?? null,
      })),
    });
  }),
);

router.get(
  '/referent-candidates',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const [scopedStudentIds, scopedTeacherIds] = await Promise.all([
      getScopedAssignableStudentIds(req.auth),
      getScopedTeacherIds(req.auth),
    ]);
    const rows = await queryAll(
      `SELECT u.id, u.user_type, u.first_name, u.last_name, u.display_name, r.slug AS primary_role_slug
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = u.user_type AND ur.is_primary = 1
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.is_active = 1 AND u.user_type IN ('teacher', 'student')`,
    );
    function teacherTier(slug) {
      const s = String(slug || '').toLowerCase();
      if (s === 'admin') return 0;
      if (s === 'prof') return 1;
      return 2;
    }
    function labelForSort(row) {
      return referentPublicLabel({ ...row, uid: row.id });
    }
    const teachers = rows.filter((r) => {
      if (r.user_type !== 'teacher') return false;
      if (scopedTeacherIds == null) return true;
      return scopedTeacherIds.includes(String(r.id));
    });
    // Un compte `student` porteur d'un profil non n3beur (visiteur, personnel, prof de classe,
    // profil GL) n'a aucune permission de tâche : il ne doit pas être proposé comme référent.
    const n3beurIds = new Set(
      await filterN3beurStudentIds(
        rows.filter((r) => r.user_type === 'student').map((r) => String(r.id)),
      ),
    );
    const students = rows.filter((r) => {
      if (r.user_type !== 'student') return false;
      if (!n3beurIds.has(String(r.id))) return false;
      if (scopedStudentIds == null) return true;
      return scopedStudentIds.includes(String(r.id));
    });
    teachers.sort((a, b) => {
      const ta = teacherTier(a.primary_role_slug);
      const tb = teacherTier(b.primary_role_slug);
      if (ta !== tb) return ta - tb;
      return labelForSort(a).localeCompare(labelForSort(b), 'fr', { sensitivity: 'base' });
    });
    students.sort((a, b) =>
      labelForSort(a).localeCompare(labelForSort(b), 'fr', { sensitivity: 'base' }),
    );
    res.json([...teachers, ...students]);
  }),
);

/**
 * Prochaine occurrence prévue de chaque série récurrente.
 *
 * Rend visible la règle d'ancrage plutôt que de la laisser à la documentation : le panneau
 * prof affiche la date que le job posera, et sur quelle ancre elle est calculée. Déclarée
 * AVANT `/:id`, sinon Express prendrait « recurring-preview » pour un identifiant.
 */
router.get(
  '/recurring-preview',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const today = getRecurrenceToday();
    // Le calcul par série coûte plusieurs allers-retours en base (`nextOpenDay` scanne le
    // calendrier jour par jour) : la liste reste donc bornée. Mais l'ORDRE de ce plafond
    // décide de CE QU'ON PERD, et il était exactement à l'envers.
    //
    // `ORDER BY due_date DESC` gardait les séries dont l'échéance est la plus LOINTAINE —
    // celles qui roulent toutes seules — et coupait les plus anciennes. Or une série
    // bloquée garde une vieille échéance *parce qu'*elle est bloquée : les séries en
    // attente de validation étaient donc les premières à sortir de la fenêtre. Le panneau
    // perdait silencieusement sa ligne de prévision (le front la masque quand la série est
    // absente de la réponse) précisément pour les séries qui réclamaient une action.
    //
    // On classe donc par ce qui appelle le professeur : non validée d'abord, puis échéance
    // la plus ancienne. Et on demande une ligne de plus que le plafond pour pouvoir DIRE
    // que la liste est tronquée, au lieu de l'amputer en silence.
    const PREVIEW_LIMIT = 200;
    const rows = await queryAll(
      `SELECT t.id, t.title, t.recurrence, t.recurrence_series_id, t.recurrence_anchor_date,
              t.start_date, t.due_date, t.status, t.created_at
         FROM tasks t
        WHERE t.recurrence IN ('weekly','biweekly','monthly')
          AND t.archived_at IS NULL
          AND t.due_date IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM tasks p
             WHERE p.recurrence_series_id = t.recurrence_series_id
               AND p.recurrence_series_id IS NOT NULL
               AND p.archived_at IS NULL
               AND p.due_date > t.due_date
          )
        ORDER BY (t.status = 'validated') ASC, t.due_date ASC
        LIMIT ?`,
      [PREVIEW_LIMIT + 1],
    );
    const truncated = rows.length > PREVIEW_LIMIT;
    if (truncated) rows.length = PREVIEW_LIMIT;

    // Cache calendrier partagé par toute la prévisualisation : `isSchoolOpenDay` interroge
    // la base jour par jour, et les séries partagent largement les mêmes dates.
    const nextOpenDay = createOpenDayResolver();
    const series = [];
    for (const row of rows) {
      const anchor = resolveRecurrenceAnchor(row);
      const window = await computeNextOccurrenceWindow(row, String(row.recurrence || ''), today, {
        nextOpenDay,
      });
      const validated = String(row.status || '').trim() === 'validated';
      const dueReached = String(row.due_date || '') <= today;
      series.push({
        series_id: row.recurrence_series_id || row.id,
        task_id: row.id,
        title: row.title,
        recurrence: row.recurrence,
        anchor_date: anchor,
        // Ce que le professeur doit faire pour que l'occurrence suivante arrive.
        pending: !validated ? 'validation' : dueReached ? null : 'due_date',
        current_start: row.start_date || null,
        current_due: row.due_date || null,
        next_start: window?.startDate || null,
        next_due: window?.dueDate || null,
      });
    }
    // `truncated` permet au panneau de dire « prévision non calculée pour ces séries-là »
    // au lieu de laisser croire qu'elles n'en ont pas.
    res.json({ today, series, truncated, limit: PREVIEW_LIMIT });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    const authOne = await parseOptionalAuth(req);
    if (authOne?.userType === 'student' && isVisitorRole(authOne)) {
      const mine = (task.assignments || []).filter(
        (a) => String(a.student_id || '') === String(authOne.userId),
      );
      task.assignments = mine;
      if (
        task.proposed_by_student_id &&
        String(task.proposed_by_student_id) !== String(authOne.userId)
      ) {
        task.proposed_by_student_id = null;
      }
    }
    res.json(task);
  }),
);

router.post(
  '/',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const {
      title,
      description,
      zone_id,
      marker_id,
      zone_ids,
      marker_ids,
      tutorial_ids,
      referent_user_ids,
      map_id,
      project_id,
      start_date,
      due_date,
      required_students,
      recurrence,
      completion_mode,
      danger_level,
      difficulty_level,
      importance_level,
      group_id,
      living_beings,
      imageData,
    } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });

    let decodedTaskImage = null;
    if (
      Object.prototype.hasOwnProperty.call(req.body || {}, 'imageData') &&
      imageData != null &&
      String(imageData).trim()
    ) {
      decodedTaskImage = decodeTaskImageBuffer(imageData);
      if (decodedTaskImage.error) return res.status(400).json({ error: decodedTaskImage.error });
    }

    let zIds = normalizeIdArray(zone_ids);
    let mIds = normalizeIdArray(marker_ids);
    if (!zIds.length && zone_id) zIds = [String(zone_id).trim()].filter(Boolean);
    if (!mIds.length && marker_id) mIds = [String(marker_id).trim()].filter(Boolean);

    const explicitMap = map_id !== undefined ? map_id : null;
    const loc = await validateTaskLocations(zIds, mIds, explicitMap);
    if (loc.error) return res.status(400).json({ error: loc.error });
    const projectValidation = await validateTaskProject(normalizeOptionalId(project_id), loc.mapId);
    if (projectValidation.error) return res.status(400).json({ error: projectValidation.error });
    const tutorialIds = normalizeTutorialIdArray(tutorial_ids);
    const tutorialValidation = await validateTutorialIds(tutorialIds);
    if (tutorialValidation.error) return res.status(400).json({ error: tutorialValidation.error });
    const referentIds = normalizeIdArray(referent_user_ids);
    const referentValidation = await validateReferentUserIds(referentIds);
    if (referentValidation.error) return res.status(400).json({ error: referentValidation.error });

    const reqStudents = sanitizeRequiredStudents(required_students);
    const completionMode = normalizeTaskCompletionMode(completion_mode);
    if (!completionMode) return res.status(400).json({ error: 'Mode de validation invalide' });
    const parsedDanger = parseTaskDangerLevelFromClient(danger_level);
    if (parsedDanger.error) return res.status(400).json({ error: parsedDanger.error });
    const parsedDifficulty = parseTaskDifficultyLevelFromClient(difficulty_level);
    if (parsedDifficulty.error) return res.status(400).json({ error: parsedDifficulty.error });
    const parsedImportance = parseTaskImportanceLevelFromClient(importance_level);
    if (parsedImportance.error) return res.status(400).json({ error: parsedImportance.error });
    const parsedRecurrence = normalizeTaskRecurrenceInput(recurrence);
    if (parsedRecurrence.error) return res.status(400).json({ error: parsedRecurrence.error });
    const parsedStart = normalizeTaskDateInput(start_date, 'Date de début');
    if (parsedStart.error) return res.status(400).json({ error: parsedStart.error });
    const parsedDue = normalizeTaskDateInput(due_date, "Date d'échéance");
    if (parsedDue.error) return res.status(400).json({ error: parsedDue.error });
    const rangeError = validateTaskDateRange(parsedStart.value, parsedDue.value);
    if (rangeError) return res.status(400).json({ error: rangeError.error });
    const normalizedGroupId = normalizeOptionalId(group_id);
    const id = crypto.randomUUID();
    const seriesId = parsedRecurrence.value ? crypto.randomUUID() : null;
    // Ancre de récurrence posée dès la création (migration 258) : la date de départ porte
    // le rythme de la série. Sans date de départ elle reste nulle, et le job la dérivera de
    // la date de création au premier clone.
    const anchorDate = parsedRecurrence.value ? parsedStart.value : null;
    // Écritures atomiques (audit §2.5) : INSERT tasks + jointures + colonnes legacy + espèces
    // + image dans UNE transaction — en cas d'échec (image comprise), tout est annulé
    // et le fichier image éventuellement écrit est supprimé.
    await withTransaction(async (tx) => {
      await tx.execute(
        'INSERT INTO tasks (id, title, description, map_id, project_id, group_id, zone_id, marker_id, start_date, due_date, required_students, completion_mode, danger_level, difficulty_level, importance_level, recurrence, recurrence_series_id, recurrence_anchor_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          title,
          description || '',
          projectValidation.mapId,
          projectValidation.projectId,
          normalizedGroupId,
          zIds[0] || null,
          mIds[0] || null,
          parsedStart.value,
          parsedDue.value,
          reqStudents,
          completionMode,
          parsedDanger.level,
          parsedDifficulty.level,
          parsedImportance.level,
          parsedRecurrence.value,
          seriesId,
          anchorDate,
          nowDbTimestamp(),
        ],
      );
      await setTaskZones(id, zIds, tx);
      await setTaskMarkers(id, mIds, tx);
      await setTaskTutorials(id, tutorialIds, tx);
      await setTaskReferents(id, referentValidation.userIds, tx);
      await syncLegacyLocationColumns(id, zIds, mIds, tx);
      if (
        Object.prototype.hasOwnProperty.call(req.body || {}, 'living_beings') ||
        Object.prototype.hasOwnProperty.call(req.body || {}, 'species_ids')
      ) {
        await syncTaskSpecies(tx, id, req.body.species_ids, living_beings);
      }
      if (decodedTaskImage) {
        const rel = `tasks/${id}.${decodedTaskImage.ext}`;
        try {
          await writeBufferToDisk(rel, decodedTaskImage.buffer);
          await tx.execute('UPDATE tasks SET image_path = ? WHERE id = ?', [rel, id]);
        } catch (imgErr) {
          try {
            deleteFile(rel);
          } catch (_) {
            /* ignore */
          }
          // Le rollback de la transaction supprime la tâche et ses jointures.
          throw imgErr;
        }
      }
    });
    const task = await getTaskWithAssignments(id);
    logAudit('create_task', 'task', id, title, {
      req,
      payload: { map_id: projectValidation.mapId, project_id: projectValidation.projectId || null },
    });
    emitTasksChanged({
      reason: 'create_task',
      taskId: id,
      projectId: projectValidation.projectId || null,
      mapId: projectValidation.mapId,
    });
    await syncTaskProjectCompletionForProjects([projectValidation.projectId]);
    res.status(201).json(task);
  }),
);

router.put('/:id', async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.archived_at != null) {
      return res.status(409).json({ error: 'Désarchivez la tâche avant de la modifier' });
    }
    const previousProjectId =
      task.project_id != null && String(task.project_id).trim()
        ? String(task.project_id).trim()
        : null;
    const auth = await parseOptionalAuth(req);
    const isTeacherManageAction = canManageTasks(auth);
    const isTeacherValidateAction = canValidateTasks(auth);
    const isTeacherPut = isTeacherManageAction || isTeacherValidateAction;
    const isStudentSession = auth?.userType === 'student' && !!auth?.userId;
    const proposerStudentId = await getTaskProposerStudentId(task.id);
    const isProposerAction =
      isStudentSession &&
      String(task.status || '') === 'proposed' &&
      !!proposerStudentId &&
      String(proposerStudentId) === String(auth.userId);

    if (!isTeacherPut && !isProposerAction) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    if (isTeacherValidateAction && !isTeacherManageAction) {
      const bodyKeys = Object.keys(req.body || {}).filter((k) =>
        Object.prototype.hasOwnProperty.call(req.body, k),
      );
      const disallowed = bodyKeys.filter((k) => k !== 'status');
      if (disallowed.length) {
        return res.status(403).json({
          error:
            'Ce profil ne peut modifier que la validation des tâches (bouton Validée ou POST /validate).',
        });
      }
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    if (isProposerAction) {
      const forbiddenForProposer = [
        'status',
        'project_id',
        'tutorial_ids',
        'referent_user_ids',
        'recurrence',
        'completion_mode',
      ];
      const attempted = forbiddenForProposer.find((key) =>
        Object.prototype.hasOwnProperty.call(req.body || {}, key),
      );
      if (attempted) {
        return res.status(403).json({ error: 'Champ non modifiable sur une proposition n3beur' });
      }
    }
    const {
      title,
      description,
      zone_id,
      marker_id,
      zone_ids,
      marker_ids,
      tutorial_ids,
      referent_user_ids,
      map_id,
      start_date,
      due_date,
      required_students,
      status,
      recurrence,
      project_id,
      group_id,
      completion_mode,
      danger_level,
      difficulty_level,
      importance_level,
      living_beings,
    } = req.body;

    // Aligné sur le POST (« Titre requis ») : un PUT ne doit pas pouvoir vider le titre.
    if (title !== undefined && !String(title ?? '').trim()) {
      return res.status(400).json({ error: 'Titre requis' });
    }

    let nextZoneIds;
    if (Object.prototype.hasOwnProperty.call(req.body, 'zone_ids')) {
      nextZoneIds = normalizeIdArray(zone_ids);
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'zone_id')) {
      nextZoneIds = zone_id ? [String(zone_id).trim()] : [];
    } else {
      nextZoneIds = await getTaskZoneIds(task.id);
    }

    let nextMarkerIds;
    if (Object.prototype.hasOwnProperty.call(req.body, 'marker_ids')) {
      nextMarkerIds = normalizeIdArray(marker_ids);
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'marker_id')) {
      nextMarkerIds = marker_id ? [String(marker_id).trim()] : [];
    } else {
      nextMarkerIds = await getTaskMarkerIds(task.id);
    }

    let explicitMap;
    if (Object.prototype.hasOwnProperty.call(req.body, 'map_id')) {
      explicitMap = map_id;
    } else {
      explicitMap = task.map_id;
    }

    const loc = await validateTaskLocations(nextZoneIds, nextMarkerIds, explicitMap);
    if (loc.error) return res.status(400).json({ error: loc.error });
    const nextProjectId =
      isTeacherManageAction && Object.prototype.hasOwnProperty.call(req.body, 'project_id')
        ? normalizeOptionalId(project_id)
        : task.project_id || null;
    const projectValidation = await validateTaskProject(nextProjectId, loc.mapId);
    if (projectValidation.error) return res.status(400).json({ error: projectValidation.error });
    const nextGroupId =
      isTeacherManageAction && Object.prototype.hasOwnProperty.call(req.body, 'group_id')
        ? normalizeOptionalId(group_id)
        : normalizeOptionalId(task.group_id);

    let nextTutorialIds;
    if (isTeacherManageAction && Object.prototype.hasOwnProperty.call(req.body, 'tutorial_ids')) {
      nextTutorialIds = normalizeTutorialIdArray(tutorial_ids);
    } else {
      nextTutorialIds = await getTaskTutorialIds(task.id);
    }
    const tutorialValidation = await validateTutorialIds(nextTutorialIds);
    if (tutorialValidation.error) return res.status(400).json({ error: tutorialValidation.error });

    let nextReferentIds;
    if (
      isTeacherManageAction &&
      Object.prototype.hasOwnProperty.call(req.body, 'referent_user_ids')
    ) {
      nextReferentIds = normalizeIdArray(referent_user_ids);
    } else {
      const refRows = await queryAll(
        'SELECT user_id FROM task_referents WHERE task_id = ? ORDER BY user_id',
        [task.id],
      );
      nextReferentIds = refRows.map((r) => String(r.user_id));
    }
    const referentValidation = await validateReferentUserIds(nextReferentIds);
    if (referentValidation.error) return res.status(400).json({ error: referentValidation.error });

    const reqStudents =
      required_students != null
        ? sanitizeRequiredStudents(required_students)
        : task.required_students;
    const teacherSetsStatus =
      (isTeacherManageAction || isTeacherValidateAction) &&
      Object.prototype.hasOwnProperty.call(req.body, 'status');
    let nextStatus = teacherSetsStatus
      ? normalizeImportTaskStatus(status)
      : normalizeTaskStatusForRead(task.status);
    if (!nextStatus) return res.status(400).json({ error: 'Statut invalide' });
    if (teacherSetsStatus) {
      const statusAuth = assertCanTeacherSetTaskStatus(auth, nextStatus);
      if (!statusAuth.ok) {
        return res.status(statusAuth.status).json({ error: statusAuth.error });
      }
    }
    const nextCompletionMode =
      isTeacherManageAction && Object.prototype.hasOwnProperty.call(req.body, 'completion_mode')
        ? normalizeTaskCompletionMode(completion_mode)
        : normalizeTaskCompletionMode(task.completion_mode) || 'single_done';
    if (!nextCompletionMode) return res.status(400).json({ error: 'Mode de validation invalide' });

    let nextDangerLevel;
    if (Object.prototype.hasOwnProperty.call(req.body, 'danger_level')) {
      const p = parseTaskDangerLevelFromClient(danger_level);
      if (p.error) return res.status(400).json({ error: p.error });
      nextDangerLevel = p.level;
    } else {
      nextDangerLevel = task.danger_level;
    }

    let nextDifficultyLevel;
    if (Object.prototype.hasOwnProperty.call(req.body, 'difficulty_level')) {
      const p = parseTaskDifficultyLevelFromClient(difficulty_level);
      if (p.error) return res.status(400).json({ error: p.error });
      nextDifficultyLevel = p.level;
    } else {
      nextDifficultyLevel = task.difficulty_level;
    }

    let nextImportanceLevel;
    if (Object.prototype.hasOwnProperty.call(req.body, 'importance_level')) {
      const p = parseTaskImportanceLevelFromClient(importance_level);
      if (p.error) return res.status(400).json({ error: p.error });
      nextImportanceLevel = p.level;
    } else {
      nextImportanceLevel = task.importance_level;
    }

    let nextRecurrence = task.recurrence || null;
    if (isTeacherManageAction && Object.prototype.hasOwnProperty.call(req.body, 'recurrence')) {
      const pRec = normalizeTaskRecurrenceInput(recurrence);
      if (pRec.error) return res.status(400).json({ error: pRec.error });
      nextRecurrence = pRec.value;
    }

    let nextStartDate = task.start_date || null;
    if (Object.prototype.hasOwnProperty.call(req.body, 'start_date')) {
      const pStart = normalizeTaskDateInput(start_date, 'Date de début');
      if (pStart.error) return res.status(400).json({ error: pStart.error });
      nextStartDate = pStart.value;
    }
    let nextDueDate = task.due_date || null;
    if (Object.prototype.hasOwnProperty.call(req.body, 'due_date')) {
      const pDue = normalizeTaskDateInput(due_date, "Date d'échéance");
      if (pDue.error) return res.status(400).json({ error: pDue.error });
      nextDueDate = pDue.value;
    }
    // Contrôle sur les valeurs EFFECTIVES : n'envoyer qu'une des deux dates ne doit pas
    // permettre d'inverser le couple déjà en base. Mais seulement si ce PUT touche aux
    // dates : une tâche héritée déjà incohérente (aucun contrôle avant ce lot) doit rester
    // modifiable sur ses autres champs, sinon elle devient impossible à corriger.
    const putTouchesDates =
      Object.prototype.hasOwnProperty.call(req.body, 'start_date') ||
      Object.prototype.hasOwnProperty.call(req.body, 'due_date');
    if (putTouchesDates) {
      const putRangeError = validateTaskDateRange(nextStartDate, nextDueDate);
      if (putRangeError) return res.status(400).json({ error: putRangeError.error });
    }

    const currentStatus = normalizeTaskStatusForRead(task.status);
    const becameValidated = nextStatus === 'validated' && currentStatus !== 'validated';
    const leftValidated = currentStatus === 'validated' && nextStatus !== 'validated';
    const currentZoneIds = await getTaskZoneIds(task.id);
    const currentMarkerIds = await getTaskMarkerIds(task.id);

    const zonesForSnapshot = nextZoneIds.length ? nextZoneIds : currentZoneIds;
    const markersForSnapshot = nextMarkerIds.length ? nextMarkerIds : currentMarkerIds;

    // Règle métier: une tâche validée ne doit pas être liée à des zones/repères.
    // Le snapshot des lieux est posé DANS la transaction ci-dessous.
    if (nextStatus === 'validated') {
      nextZoneIds = [];
      nextMarkerIds = [];
    } else if (leftValidated) {
      // Retour à un statut actif : la tâche retrouve les lieux que la validation lui avait
      // retirés. Sans cette reprise, elle redevenait « à faire » **sans lieu** — donc sans
      // pastille et invisible sur la carte, alors que rien à l'écran ne le laissait voir.
      // Des lieux explicitement soumis dans le même PUT restent prioritaires : c'est une
      // décision du professeur, pas un état hérité.
      const submitsLocations =
        Object.prototype.hasOwnProperty.call(req.body, 'zone_ids') ||
        Object.prototype.hasOwnProperty.call(req.body, 'zone_id') ||
        Object.prototype.hasOwnProperty.call(req.body, 'marker_ids') ||
        Object.prototype.hasOwnProperty.call(req.body, 'marker_id');
      if (!submitsLocations && !nextZoneIds.length && !nextMarkerIds.length) {
        const restored = await restoreDetachedLocations(task, explicitMap);
        nextZoneIds = restored.zoneIds;
        nextMarkerIds = restored.markerIds;
      }
    }
    // Il n'y a pas de quatrième cas : une tâche qui **reste** validée repasse par la branche
    // ci-dessus (ses lieux sont remis à vide), et celle qui cesse de l'être est traitée par la
    // reprise. Le refus « Impossible de lier une tâche validée à des zones ou repères » n'avait
    // plus de chemin pour se produire et a été retiré plutôt que laissé en garde morte.

    // Décodage de l'image AVANT toute écriture : un payload invalide doit répondre 400
    // sans avoir modifié la tâche.
    const bodyPut = req.body || {};
    const hasNewImage =
      Object.prototype.hasOwnProperty.call(bodyPut, 'imageData') &&
      bodyPut.imageData != null &&
      String(bodyPut.imageData).trim();
    let decodedImage = null;
    if (hasNewImage) {
      const dec = decodeTaskImageBuffer(bodyPut.imageData);
      if (dec.error) return res.status(400).json({ error: dec.error });
      decodedImage = dec;
    }
    const removeImage =
      !hasNewImage &&
      Object.prototype.hasOwnProperty.call(bodyPut, 'remove_task_image') &&
      bodyPut.remove_task_image === true;

    const nextSeriesId =
      nextRecurrence && !task.recurrence_series_id
        ? crypto.randomUUID()
        : task.recurrence_series_id || null;

    // Écritures atomiques (même garantie que le POST, audit §2.5) : UPDATE tasks + jointures
    // + colonnes legacy + espèces + image dans UNE transaction — un échec au milieu ne doit
    // pas laisser statut/map_id désynchronisés des jonctions.
    let obsoleteImagePath = null;
    await withTransaction(async (tx) => {
      if (becameValidated) {
        await persistDetachedLocationsSnapshot(task.id, zonesForSnapshot, markersForSnapshot, tx);
      }
      // Reprise en main du rythme : déplacer la date de départ d'une tâche récurrente
      // redéfinit l'ancre de sa série (migration 258). C'est la seule façon de déplacer le
      // rythme — le calendrier scolaire, lui, décale une occurrence sans jamais toucher à
      // l'ancre. Sans date de départ, l'ancre est effacée : elle sera reprise de la date de
      // création au prochain passage du job.
      const recurrenceAfterPut = String(nextRecurrence || '').trim();
      const startDateChanged = String(task.start_date || '') !== String(nextStartDate || '');
      if (recurrenceAfterPut && startDateChanged) {
        await tx.execute('UPDATE tasks SET recurrence_anchor_date = ? WHERE id = ?', [
          nextStartDate || null,
          task.id,
        ]);
      }
      await tx.execute(
        'UPDATE tasks SET title=?, description=?, map_id=?, project_id=?, group_id=?, zone_id=?, marker_id=?, start_date=?, due_date=?, required_students=?, status=?, completion_mode=?, danger_level=?, difficulty_level=?, importance_level=?, recurrence=?, recurrence_series_id=COALESCE(?, recurrence_series_id) WHERE id=?',
        [
          title ?? task.title,
          description ?? task.description,
          projectValidation.mapId,
          projectValidation.projectId,
          nextGroupId,
          nextZoneIds[0] || null,
          nextMarkerIds[0] || null,
          nextStartDate,
          nextDueDate,
          reqStudents,
          nextStatus,
          nextCompletionMode,
          nextDangerLevel,
          nextDifficultyLevel,
          nextImportanceLevel,
          nextRecurrence,
          nextSeriesId,
          task.id,
        ],
      );
      // Horodatage de validation (référence pour l'archivage automatique). Posé à chaque
      // entrée dans le statut `validated` (une revalidation rafraîchit la date).
      if (becameValidated) {
        await tx.execute('UPDATE tasks SET validated_at = NOW() WHERE id = ?', [task.id]);
      }
      if (
        isTeacherManageAction &&
        Object.prototype.hasOwnProperty.call(req.body, 'completion_mode') &&
        !Object.prototype.hasOwnProperty.call(req.body, 'status')
      ) {
        const recalculated = await recalculateTaskStatus(
          {
            id: task.id,
            status: nextStatus,
            completion_mode: nextCompletionMode,
          },
          tx,
        );
        nextStatus = recalculated?.status || nextStatus;
      }
      await setTaskZones(task.id, nextZoneIds, tx);
      await setTaskMarkers(task.id, nextMarkerIds, tx);
      await setTaskTutorials(task.id, nextTutorialIds, tx);
      await setTaskReferents(task.id, referentValidation.userIds, tx);
      if (
        Object.prototype.hasOwnProperty.call(req.body, 'living_beings') ||
        Object.prototype.hasOwnProperty.call(req.body, 'species_ids')
      ) {
        await syncTaskSpecies(tx, task.id, req.body.species_ids, living_beings);
      }
      await syncLegacyLocationColumns(task.id, nextZoneIds, nextMarkerIds, tx);

      if (decodedImage) {
        const oldPath = task.image_path || null;
        const rel = `tasks/${task.id}.${decodedImage.ext}`;
        try {
          await writeBufferToDisk(rel, decodedImage.buffer);
          await tx.execute('UPDATE tasks SET image_path = ? WHERE id = ?', [rel, task.id]);
          if (oldPath && oldPath !== rel) obsoleteImagePath = oldPath;
        } catch (imgErr) {
          try {
            deleteFile(rel);
          } catch (_) {
            /* ignore */
          }
          // Le rollback de la transaction annule l'UPDATE et les jointures.
          throw imgErr;
        }
      } else if (removeImage && task.image_path) {
        await tx.execute('UPDATE tasks SET image_path = NULL WHERE id = ?', [task.id]);
        obsoleteImagePath = task.image_path;
      }
    });
    // Suppression du fichier obsolète APRÈS commit : un rollback ne doit pas perdre l'image.
    if (obsoleteImagePath) {
      try {
        deleteFile(obsoleteImagePath);
      } catch (_) {
        /* ignore */
      }
    }

    const updated = await getTaskWithAssignments(task.id);
    logAudit('update_task', 'task', task.id, updated.title, {
      req,
      actorUserType: isProposerAction ? 'student' : undefined,
      actorUserId: isProposerAction ? String(auth.userId) : undefined,
      payload: {
        status: updated.status,
        completion_mode: updated.completion_mode,
        required_students: updated.required_students,
        project_id: updated.project_id || null,
        proposer_edit: isProposerAction,
      },
    });
    emitTasksChanged({
      reason: 'update_task',
      taskId: task.id,
      projectId: projectValidation.projectId || null,
      mapId: resolveTaskMapId(updated),
    });
    await syncTaskProjectCompletionForProjects([previousProjectId, projectValidation.projectId]);
    if (becameValidated) {
      await syncProgressionForValidatedTask(task.id);
    }
    res.json(updated);
  } catch (e) {
    let exposeDetail = false;
    try {
      const authCatch = await parseOptionalAuth(req);
      exposeDetail =
        String(process.env.FORETMAP_DEBUG_TASK_PUT_CLIENT || '').trim() === '1' &&
        canManageTasks(authCatch);
    } catch (_) {
      /* ignore */
    }
    return respondInternalError(res, req, e, 'Erreur serveur', { exposeDetail });
  }
});

router.delete(
  '/:id',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.image_path) deleteFile(task.image_path);
    // Suppression atomique : sans transaction, un échec entre deux DELETE laissait une tâche
    // amputée de ses logs/assignations (les écritures composées de ce fichier — POST/PUT/validate —
    // sont déjà transactionnelles).
    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM task_logs WHERE task_id = ?', [req.params.id]);
      await tx.execute('DELETE FROM task_assignments WHERE task_id = ?', [req.params.id]);
      await tx.execute('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    });
    logAudit('delete_task', 'task', req.params.id, task.title, { req });
    emitTasksChanged({
      reason: 'delete_task',
      taskId: req.params.id,
      mapId: resolveTaskMapId(task),
    });
    const delProjectId =
      task.project_id != null && String(task.project_id).trim()
        ? String(task.project_id).trim()
        : null;
    await syncTaskProjectCompletionForProjects([delProjectId]);
    res.json({ success: true });
  }),
);

// Archivage (soft-delete) : masque la tâche des listes actives sans la supprimer.
// L'archivage est réversible (POST /:id/unarchive) et n'altère ni le statut ni les
// données liées (assignations, logs, zones). Réservé à la gestion (tasks.manage).
async function setTaskArchivedState(req, res, { archive }) {
  const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  const alreadyArchived = task.archived_at != null;
  if (archive === alreadyArchived) {
    // Idempotent : renvoyer l'état courant sans réécrire ni ré-émettre.
    return res.json(await getTaskWithAssignments(task.id));
  }
  if (archive) {
    // Archivage manuel : marqueur cascade à 0 (ne sera pas restauré par le désarchivage
    // d'un projet — seul un désarchivage individuel le rétablit).
    await execute('UPDATE tasks SET archived_at = NOW(), archived_via_project = 0 WHERE id = ?', [
      req.params.id,
    ]);
  } else {
    await execute('UPDATE tasks SET archived_at = NULL, archived_via_project = 0 WHERE id = ?', [
      req.params.id,
    ]);
  }
  const projectId =
    task.project_id != null && String(task.project_id).trim()
      ? String(task.project_id).trim()
      : null;
  logAudit(archive ? 'archive_task' : 'unarchive_task', 'task', req.params.id, task.title, { req });
  emitTasksChanged({
    reason: archive ? 'archive_task' : 'unarchive_task',
    taskId: req.params.id,
    projectId,
    mapId: resolveTaskMapId(task),
  });
  // Une tâche archivée ne compte plus dans la complétion du projet (et inversement).
  await syncTaskProjectCompletionForProjects([projectId]);
  res.json(await getTaskWithAssignments(task.id));
}

router.post(
  '/:id/archive',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => setTaskArchivedState(req, res, { archive: true })),
);

router.post(
  '/:id/unarchive',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => setTaskArchivedState(req, res, { archive: false })),
);

router.post(
  '/:id/validate',
  requirePermission('tasks.validate'),
  asyncHandler(async (req, res) => {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.archived_at != null) {
      return res.status(409).json({ error: 'Désarchivez la tâche avant de la valider' });
    }
    const currentStatus = normalizeTaskStatusForRead(task.status);
    if (currentStatus === 'validated') {
      return res.status(400).json({ error: 'Tâche déjà validée' });
    }
    const zonesBeforeValidate = await getTaskZoneIds(task.id);
    const markersBeforeValidate = await getTaskMarkerIds(task.id);
    // Écritures atomiques : snapshot récurrence + détachement zones/repères + statut
    // dans UNE transaction — un échec au milieu ne doit pas laisser une tâche
    // « validée » encore liée, ni détachée sans être validée.
    await withTransaction(async (tx) => {
      await persistDetachedLocationsSnapshot(
        task.id,
        zonesBeforeValidate,
        markersBeforeValidate,
        tx,
      );
      // Comme PUT avec statut validated : une tâche validée ne reste pas liée à des zones/repères.
      await setTaskZones(task.id, [], tx);
      await setTaskMarkers(task.id, [], tx);
      await syncLegacyLocationColumns(task.id, [], [], tx);
      await tx.execute("UPDATE tasks SET status = 'validated', validated_at = NOW() WHERE id = ?", [
        req.params.id,
      ]);
    });
    logAudit('validate_task', 'task', req.params.id, task.title, { req });
    await syncProgressionForValidatedTask(task.id);
    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'validate', taskId: task.id, mapId: resolveTaskMapId(updated) });
    await syncTaskProjectCompletionForProjects([task.project_id]);
    res.json(updated);
  }),
);

// O10 — sous-domaine propositions de tâches (POST /proposals par les n3beurs) extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./tasks/proposals'));
// O10 — sous-domaine assignations (assign / assign-group / done / unassign) extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./tasks/assignments'));
// O10 — sous-domaine import de tâches/projets extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./tasks/import'));
// O10 — sous-domaine logs de tâches extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./tasks/logs'));
// O10 — sous-domaine média de tâche (service d'image de couverture, GET /:id/image) extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./tasks/media'));

module.exports = router;
