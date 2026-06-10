const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const {
  requirePermission,
  hasPermission,
  JWT_SECRET,
  hydrateAuthFromTokenClaims,
} = require('../middleware/requireTeacher');
const { saveBase64ToDisk, getAbsolutePath, deleteFile, writeBufferToDisk } = require('../lib/uploads');
const { logRouteError } = require('../lib/routeLog');
const asyncHandler = require('../lib/asyncHandler');
const logger = require('../lib/logger');
const { logAudit } = require('./audit');
const { emitTasksChanged } = require('../lib/realtime');
const { syncTaskProjectCompletionForProjects } = require('../lib/syncTaskProjectCompletion');
const {
  ensurePrimaryRole,
  buildAuthzPayload,
  verifyRolePin,
  syncStudentPrimaryRoleFromProgress,
  syncProgressionForValidatedTask,
} = require('../lib/rbac');
const {
  countStudentActiveTaskAssignments,
  getEffectiveMaxActiveTaskAssignments,
} = require('../lib/studentTaskEnrollment');
const {
  normalizeTaskStatusForRead,
  normalizeTaskCompletionMode,
  recalculateTaskStatusWithConn,
} = require('../lib/taskStatusRecalc');
const {
  getScopedStudentIds,
  canAccessStudentId,
  getUserAccessibleGroupIds,
} = require('../lib/groupScope');
const {
  buildImportTemplateXlsxBuffer,
  buildImportTemplateCsvString,
  executeTasksProjectsImport,
  normalizeImportTaskStatus,
} = require('../lib/tasks/taskImport');
const { parseOptionalForetAuth } = require('../lib/auth/jwtPipeline');

const router = express.Router();
const MAX_TASK_REFERENTS = 15;

const ALLOWED_TASK_STATUSES = new Set(['available', 'in_progress', 'done', 'validated', 'proposed', 'on_hold']);
const ALLOWED_TASK_DANGER_LEVELS = new Set(['safe', 'potential_danger', 'dangerous', 'very_dangerous']);
const ALLOWED_TASK_DIFFICULTY_LEVELS = new Set(['easy', 'medium', 'hard', 'very_hard']);
const ALLOWED_TASK_IMPORTANCE_LEVELS = new Set(['not_important', 'low', 'medium', 'high', 'absolute']);

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeOptionalString(value) {
  const s = asTrimmedString(value);
  return s ? s : null;
}

function resolveTaskMapId(task) {
  if (!task) return null;
  return task.map_id_resolved || task.map_id || task.zone_map_id || task.marker_map_id || task.project_map_id || null;
}

/** Entrée client : absent / vide / null → non renseigné (null SQL) ; valeur invalide → { error }. */
function parseTaskDangerLevelFromClient(value) {
  if (value === undefined || value === null) return { level: null };
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return { level: null };
  if (ALLOWED_TASK_DANGER_LEVELS.has(raw)) return { level: raw };
  return { error: 'Niveau de danger invalide' };
}

function parseTaskDifficultyLevelFromClient(value) {
  if (value === undefined || value === null) return { level: null };
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return { level: null };
  if (ALLOWED_TASK_DIFFICULTY_LEVELS.has(raw)) return { level: raw };
  return { error: 'Niveau de difficulté invalide' };
}

function parseTaskImportanceLevelFromClient(value) {
  if (value === undefined || value === null) return { level: null };
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return { level: null };
  if (ALLOWED_TASK_IMPORTANCE_LEVELS.has(raw)) return { level: raw };
  return { error: "Degré d'importance invalide" };
}

/** Valeur BDD → clé API ou null (jamais de défaut implicite). */
function taskDangerLevelForResponse(value) {
  if (value == null) return null;
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  return ALLOWED_TASK_DANGER_LEVELS.has(raw) ? raw : null;
}

function taskDifficultyLevelForResponse(value) {
  if (value == null) return null;
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  return ALLOWED_TASK_DIFFICULTY_LEVELS.has(raw) ? raw : null;
}

function taskImportanceLevelForResponse(value) {
  if (value == null) return null;
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  return ALLOWED_TASK_IMPORTANCE_LEVELS.has(raw) ? raw : null;
}

/** Liste de noms d’êtres vivants (catalogue biodiversité), comme zones/repères. */
function normalizeTaskLivingBeingsInput(input, fallback = '') {
  const base = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? (() => {
        try {
          const parsed = JSON.parse(input);
          if (Array.isArray(parsed)) return parsed;
        } catch (_) {
          /* ignore */
        }
        return input.split(',');
      })()
      : [];
  const cleaned = [...new Set(base.map((v) => String(v || '').trim()).filter(Boolean))];
  if (cleaned.length === 0 && fallback && String(fallback).trim()) return [String(fallback).trim()];
  return cleaned;
}

function serializeTaskLivingBeingsForDb(input) {
  const arr = normalizeTaskLivingBeingsInput(input, '');
  return arr.length ? JSON.stringify(arr) : null;
}

function attachTaskLivingBeingsApiFields(task) {
  if (!task) return;
  task.living_beings_list = normalizeTaskLivingBeingsInput(task.living_beings, '');
  delete task.living_beings;
}

const MAX_TASK_IMAGE_BYTES = 4 * 1024 * 1024;

function taskImageExtensionFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Décode une data URL / base64 image tâche ; vérifie taille et signature (JPEG, PNG, WebP). */
function decodeTaskImageBuffer(imageData) {
  if (imageData == null) return { error: 'Image requise' };
  const str = String(imageData);
  const raw = str.includes(',') ? str.split(',')[1] : str;
  if (!raw || !String(raw).trim()) return { error: 'Image requise' };
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch (_) {
    return { error: 'Image invalide' };
  }
  if (!buf.length) return { error: 'Image invalide' };
  if (buf.length > MAX_TASK_IMAGE_BYTES) {
    return { error: 'Image trop volumineuse (max 4 Mo après décodage)' };
  }
  const ext = taskImageExtensionFromBuffer(buf);
  if (!ext) return { error: 'Format image non supporté (JPEG, PNG ou WebP)' };
  return { buffer: buf, ext };
}

const { isSafePublicTaskImageRelativePath } = require('../lib/uploadsPublicUrls');

function attachTaskImagePublicFields(task) {
  if (!task || task.id == null) return;
  const raw = task.task_cover_image_path ?? task.image_path;
  const rel = raw != null ? String(raw).trim() : '';
  if (rel && isSafePublicTaskImageRelativePath(rel)) {
    // Même origine que les avatars / photos zones : pas de passage par /api/* (rate limit, JSON d’erreur).
    task.image_url = `/uploads/${rel}`;
  } else if (rel) {
    task.image_url = `/api/tasks/${encodeURIComponent(task.id)}/image`;
  } else {
    task.image_url = null;
  }
  delete task.image_path;
  delete task.task_cover_image_path;
}

function countDoneAssignments(assignments = []) {
  if (!Array.isArray(assignments)) return 0;
  return assignments.reduce((count, assignment) => {
    if (assignment?.done_at) return count + 1;
    return count;
  }, 0);
}

async function recalculateTaskStatus(taskLike) {
  return recalculateTaskStatusWithConn({ queryOne, execute }, taskLike);
}

function normalizeDateOnly(value) {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function currentLocalDateOnly() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isTaskBeforeStartDate(task) {
  const status = normalizeTaskStatusForRead(task?.status);
  if (status === 'done' || status === 'validated' || status === 'proposed') return false;
  const startDate = normalizeDateOnly(task?.start_date);
  if (!startDate) return false;
  return startDate > currentLocalDateOnly();
}

async function parseOptionalAuth(req) {
  return parseOptionalForetAuth(req, { jwtSecret: JWT_SECRET, hydrateAuthFromTokenClaims });
}

function canReadAllAssignments(auth) {
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  return perms.includes('tasks.manage')
    || perms.includes('tasks.validate')
    || perms.includes('stats.read.all')
    || perms.includes('stats.read.group');
}

function canManageTasks(auth) {
  return hasPermission(auth, 'tasks.manage', true);
}

function canValidateTasks(auth) {
  return hasPermission(auth, 'tasks.validate', true);
}

/**
 * Contrôle changement de statut tâche (PUT ou logique partagée avec POST validate).
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
function assertCanTeacherSetTaskStatus(auth, targetStatus) {
  const status = normalizeTaskStatusForRead(targetStatus);
  if (!status) {
    return { ok: false, status: 400, error: 'Statut invalide' };
  }
  if (status === 'validated') {
    if (canValidateTasks(auth)) return { ok: true };
    const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
    const elev = Array.isArray(auth?.elevatedPermissions) ? auth.elevatedPermissions : [];
    if (elev.includes('tasks.validate') && !perms.includes('tasks.validate')) {
      return { ok: false, status: 403, error: 'Élévation PIN requise' };
    }
    return { ok: false, status: 403, error: 'Permission insuffisante' };
  }
  if (canManageTasks(auth)) return { ok: true };
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  const elev = Array.isArray(auth?.elevatedPermissions) ? auth.elevatedPermissions : [];
  if (elev.includes('tasks.manage') && !perms.includes('tasks.manage')) {
    return { ok: false, status: 403, error: 'Élévation PIN requise' };
  }
  return { ok: false, status: 403, error: 'Permission insuffisante' };
}

/** Actions « pour le compte d’un n3beur » (assign / done / unassign) : aligné sur la lecture des assignations (GET liste). */
function canRunTeacherStyleTaskStudentAction(auth) {
  if (!auth) return false;
  if (canManageTasks(auth)) return true;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes('tasks.validate');
}

function isVisitorRole(auth) {
  return String(auth?.roleSlug || '').toLowerCase() === 'visiteur';
}

function sanitizeRequiredStudents(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function normalizeIdArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((x) => (x != null ? String(x).trim() : '')).filter(Boolean))];
}

function normalizeTutorialIdArray(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function normalizeOptionalId(value) {
  if (value == null) return null;
  const v = String(value).trim();
  return v || null;
}

function sameIdSet(a = [], b = []) {
  if (a.length !== b.length) return false;
  const left = new Set(a.map((id) => String(id || '').trim()).filter(Boolean));
  const right = new Set(b.map((id) => String(id || '').trim()).filter(Boolean));
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

async function mapExists(mapId) {
  if (!mapId) return false;
  const row = await queryOne('SELECT id FROM maps WHERE id = ?', [mapId]);
  return !!row;
}

async function getZone(zoneId) {
  if (!zoneId) return null;
  return queryOne('SELECT id, map_id, name FROM zones WHERE id = ?', [zoneId]);
}

async function getMarker(markerId) {
  if (!markerId) return null;
  return queryOne('SELECT id, map_id, label FROM map_markers WHERE id = ?', [markerId]);
}

async function getTaskProject(projectId) {
  if (!projectId) return null;
  return queryOne(
    'SELECT id, map_id, title, status FROM task_projects WHERE id = ?',
    [projectId]
  );
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
  const rows = await queryAll('SELECT zone_id FROM task_zones WHERE task_id = ? ORDER BY zone_id', [taskId]);
  return rows.map((r) => r.zone_id);
}

async function getTaskMarkerIds(taskId) {
  const rows = await queryAll('SELECT marker_id FROM task_markers WHERE task_id = ? ORDER BY marker_id', [taskId]);
  return rows.map((r) => r.marker_id);
}

/** Récurrences pour lesquelles on conserve un snapshot zones/repères à la validation (job récurrence). */
const RECURRENCE_WITH_TEMPLATE_LOCS = new Set(['weekly', 'biweekly', 'monthly']);

let recurrenceTemplateColumnsReady = null;

async function hasRecurrenceTemplateColumns() {
  if (recurrenceTemplateColumnsReady !== null) return recurrenceTemplateColumnsReady;
  try {
    const row = await queryOne(
      `SELECT COUNT(*) AS c
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'tasks'
          AND COLUMN_NAME = 'recurrence_template_zone_ids'`
    );
    recurrenceTemplateColumnsReady = Number(row?.c) > 0;
  } catch (err) {
    logger.warn({ err }, 'Vérification colonnes recurrence_template_* en échec');
    recurrenceTemplateColumnsReady = false;
  }
  return recurrenceTemplateColumnsReady;
}

async function persistRecurringTemplateLocations(taskId, recurrenceRaw, zoneIds, markerIds) {
  const r = String(recurrenceRaw || '').trim().toLowerCase();
  if (!r || !RECURRENCE_WITH_TEMPLATE_LOCS.has(r)) return;
  if (!(await hasRecurrenceTemplateColumns())) {
    logger.warn(
      { taskId, recurrence: r },
      'Colonnes recurrence_template_* absentes — snapshot récurrence ignoré (migration 051 ?)'
    );
    return;
  }
  const z = Array.isArray(zoneIds) ? zoneIds : [];
  const m = Array.isArray(markerIds) ? markerIds : [];
  try {
    await execute(
      'UPDATE tasks SET recurrence_template_zone_ids = ?, recurrence_template_marker_ids = ? WHERE id = ?',
      [JSON.stringify(z), JSON.stringify(m), taskId]
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
  const rows = await queryAll('SELECT tutorial_id FROM task_tutorials WHERE task_id = ? ORDER BY tutorial_id', [taskId]);
  return rows.map((r) => Number(r.tutorial_id));
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
      [taskId]
    );
    return row?.student_id ? String(row.student_id) : null;
  } catch (err) {
    logger.warn({ err, taskId }, 'Lecture proposeur (audit_log) en échec — poursuite sans métadonnée');
    return null;
  }
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
      taskIds
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
    logger.warn({ err, taskCount: taskIds.length }, 'Liste proposeurs (audit_log) en échec — tâches renvoyées sans proposed_by');
    return new Map();
  }
}

/** Assignations pour GET /api/tasks (liste), selon le rôle. */
async function fetchTaskListAssignments(auth, taskIds) {
  if (!taskIds.length) return [];
  if (canReadAllAssignments(auth)) {
    const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
    const hasGlobalRead =
      perms.includes('stats.read.all') || perms.includes('tasks.manage') || perms.includes('tasks.validate');
    const ph = taskIds.map(() => '?').join(',');
    if (hasGlobalRead) {
      return queryAll(`SELECT * FROM task_assignments WHERE task_id IN (${ph})`, taskIds);
    }
    const scope = await getScopedStudentIds(auth);
    if (!scope.studentIds.length) return [];
    const sph = scope.studentIds.map(() => '?').join(',');
    return queryAll(
      `SELECT * FROM task_assignments
        WHERE task_id IN (${ph})
          AND student_id IN (${sph})`,
      [...taskIds, ...scope.studentIds]
    );
  }
  if (auth?.userType === 'student' && auth?.userId) {
    const ph = taskIds.map(() => '?').join(',');
    if (isVisitorRole(auth)) {
      return queryAll(
        `SELECT * FROM task_assignments WHERE task_id IN (${ph}) AND student_id = ?`,
        [...taskIds, auth.userId]
      );
    }
    return queryAll(
      `SELECT id, task_id, student_first_name, student_last_name, done_at, assigned_at
         FROM task_assignments
        WHERE task_id IN (${ph})
        ORDER BY assigned_at`,
      taskIds
    );
  }
  return [];
}

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
    groupIds
  );
  return rows.map((r) => String(r.user_id));
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
    taskIds
  );
}

/**
 * Remplace les lignes de jointure d'une tache (DELETE puis re-INSERT) en UNE seule requete
 * multi-valeurs au lieu d'une boucle N+1. `table`/`column` sont des litteraux codes en dur
 * (jamais de l'entree client) ; les valeurs passent en parametres `?`.
 */
async function replaceTaskJoinRows(table, column, taskId, ids) {
  await execute(`DELETE FROM ${table} WHERE task_id = ?`, [taskId]);
  const list = Array.isArray(ids) ? ids : [];
  if (list.length === 0) return;
  const placeholders = list.map(() => '(?, ?)').join(', ');
  const params = [];
  for (const id of list) params.push(taskId, id);
  await execute(`INSERT INTO ${table} (task_id, ${column}) VALUES ${placeholders}`, params);
}

async function setTaskZones(taskId, zoneIds) {
  return replaceTaskJoinRows('task_zones', 'zone_id', taskId, zoneIds);
}

async function setTaskMarkers(taskId, markerIds) {
  return replaceTaskJoinRows('task_markers', 'marker_id', taskId, markerIds);
}

async function setTaskTutorials(taskId, tutorialIds) {
  return replaceTaskJoinRows('task_tutorials', 'tutorial_id', taskId, tutorialIds);
}

async function setTaskReferents(taskId, userIds) {
  return replaceTaskJoinRows('task_referents', 'user_id', taskId, userIds);
}

function referentPublicLabel(row) {
  const dn = String(row?.display_name || '').trim();
  if (dn) return dn;
  const fn = String(row?.first_name || '').trim();
  const ln = String(row?.last_name || '').trim();
  const full = `${fn} ${ln}`.trim();
  return full || String(row?.uid || row?.id || '').trim() || 'Utilisateur';
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
    userIds
  );
  const existing = new Map(rows.map((r) => [String(r.id), r.user_type]));
  for (const uid of userIds) {
    if (!existing.has(String(uid))) return { error: 'Référent introuvable ou compte inactif' };
  }
  return { userIds };
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
    taskIds
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

async function validateTutorialIds(tutorialIds) {
  if (!tutorialIds.length) return { tutorialIds };
  const placeholders = tutorialIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT id FROM tutorials WHERE id IN (${placeholders}) AND is_active = 1`,
    tutorialIds
  );
  const existing = new Set(rows.map((r) => Number(r.id)));
  for (const tid of tutorialIds) {
    if (!existing.has(Number(tid))) return { error: 'Tutoriel introuvable' };
  }
  return { tutorialIds };
}

async function syncLegacyLocationColumns(taskId, zoneIds, markerIds) {
  await execute('UPDATE tasks SET zone_id = ?, marker_id = ? WHERE id = ?', [
    zoneIds[0] || null,
    markerIds[0] || null,
    taskId,
  ]);
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
    taskIds
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
    taskIds
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
    taskIds
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

function enrichTaskRow(task, zonesLinked, markersLinked, tutorialsLinked, referentsLinked) {
  const zl = zonesLinked || [];
  const ml = markersLinked || [];
  const tl = tutorialsLinked || [];
  const rl = referentsLinked || [];
  const prevZoneName = task.zone_name;
  const prevMarkerLabel = task.marker_label;
  task.zone_ids = zl.map((z) => z.id);
  task.marker_ids = ml.map((x) => x.id);
  task.tutorial_ids = tl.map((x) => Number(x.id));
  task.zones_linked = zl.map((z) => ({ id: z.id, name: z.name }));
  task.markers_linked = ml.map((x) => ({ id: x.id, label: x.label }));
  task.tutorials_linked = tl.map((x) => ({
    id: Number(x.id),
    title: x.title,
    slug: x.slug,
    type: x.type,
    source_url: x.source_url || null,
    source_file_path: x.source_file_path || null,
  }));
  task.referent_user_ids = rl.map((x) => String(x.id));
  task.referents_linked = rl.map((x) => ({
    id: String(x.id),
    user_type: x.user_type,
    label: referentPublicLabel(x),
    role_slug: x.role_slug || null,
  }));
  const mapsFromLinks = [
    ...new Set([...zl.map((z) => z.map_id), ...ml.map((x) => x.map_id)].filter(Boolean)),
  ];
  if (mapsFromLinks.length === 1) {
    task.map_id_resolved = mapsFromLinks[0];
  } else if (mapsFromLinks.length === 0) {
    task.map_id_resolved = task.map_id || null;
  } else {
    task.map_id_resolved = mapsFromLinks[0];
  }
  task.zone_map_id = zl[0]?.map_id ?? task.zone_map_id ?? null;
  task.marker_map_id = ml[0]?.map_id ?? task.marker_map_id ?? null;
  task.zone_name = zl[0]?.name ?? prevZoneName ?? null;
  task.marker_label = ml[0]?.label ?? prevMarkerLabel ?? null;
}

/**
 * Valide les listes de zones/repères, vérifie une carte unique, retourne mapId résolu ou erreur.
 */
async function validateTaskLocations(zoneIds, markerIds, explicitMapId) {
  const mapIds = new Set();
  for (const zid of zoneIds) {
    const zone = await getZone(zid);
    if (!zone) return { error: 'Zone introuvable' };
    mapIds.add(zone.map_id);
  }
  for (const mid of markerIds) {
    const marker = await getMarker(mid);
    if (!marker) return { error: 'Repère introuvable' };
    mapIds.add(marker.map_id);
  }
  const uniqueMaps = [...mapIds].filter(Boolean);
  if (uniqueMaps.length > 1) {
    return { error: 'Les zones et repères choisis doivent appartenir à la même carte' };
  }
  let resolvedMapId = uniqueMaps[0] || null;
  if (explicitMapId != null && String(explicitMapId).trim() !== '') {
    const asked = String(explicitMapId).trim();
    if (!(await mapExists(asked))) return { error: 'Carte introuvable' };
    if (resolvedMapId && resolvedMapId !== asked) {
      return { error: 'Incohérence entre la carte et les zones/repères' };
    }
    resolvedMapId = asked;
  } else if (!resolvedMapId && explicitMapId != null && String(explicitMapId).trim() === '') {
    resolvedMapId = null;
  } else if (!resolvedMapId && zoneIds.length + markerIds.length === 0) {
    if (explicitMapId != null && String(explicitMapId).trim() !== '') {
      const asked = String(explicitMapId).trim();
      if (!(await mapExists(asked))) return { error: 'Carte introuvable' };
      resolvedMapId = asked;
    }
  }
  return { zoneIds, markerIds, mapId: resolvedMapId };
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
    [taskId]
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
  task.assignments = await queryAll('SELECT * FROM task_assignments WHERE task_id = ? ORDER BY assigned_at', [taskId]);
  task.assigned_count = Array.isArray(task.assignments) ? task.assignments.length : 0;
  task.assignees_total_count = task.assigned_count;
  task.assignees_done_count = countDoneAssignments(task.assignments);
  task.proposed_by_student_id = await getTaskProposerStudentId(taskId);
  attachTaskLivingBeingsApiFields(task);
  attachTaskImagePublicFields(task);
  return task;
}

async function ensureStudentPermission({ studentId, permissionKey, profilePin }) {
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

function respondInternalError(res, req, err, message = 'Erreur serveur', opts = {}) {
  logRouteError(err, req);
  const body = { error: message };
  if (opts.exposeDetail && err) {
    body.debugDetail = String(err.message || '');
    if (err.code != null) body.debugCode = String(err.code);
  }
  return res.status(500).json(body);
}

function trimName(value) {
  return String(value || '').trim();
}

async function resolveStudentActionContext(req, payload = {}, permissionKey) {
  const auth = await parseOptionalAuth(req);
  const profilePin = payload?.profilePin;
  const providedStudentId = normalizeOptionalId(payload?.studentId);
  const providedFirstName = trimName(payload?.firstName);
  const providedLastName = trimName(payload?.lastName);
  const isTeacherAction = canRunTeacherStyleTaskStudentAction(auth);

  const byId = async (studentId) => queryOne(
    "SELECT id, first_name, last_name FROM users WHERE user_type = 'student' AND id = ? LIMIT 1",
    [studentId]
  );

  const pickNames = (student) => ({
    firstName: providedFirstName || trimName(student?.first_name),
    lastName: providedLastName || trimName(student?.last_name),
  });

  if (providedStudentId) {
    const student = await byId(providedStudentId);
    if (!student) return { errorStatus: 401, error: 'Compte supprimé', deleted: true };
    if (!isTeacherAction) {
      if (!(auth?.userType === 'student' && String(auth?.userId || '') === String(providedStudentId))) {
        return { errorStatus: 403, error: 'Session n3beur requise' };
      }
      const permission = await ensureStudentPermission({ studentId: providedStudentId, permissionKey, profilePin });
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
    const permission = await ensureStudentPermission({ studentId: auth.userId, permissionKey, profilePin });
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
    return { errorStatus: 400, error: 'Identifiant n3beur requis (studentId obligatoire pour une action prof)' };
  }

  return { errorStatus: 400, error: 'Identifiant n3beur requis' };
}

router.get('/', async (req, res) => {
  try {
    const auth = await parseOptionalAuth(req);
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    const projectId = req.query.project_id ? String(req.query.project_id).trim() : '';
    const groupId = req.query.group_id ? String(req.query.group_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    if (projectId && !(await getTaskProject(projectId))) {
      return res.status(400).json({ error: 'Projet introuvable' });
    }
    const sqlBase = `
      SELECT t.*, z.name AS zone_name, z.map_id AS zone_map_id,
             mkr.label AS marker_label, mkr.map_id AS marker_map_id,
             tp.map_id AS project_map_id, tp.title AS project_title, tp.status AS project_status,
             m.id AS map_id_resolved_join, m.label AS map_label,
             t.image_path AS task_cover_image_path
        FROM tasks t
        LEFT JOIN zones z ON t.zone_id = z.id
        LEFT JOIN map_markers mkr ON t.marker_id = mkr.id
        LEFT JOIN task_projects tp ON tp.id = t.project_id
        LEFT JOIN maps m ON m.id = COALESCE(t.map_id, z.map_id, mkr.map_id)
    `;
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
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderSql = `ORDER BY
      CASE WHEN COALESCE(t.sort_order, 0) > 0 THEN 0 ELSE 1 END ASC,
      CASE WHEN COALESCE(t.sort_order, 0) > 0 THEN t.sort_order ELSE NULL END ASC,
      CASE WHEN COALESCE(NULLIF(TRIM(t.importance_level), ''), '') = '' THEN 1 ELSE 0 END ASC,
      CASE LOWER(TRIM(t.importance_level))
        WHEN 'absolute' THEN 5
        WHEN 'high' THEN 4
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 2
        WHEN 'not_important' THEN 1
        ELSE 0
      END DESC,
      t.due_date ASC`;
    const tasks = await queryAll(`${sqlBase} ${whereSql} ${orderSql}`, params);
    const taskIds = tasks.map((t) => t.id);
    const proposedTaskIds = tasks
      .filter((t) => normalizeTaskStatusForRead(t?.status) === 'proposed')
      .map((t) => t.id);
    const [zm, mm, tutorialsMap, referentsMap, proposerByTask, assignments, countRows] = await Promise.all([
      fetchZonesForTasks(taskIds),
      fetchMarkersForTasks(taskIds),
      fetchTutorialsForTasks(taskIds),
      fetchReferentsForTasks(taskIds),
      fetchTaskProposerMap(proposedTaskIds),
      fetchTaskListAssignments(auth, taskIds),
      fetchTaskAssignmentAggregates(taskIds),
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
      enrichTaskRow(row, zm.get(t.id), mm.get(t.id), tutorialsMap.get(t.id), referentsMap.get(t.id));
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
      attachTaskLivingBeingsApiFields(row);
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
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/reorder-project', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const projectId = normalizeOptionalId(req.body?.project_id);
    const orderedTaskIdsInput = normalizeIdArray(req.body?.task_ids);
    if (!projectId) return res.status(400).json({ error: 'Projet requis' });
    if (!orderedTaskIdsInput.length) return res.status(400).json({ error: 'Liste de tâches requise' });
    const project = await getTaskProject(projectId);
    if (!project) return res.status(404).json({ error: 'Projet introuvable' });

    const mapId = project.map_id || null;
    const projectTasks = await queryAll(
      `SELECT id, sort_order, importance_level, due_date
         FROM tasks
        WHERE project_id = ?
        ORDER BY
          CASE WHEN COALESCE(sort_order, 0) > 0 THEN 0 ELSE 1 END ASC,
          CASE WHEN COALESCE(sort_order, 0) > 0 THEN sort_order ELSE NULL END ASC,
          CASE WHEN COALESCE(NULLIF(TRIM(importance_level), ''), '') = '' THEN 1 ELSE 0 END ASC,
          CASE LOWER(TRIM(importance_level))
            WHEN 'absolute' THEN 5
            WHEN 'high' THEN 4
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 2
            WHEN 'not_important' THEN 1
            ELSE 0
          END DESC,
          due_date ASC,
          id ASC`,
      [projectId]
    );
    if (!projectTasks.length) return res.status(400).json({ error: 'Ce projet ne contient aucune tâche à ordonner' });

    const knownIds = new Set(projectTasks.map((row) => String(row.id)));
    const orderedTaskIds = [];
    const seen = new Set();
    for (const tid of orderedTaskIdsInput) {
      const normalized = String(tid || '').trim();
      if (!normalized || seen.has(normalized)) continue;
      if (!knownIds.has(normalized)) {
        return res.status(400).json({ error: 'La liste contient une tâche qui n’appartient pas au projet cible' });
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
        await tx.execute('UPDATE tasks SET sort_order = ? WHERE id = ?', [idx + 1, orderedTaskIds[idx]]);
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
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.get('/referent-candidates', requirePermission('tasks.manage', { needsElevation: true }), asyncHandler(async (req, res) => {
  const [scopedStudentIds, scopedTeacherIds] = await Promise.all([
    getScopedAssignableStudentIds(req.auth),
    getScopedTeacherIds(req.auth),
  ]);
  const rows = await queryAll(
    `SELECT u.id, u.user_type, u.first_name, u.last_name, u.display_name, r.slug AS primary_role_slug
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.user_type = u.user_type AND ur.is_primary = 1
       LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.is_active = 1 AND u.user_type IN ('teacher', 'student')`
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
  const students = rows.filter((r) => {
    if (r.user_type !== 'student') return false;
    if (scopedStudentIds == null) return true;
    return scopedStudentIds.includes(String(r.id));
  });
  teachers.sort((a, b) => {
    const ta = teacherTier(a.primary_role_slug);
    const tb = teacherTier(b.primary_role_slug);
    if (ta !== tb) return ta - tb;
    return labelForSort(a).localeCompare(labelForSort(b), 'fr', { sensitivity: 'base' });
  });
  students.sort((a, b) => labelForSort(a).localeCompare(labelForSort(b), 'fr', { sensitivity: 'base' }));
  res.json([...teachers, ...students]);
}));

router.get('/:id/image', asyncHandler(async (req, res) => {
  const row = await queryOne('SELECT image_path FROM tasks WHERE id = ?', [req.params.id]);
  if (!row?.image_path) return res.status(404).json({ error: 'Aucune image' });
  const absolutePath = getAbsolutePath(row.image_path);
  return res.sendFile(absolutePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const task = await getTaskWithAssignments(req.params.id);
  if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
  const authOne = await parseOptionalAuth(req);
  if (authOne?.userType === 'student' && isVisitorRole(authOne)) {
    const mine = (task.assignments || []).filter((a) => String(a.student_id || '') === String(authOne.userId));
    task.assignments = mine;
    if (task.proposed_by_student_id && String(task.proposed_by_student_id) !== String(authOne.userId)) {
      task.proposed_by_student_id = null;
    }
  }
  res.json(task);
}));

router.get('/import/template', requirePermission('tasks.manage', { needsElevation: true }), asyncHandler(async (req, res) => {
  const format = asTrimmedString(req.query?.format || 'csv').toLowerCase();
  if (format === 'xlsx') {
    const buffer = await buildImportTemplateXlsxBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-taches-projets.xlsx"');
    return res.send(buffer);
  }
  if (format !== 'csv') {
    return res.status(400).json({ error: 'Format invalide (csv ou xlsx)' });
  }
  const csv = buildImportTemplateCsvString();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-taches-projets.csv"');
  res.send(csv);
}));

router.post('/import', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const dryRun = !!req.body?.dryRun;
    const { report } = await executeTasksProjectsImport({
      body: req.body || {},
      dryRun,
      queryAll,
      execute,
      uuidv4,
      onAudit: (totals) => {
        logAudit('tasks_projects_import', 'task', null, `Import ${totals.created_projects} projet(s) / ${totals.created_tasks} tâche(s)`, {
          req,
          payload: { report: totals },
        });
      },
      emitTasksChanged,
      syncTaskProjectCompletionForProjects,
    });
    res.json({ report });
  } catch (e) {
    if (e.status === 400) return res.status(400).json({ error: e.message });
    respondInternalError(res, req, e);
  }
});

router.post('/', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
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
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'imageData') && imageData != null && String(imageData).trim()) {
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
    const livingDb = Object.prototype.hasOwnProperty.call(req.body || {}, 'living_beings')
      ? serializeTaskLivingBeingsForDb(living_beings)
      : null;
    const normalizedGroupId = normalizeOptionalId(group_id);
    const id = uuidv4();
    await execute(
      'INSERT INTO tasks (id, title, description, map_id, project_id, group_id, zone_id, marker_id, start_date, due_date, required_students, completion_mode, danger_level, difficulty_level, importance_level, living_beings, recurrence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        title,
        description || '',
        projectValidation.mapId,
        projectValidation.projectId,
        normalizedGroupId,
        zIds[0] || null,
        mIds[0] || null,
        start_date || null,
        due_date || null,
        reqStudents,
        completionMode,
        parsedDanger.level,
        parsedDifficulty.level,
        parsedImportance.level,
        livingDb,
        recurrence || null,
        new Date().toISOString(),
      ]
    );
    await setTaskZones(id, zIds);
    await setTaskMarkers(id, mIds);
    await setTaskTutorials(id, tutorialIds);
    await setTaskReferents(id, referentValidation.userIds);
    await syncLegacyLocationColumns(id, zIds, mIds);
    if (decodedTaskImage) {
      const rel = `tasks/${id}.${decodedTaskImage.ext}`;
      try {
        writeBufferToDisk(rel, decodedTaskImage.buffer);
        await execute('UPDATE tasks SET image_path = ? WHERE id = ?', [rel, id]);
      } catch (imgErr) {
        try {
          deleteFile(rel);
        } catch (_) {
          /* ignore */
        }
        await execute('DELETE FROM tasks WHERE id = ?', [id]);
        throw imgErr;
      }
    }
    const task = await getTaskWithAssignments(id);
    logAudit('create_task', 'task', id, title, {
      req,
      payload: { map_id: projectValidation.mapId, project_id: projectValidation.projectId || null },
    });
    emitTasksChanged({ reason: 'create_task', taskId: id, projectId: projectValidation.projectId || null, mapId: projectValidation.mapId });
    await syncTaskProjectCompletionForProjects([projectValidation.projectId]);
    res.status(201).json(task);
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/proposals', async (req, res) => {
  try {
    const {
      title,
      description,
      zone_id,
      marker_id,
      zone_ids,
      marker_ids,
      map_id,
      start_date,
      due_date,
      required_students,
      firstName,
      lastName,
      studentId,
      profilePin,
      danger_level,
      difficulty_level,
      importance_level,
      living_beings,
    } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Titre requis' });
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });
    if (!studentId) return res.status(400).json({ error: 'Identifiant n3beur requis' });

    const authProposal = await parseOptionalAuth(req);
    if (authProposal?.userType === 'student' && isVisitorRole(authProposal)) {
      return res.status(403).json({ error: 'Le profil visiteur ne permet pas cette action.' });
    }

    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [studentId]);
    if (!student) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    const permission = await ensureStudentPermission({ studentId, permissionKey: 'tasks.propose', profilePin });
    if (!permission.ok) return res.status(403).json({ error: permission.error });

    let zIds = normalizeIdArray(zone_ids);
    let mIds = normalizeIdArray(marker_ids);
    if (!zIds.length && zone_id) zIds = [String(zone_id).trim()].filter(Boolean);
    if (!mIds.length && marker_id) mIds = [String(marker_id).trim()].filter(Boolean);

    const explicitMap = map_id !== undefined ? map_id : null;
    const loc = await validateTaskLocations(zIds, mIds, explicitMap);
    if (loc.error) return res.status(400).json({ error: loc.error });
    const reqStudents = sanitizeRequiredStudents(required_students);
    const proposalDangerParsed = parseTaskDangerLevelFromClient(danger_level);
    if (proposalDangerParsed.error) return res.status(400).json({ error: proposalDangerParsed.error });
    const proposalDifficultyParsed = parseTaskDifficultyLevelFromClient(difficulty_level);
    if (proposalDifficultyParsed.error) return res.status(400).json({ error: proposalDifficultyParsed.error });
    const proposalImportanceParsed = parseTaskImportanceLevelFromClient(importance_level);
    if (proposalImportanceParsed.error) return res.status(400).json({ error: proposalImportanceParsed.error });

    let proposalDecodedImage = null;
    const bodyProposal = req.body || {};
    if (Object.prototype.hasOwnProperty.call(bodyProposal, 'imageData') && bodyProposal.imageData != null && String(bodyProposal.imageData).trim()) {
      proposalDecodedImage = decodeTaskImageBuffer(bodyProposal.imageData);
      if (proposalDecodedImage.error) return res.status(400).json({ error: proposalDecodedImage.error });
    }

    const id = uuidv4();
    const proposer = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
    const baseDescription = description ? String(description).trim() : '';
    const finalDescription = [baseDescription, proposer ? `Proposition n3beur: ${proposer}` : '']
      .filter(Boolean)
      .join('\n\n');
    const proposalLivingDb = Object.prototype.hasOwnProperty.call(req.body || {}, 'living_beings')
      ? serializeTaskLivingBeingsForDb(living_beings)
      : null;
    await execute(
      `INSERT INTO tasks (
        id, title, description, map_id, project_id, zone_id, marker_id,
        start_date, due_date, required_students, completion_mode, danger_level, difficulty_level, importance_level, living_beings, status, recurrence, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        String(title).trim(),
        finalDescription,
        loc.mapId,
        zIds[0] || null,
        mIds[0] || null,
        start_date || null,
        due_date || null,
        reqStudents,
        'single_done',
        proposalDangerParsed.level,
        proposalDifficultyParsed.level,
        proposalImportanceParsed.level,
        proposalLivingDb,
        'proposed',
        null,
        new Date().toISOString(),
      ]
    );
    await setTaskZones(id, zIds);
    await setTaskMarkers(id, mIds);
    await setTaskTutorials(id, []);
    await setTaskReferents(id, []);
    await syncLegacyLocationColumns(id, zIds, mIds);
    if (proposalDecodedImage) {
      const rel = `tasks/${id}.${proposalDecodedImage.ext}`;
      try {
        writeBufferToDisk(rel, proposalDecodedImage.buffer);
        await execute('UPDATE tasks SET image_path = ? WHERE id = ?', [rel, id]);
      } catch (imgErr) {
        try {
          deleteFile(rel);
        } catch (_) {
          /* ignore */
        }
        await execute('DELETE FROM tasks WHERE id = ?', [id]);
        throw imgErr;
      }
    }
    const task = await getTaskWithAssignments(id);
    logAudit('propose_task', 'task', id, `${String(title).trim()} (${proposer})`, {
      req,
      actorUserType: 'student',
      actorUserId: studentId,
      payload: { proposer, student_id: studentId, required_students: reqStudents },
    });
    emitTasksChanged({ reason: 'propose_task', taskId: id, mapId: resolveTaskMapId(task) });
    res.status(201).json(task);
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.put('/:id', async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    const previousProjectId = task.project_id != null && String(task.project_id).trim()
      ? String(task.project_id).trim()
      : null;
    const auth = await parseOptionalAuth(req);
    const isTeacherManageAction = canManageTasks(auth);
    const isTeacherValidateAction = canValidateTasks(auth);
    const isTeacherPut = isTeacherManageAction || isTeacherValidateAction;
    const isStudentSession = auth?.userType === 'student' && !!auth?.userId;
    const proposerStudentId = await getTaskProposerStudentId(task.id);
    const isProposerAction = isStudentSession
      && String(task.status || '') === 'proposed'
      && !!proposerStudentId
      && String(proposerStudentId) === String(auth.userId);

    if (!isTeacherPut && !isProposerAction) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    if (isTeacherValidateAction && !isTeacherManageAction) {
      const bodyKeys = Object.keys(req.body || {}).filter(
        (k) => Object.prototype.hasOwnProperty.call(req.body, k)
      );
      const disallowed = bodyKeys.filter((k) => k !== 'status');
      if (disallowed.length) {
        return res.status(403).json({
          error: 'Ce profil ne peut modifier que la validation des tâches (bouton Validée ou POST /validate).',
        });
      }
      if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    if (isProposerAction) {
      const forbiddenForProposer = ['status', 'project_id', 'tutorial_ids', 'referent_user_ids', 'recurrence', 'completion_mode'];
      const attempted = forbiddenForProposer.find((key) => Object.prototype.hasOwnProperty.call(req.body || {}, key));
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
    const nextProjectId = isTeacherManageAction && Object.prototype.hasOwnProperty.call(req.body, 'project_id')
      ? normalizeOptionalId(project_id)
      : task.project_id || null;
    const projectValidation = await validateTaskProject(nextProjectId, loc.mapId);
    if (projectValidation.error) return res.status(400).json({ error: projectValidation.error });
    const nextGroupId = isTeacherManageAction && Object.prototype.hasOwnProperty.call(req.body, 'group_id')
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
    if (isTeacherManageAction && Object.prototype.hasOwnProperty.call(req.body, 'referent_user_ids')) {
      nextReferentIds = normalizeIdArray(referent_user_ids);
    } else {
      const refRows = await queryAll('SELECT user_id FROM task_referents WHERE task_id = ? ORDER BY user_id', [task.id]);
      nextReferentIds = refRows.map((r) => String(r.user_id));
    }
    const referentValidation = await validateReferentUserIds(nextReferentIds);
    if (referentValidation.error) return res.status(400).json({ error: referentValidation.error });

    const reqStudents = required_students != null ? sanitizeRequiredStudents(required_students) : task.required_students;
    const teacherSetsStatus = (isTeacherManageAction || isTeacherValidateAction)
      && Object.prototype.hasOwnProperty.call(req.body, 'status');
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
    const nextCompletionMode = isTeacherManageAction && Object.prototype.hasOwnProperty.call(req.body, 'completion_mode')
      ? normalizeTaskCompletionMode(completion_mode)
      : (normalizeTaskCompletionMode(task.completion_mode) || 'single_done');
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

    let nextLivingDb = task.living_beings;
    if (Object.prototype.hasOwnProperty.call(req.body, 'living_beings')) {
      nextLivingDb = serializeTaskLivingBeingsForDb(living_beings);
    }

    const currentStatus = normalizeTaskStatusForRead(task.status);
    const becameValidated = nextStatus === 'validated' && currentStatus !== 'validated';
    const currentZoneIds = await getTaskZoneIds(task.id);
    const currentMarkerIds = await getTaskMarkerIds(task.id);
    const locationChanged = !sameIdSet(nextZoneIds, currentZoneIds) || !sameIdSet(nextMarkerIds, currentMarkerIds);

    // Règle métier: une tâche validée ne doit pas être liée à des zones/repères.
    if (nextStatus === 'validated') {
      if (currentStatus !== 'validated') {
        await persistRecurringTemplateLocations(
          task.id,
          task.recurrence,
          currentZoneIds,
          currentMarkerIds
        );
      }
      nextZoneIds = [];
      nextMarkerIds = [];
    } else if (currentStatus === 'validated' && locationChanged) {
      return res.status(400).json({ error: 'Impossible de lier une tâche validée à des zones ou repères' });
    }

    await execute(
      'UPDATE tasks SET title=?, description=?, map_id=?, project_id=?, group_id=?, zone_id=?, marker_id=?, start_date=?, due_date=?, required_students=?, status=?, completion_mode=?, danger_level=?, difficulty_level=?, importance_level=?, living_beings=?, recurrence=? WHERE id=?',
      [
        title ?? task.title,
        description ?? task.description,
        projectValidation.mapId,
        projectValidation.projectId,
        nextGroupId,
        nextZoneIds[0] || null,
        nextMarkerIds[0] || null,
        start_date ?? task.start_date,
        due_date ?? task.due_date,
        reqStudents,
        nextStatus,
        nextCompletionMode,
        nextDangerLevel,
        nextDifficultyLevel,
        nextImportanceLevel,
        nextLivingDb,
        isTeacherManageAction
          ? (recurrence !== undefined ? recurrence || null : task.recurrence || null)
          : task.recurrence || null,
        task.id,
      ]
    );
    if (isTeacherManageAction
      && Object.prototype.hasOwnProperty.call(req.body, 'completion_mode')
      && !Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      const recalculated = await recalculateTaskStatus({
        id: task.id,
        status: nextStatus,
        completion_mode: nextCompletionMode,
      });
      nextStatus = recalculated?.status || nextStatus;
    }
    await setTaskZones(task.id, nextZoneIds);
    await setTaskMarkers(task.id, nextMarkerIds);
    await setTaskTutorials(task.id, nextTutorialIds);
    await setTaskReferents(task.id, referentValidation.userIds);
    await syncLegacyLocationColumns(task.id, nextZoneIds, nextMarkerIds);

    const bodyPut = req.body || {};
    if (Object.prototype.hasOwnProperty.call(bodyPut, 'imageData') && bodyPut.imageData != null && String(bodyPut.imageData).trim()) {
      const dec = decodeTaskImageBuffer(bodyPut.imageData);
      if (dec.error) return res.status(400).json({ error: dec.error });
      const oldPath = task.image_path || null;
      const rel = `tasks/${task.id}.${dec.ext}`;
      try {
        writeBufferToDisk(rel, dec.buffer);
        await execute('UPDATE tasks SET image_path = ? WHERE id = ?', [rel, task.id]);
        if (oldPath && oldPath !== rel) deleteFile(oldPath);
      } catch (imgErr) {
        try {
          deleteFile(rel);
        } catch (_) {
          /* ignore */
        }
        return respondInternalError(res, req, imgErr);
      }
    } else if (Object.prototype.hasOwnProperty.call(bodyPut, 'remove_task_image') && bodyPut.remove_task_image === true) {
      if (task.image_path) {
        deleteFile(task.image_path);
        await execute('UPDATE tasks SET image_path = NULL WHERE id = ?', [task.id]);
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
    emitTasksChanged({ reason: 'update_task', taskId: task.id, projectId: projectValidation.projectId || null, mapId: resolveTaskMapId(updated) });
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

router.delete('/:id', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.image_path) deleteFile(task.image_path);
    await execute('DELETE FROM task_logs WHERE task_id = ?', [req.params.id]);
    await execute('DELETE FROM task_assignments WHERE task_id = ?', [req.params.id]);
    await execute('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    logAudit('delete_task', 'task', req.params.id, task.title, { req });
    emitTasksChanged({ reason: 'delete_task', taskId: req.params.id, mapId: resolveTaskMapId(task) });
    const delProjectId = task.project_id != null && String(task.project_id).trim()
      ? String(task.project_id).trim()
      : null;
    await syncTaskProjectCompletionForProjects([delProjectId]);
    res.json({ success: true });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/:id/assign', async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status === 'validated') return res.status(400).json({ error: 'Tâche déjà validée' });
    if (task.status === 'on_hold') return res.status(400).json({ error: 'Tâche en attente : inscription indisponible' });
    if (task.project_status === 'on_hold') {
      return res.status(400).json({ error: 'Projet en attente : inscription indisponible' });
    }
    if (task.project_status === 'completed') {
      return res.status(400).json({ error: 'Projet terminé : inscription indisponible' });
    }
    if (task.project_status === 'validated') {
      return res.status(400).json({ error: 'Projet validé : inscription indisponible' });
    }
    if (isTaskBeforeStartDate(task)) return res.status(400).json({ error: 'Date de départ non atteinte : inscription indisponible' });

    const action = await resolveStudentActionContext(req, req.body || {}, 'tasks.assign_self');
    if (action.error) {
      return res.status(action.errorStatus || 400).json({ error: action.error, ...(action.deleted ? { deleted: true } : {}) });
    }

    const already = task.assignments.find(
      (a) => (
        (action.studentId && a.student_id && String(a.student_id) === String(action.studentId))
        || (
          String(a.student_first_name || '').toLowerCase() === action.firstName.toLowerCase()
          && String(a.student_last_name || '').toLowerCase() === action.lastName.toLowerCase()
        )
      )
    );
    if (already) return res.status(400).json({ error: 'Déjà assigné à cette tâche' });

    if (action.actorUserType === 'student' && action.studentId) {
      const maxActive = await getEffectiveMaxActiveTaskAssignments(action.studentId);
      if (maxActive > 0) {
        const current = await countStudentActiveTaskAssignments(
          action.studentId,
          action.firstName,
          action.lastName
        );
        if (current >= maxActive) {
          return res.status(400).json({
            error:
              `Limite atteinte : tu as déjà ${maxActive} tâche(s) active(s) (non validées par un n3boss). Retire-toi d’une tâche ou attends une validation.`,
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
      [task.id, action.studentId || null, action.firstName, action.lastName, new Date().toISOString()]
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
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/:id/assign-group', requirePermission('tasks.assign.group', { needsElevation: true }), async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status === 'validated') return res.status(400).json({ error: 'Tâche déjà validée' });
    const groupId = normalizeOptionalId(req.body?.group_id);
    if (!groupId) return res.status(400).json({ error: 'group_id requis' });
    const scope = await getScopedStudentIds(req.auth, { groupId });
    if (scope.unauthorizedGroup) return res.status(403).json({ error: 'Groupe hors périmètre' });
    if (!scope.studentIds.length) return res.status(400).json({ error: 'Aucun n3beur dans ce groupe' });
    const students = await queryAll(
      `SELECT id, first_name, last_name
         FROM users
        WHERE user_type = 'student'
          AND is_active = 1
          AND id IN (${scope.studentIds.map(() => '?').join(',')})`,
      scope.studentIds
    );
    const already = new Set((task.assignments || []).map((a) => String(a.student_id || '')));
    const maxSlots = Math.max(0, Number(task.required_students || 1) - Number(task.assignments?.length || 0));
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
        params.push(task.id, student.id, student.first_name || '', student.last_name || '', assignedAt);
      }
      await execute(
        `INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at)
         VALUES ${placeholders}`,
        params
      );
    }
    await recalculateTaskStatus(task);
    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'assign_group', taskId: task.id, mapId: resolveTaskMapId(updated) });
    await syncTaskProjectCompletionForProjects([updated.project_id]);
    return res.json({ task: updated, assigned, skipped, considered: students.length });
  } catch (e) {
    return respondInternalError(res, req, e);
  }
});

router.post('/:id/done', async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    const completionMode = normalizeTaskCompletionMode(task.completion_mode) || 'single_done';

    const { comment, imageData } = req.body || {};
    const action = await resolveStudentActionContext(req, req.body || {}, 'tasks.done_self');
    if (action.error) {
      return res.status(action.errorStatus || 400).json({ error: action.error, ...(action.deleted ? { deleted: true } : {}) });
    }

    const assignment = action.studentId
      ? await queryOne(
        `SELECT id, done_at
           FROM task_assignments
          WHERE task_id = ?
            AND (student_id = ? OR (student_first_name = ? AND student_last_name = ?))
          ORDER BY assigned_at DESC
          LIMIT 1`,
        [task.id, action.studentId, action.firstName, action.lastName]
      )
      : await queryOne(
        `SELECT id, done_at
           FROM task_assignments
          WHERE task_id = ?
            AND student_first_name = ?
            AND student_last_name = ?
          ORDER BY assigned_at DESC
          LIMIT 1`,
        [task.id, action.firstName, action.lastName]
      );
    if (!assignment) {
      return res.status(400).json({ error: 'Tu dois être inscrit à cette tâche avant de la terminer' });
    }

    if (comment || imageData) {
      const result = await execute(
        'INSERT INTO task_logs (task_id, student_id, student_first_name, student_last_name, comment, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [task.id, action.studentId || null, action.firstName, action.lastName, comment || '', null, new Date().toISOString()]
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
        await execute(
          'UPDATE task_assignments SET done_at = ? WHERE id = ?',
          [new Date().toISOString(), assignment.id]
        );
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
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.get('/:id/logs', asyncHandler(async (req, res) => {
  const auth = await parseOptionalAuth(req);
  if (isVisitorRole(auth)) {
    return res.status(403).json({ error: 'Accès refusé aux journaux de tâche pour le profil visiteur' });
  }
  const logs = await queryAll(
    'SELECT id, task_id, student_id, student_first_name, student_last_name, comment, image_path, created_at FROM task_logs WHERE task_id = ? ORDER BY created_at DESC',
    [req.params.id]
  );
  const taskId = req.params.id;
  const baseUrl = `/api/tasks/${taskId}/logs`;
  res.json(
    logs.map((l) => ({
      ...l,
      image_url: l.image_path ? `${baseUrl}/${l.id}/image` : null,
    }))
  );
}));

router.get('/:id/logs/:logId/image', asyncHandler(async (req, res) => {
  const log = await queryOne('SELECT image_path FROM task_logs WHERE id = ? AND task_id = ?', [req.params.logId, req.params.id]);
  if (!log) return res.status(404).json({ error: 'Log introuvable' });
  if (log.image_path) {
    const absolutePath = getAbsolutePath(log.image_path);
    return res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  }
  res.status(404).json({ error: 'Aucune image' });
}));

router.delete('/:id/logs/:logId', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const log = await queryOne('SELECT * FROM task_logs WHERE id = ? AND task_id = ?', [req.params.logId, req.params.id]);
    const taskForLog = await queryOne('SELECT map_id FROM tasks WHERE id = ?', [req.params.id]);
    if (!log) return res.status(404).json({ error: 'Rapport introuvable' });
    if (log.image_path) {
      const fs = require('fs');
      const absPath = getAbsolutePath(log.image_path);
      try {
        fs.unlinkSync(absPath);
      } catch (_) {
        /* fichier absent */
      }
    }
    await execute('DELETE FROM task_logs WHERE id = ?', [req.params.logId]);
    logAudit('delete_log', 'task_log', req.params.logId, `Tâche ${req.params.id}`, { req });
    emitTasksChanged({ reason: 'delete_log', taskId: req.params.id, mapId: resolveTaskMapId(taskForLog) });
    res.json({ success: true });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/:id/validate', requirePermission('tasks.validate', { needsElevation: true }), async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    const currentStatus = normalizeTaskStatusForRead(task.status);
    if (currentStatus === 'validated') {
      return res.status(400).json({ error: 'Tâche déjà validée' });
    }
    const zonesBeforeValidate = await getTaskZoneIds(task.id);
    const markersBeforeValidate = await getTaskMarkerIds(task.id);
    await persistRecurringTemplateLocations(task.id, task.recurrence, zonesBeforeValidate, markersBeforeValidate);
    // Comme PUT avec statut validated : une tâche validée ne reste pas liée à des zones/repères.
    await setTaskZones(task.id, []);
    await setTaskMarkers(task.id, []);
    await syncLegacyLocationColumns(task.id, [], []);
    await execute("UPDATE tasks SET status = 'validated' WHERE id = ?", [req.params.id]);
    logAudit('validate_task', 'task', req.params.id, task.title, { req });
    await syncProgressionForValidatedTask(task.id);
    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'validate', taskId: task.id, mapId: resolveTaskMapId(updated) });
    await syncTaskProjectCompletionForProjects([task.project_id]);
    res.json(updated);
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

/** Même modèle que POST assign, avec identité n3beur vérifiée (session ou permission n3boss). */
router.post('/:id/unassign', async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status === 'done' || task.status === 'validated') {
      return res.status(400).json({ error: 'Impossible de quitter une tâche déjà terminée' });
    }

    const action = await resolveStudentActionContext(req, req.body || {}, 'tasks.unassign_self');
    if (action.error) {
      return res.status(action.errorStatus || 400).json({ error: action.error, ...(action.deleted ? { deleted: true } : {}) });
    }

    if (action.studentId) {
      await execute(
        'DELETE FROM task_assignments WHERE task_id = ? AND (student_id = ? OR (student_first_name = ? AND student_last_name = ?))',
        [task.id, action.studentId, action.firstName, action.lastName]
      );
    } else {
      await execute(
        'DELETE FROM task_assignments WHERE task_id = ? AND student_first_name = ? AND student_last_name = ?',
        [task.id, action.firstName, action.lastName]
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
  } catch (err) {
    respondInternalError(res, req, err, 'Erreur lors du retrait');
  }
});

module.exports = router;
