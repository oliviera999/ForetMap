const express = require('express');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission, JWT_SECRET, hydrateAuthFromTokenClaims } = require('../middleware/requireTeacher');
const { saveBase64ToDisk, getAbsolutePath } = require('../lib/uploads');
const { logRouteError } = require('../lib/routeLog');
const logger = require('../lib/logger');
const { logAudit } = require('./audit');
const { emitTasksChanged } = require('../lib/realtime');
const { ensurePrimaryRole, buildAuthzPayload, verifyRolePin, syncStudentPrimaryRoleFromProgress } = require('../lib/rbac');
const {
  countStudentActiveTaskAssignments,
  getEffectiveMaxActiveTaskAssignments,
} = require('../lib/studentTaskEnrollment');

const router = express.Router();
const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const MAX_TASK_REFERENTS = 15;
const IMPORT_TEMPLATE_COLUMNS = [
  'Type (project|task)',
  'Carte (map_id)',
  'Projet',
  'Description projet',
  'Tâche',
  'Description tâche',
  'Date de départ (YYYY-MM-DD)',
  'Date limite (YYYY-MM-DD)',
  'n3beurs requis',
  'Statut (available|in_progress|done|validated|proposed|on_hold)',
  'Récurrence (weekly|biweekly|monthly)',
];

const ALLOWED_TASK_STATUSES = new Set(['available', 'in_progress', 'done', 'validated', 'proposed', 'on_hold']);
const ALLOWED_TASK_COMPLETION_MODES = new Set(['single_done', 'all_assignees_done']);
const ALLOWED_IMPORT_TASK_STATUSES = ALLOWED_TASK_STATUSES;
const ALLOWED_IMPORT_TASK_RECURRENCES = new Set(['weekly', 'biweekly', 'monthly']);
const IMPORT_HEADER_ALIASES = new Map([
  ['type', 'entityType'],
  ['type_project_task', 'entityType'],
  ['entity_type', 'entityType'],
  ['row_type', 'entityType'],
  ['carte', 'mapId'],
  ['carte_map_id', 'mapId'],
  ['map', 'mapId'],
  ['map_id', 'mapId'],
  ['projet', 'projectTitle'],
  ['project', 'projectTitle'],
  ['project_title', 'projectTitle'],
  ['description_projet', 'projectDescription'],
  ['project_description', 'projectDescription'],
  ['tache', 'taskTitle'],
  ['tâche', 'taskTitle'],
  ['task', 'taskTitle'],
  ['task_title', 'taskTitle'],
  ['description_tache', 'taskDescription'],
  ['description_tâche', 'taskDescription'],
  ['task_description', 'taskDescription'],
  ['date_de_depart', 'startDate'],
  ['date_de_depart_yyyy_mm_dd', 'startDate'],
  ['date_debut', 'startDate'],
  ['start_date', 'startDate'],
  ['start', 'startDate'],
  ['date_limite', 'dueDate'],
  ['date_limite_yyyy_mm_dd', 'dueDate'],
  ['due_date', 'dueDate'],
  ['deadline', 'dueDate'],
  ['eleves_requis', 'requiredStudents'],
  ['élèves_requis', 'requiredStudents'],
  ['n3beurs_requis', 'requiredStudents'],
  ['required_students', 'requiredStudents'],
  ['statut', 'status'],
  ['statut_available_in_progress_done_validated_proposed_on_hold', 'status'],
  ['status', 'status'],
  ['recurrence', 'recurrence'],
  ['recurrence_weekly_biweekly_monthly', 'recurrence'],
  ['récurrence', 'recurrence'],
]);

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

function normalizeImportHeader(value) {
  return asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeImportEntityType(value) {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  if (['project', 'projet', 'projets', 'task_project'].includes(raw)) return 'project';
  if (['task', 'tache', 'tâche', 'tasks', 'taches', 'tâches'].includes(raw)) return 'task';
  return null;
}

function normalizeImportTaskStatus(value) {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return 'available';
  if (['disponible'].includes(raw)) return 'available';
  if (['en_cours', 'encours', 'en cours'].includes(raw)) return 'in_progress';
  if (['terminee', 'terminée'].includes(raw)) return 'done';
  if (['validee', 'validée'].includes(raw)) return 'validated';
  if (['proposee', 'proposée'].includes(raw)) return 'proposed';
  if (['en_attente', 'en attente', 'attente'].includes(raw)) return 'on_hold';
  return ALLOWED_IMPORT_TASK_STATUSES.has(raw) ? raw : null;
}

function normalizeTaskStatusForRead(value) {
  return normalizeImportTaskStatus(value) || 'available';
}

function normalizeTaskCompletionMode(value) {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return 'single_done';
  return ALLOWED_TASK_COMPLETION_MODES.has(raw) ? raw : null;
}

function countDoneAssignments(assignments = []) {
  if (!Array.isArray(assignments)) return 0;
  return assignments.reduce((count, assignment) => {
    if (assignment?.done_at) return count + 1;
    return count;
  }, 0);
}

function computeTaskStatusFromProgress({ currentStatus, completionMode, assignedCount, doneCount }) {
  if (currentStatus === 'validated' || currentStatus === 'proposed' || currentStatus === 'on_hold') {
    return currentStatus;
  }
  if (completionMode === 'all_assignees_done') {
    if (assignedCount <= 0) return 'available';
    if (doneCount >= assignedCount) return 'done';
    return 'in_progress';
  }
  if (currentStatus === 'done') return 'done';
  if (assignedCount <= 0) return 'available';
  return 'in_progress';
}

async function fetchTaskAssignmentProgress(taskId) {
  const progress = await queryOne(
    `SELECT COUNT(*) AS assigned_count,
            SUM(CASE WHEN done_at IS NOT NULL THEN 1 ELSE 0 END) AS done_count
       FROM task_assignments
      WHERE task_id = ?`,
    [taskId]
  );
  return {
    assignedCount: Number(progress?.assigned_count) || 0,
    doneCount: Number(progress?.done_count) || 0,
  };
}

async function recalculateTaskStatus(taskLike) {
  const task = typeof taskLike === 'string'
    ? await queryOne('SELECT id, status, completion_mode FROM tasks WHERE id = ?', [taskLike])
    : taskLike;
  if (!task || !task.id) return null;
  const currentStatus = normalizeTaskStatusForRead(task.status);
  const completionMode = normalizeTaskCompletionMode(task.completion_mode) || 'single_done';
  const progress = await fetchTaskAssignmentProgress(task.id);
  const nextStatus = computeTaskStatusFromProgress({
    currentStatus,
    completionMode,
    assignedCount: progress.assignedCount,
    doneCount: progress.doneCount,
  });
  if (nextStatus !== currentStatus) {
    await execute('UPDATE tasks SET status = ? WHERE id = ?', [nextStatus, task.id]);
  }
  return {
    status: nextStatus,
    completionMode,
    assignedCount: progress.assignedCount,
    doneCount: progress.doneCount,
  };
}

function normalizeImportTaskRecurrence(value) {
  const raw = asTrimmedString(value).toLowerCase();
  if (!raw) return null;
  if (['hebdo', 'hebdomadaire'].includes(raw)) return 'weekly';
  if (['bihebdo', 'bi_hebdo', 'toutes_les_2_semaines'].includes(raw)) return 'biweekly';
  if (['mensuelle', 'mensuel'].includes(raw)) return 'monthly';
  return ALLOWED_IMPORT_TASK_RECURRENCES.has(raw) ? raw : null;
}

function normalizeImportRequiredStudents(value) {
  const raw = asTrimmedString(value);
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 50) return null;
  return n;
}

function normalizeImportDueDate(value) {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
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

function parseWorkbookRowsFromBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const ws = wb.Sheets[first];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, blankrows: false });
}

function parseCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function parseCsvRowsFromBuffer(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').replace(/\r/g, '');
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const delimiter = (lines[0].split(';').length >= lines[0].split(',').length) ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter).map((h) => asTrimmedString(h));
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = idx < cells.length ? cells[idx] : '';
    });
    rows.push(row);
  }
  return rows;
}

function mapImportRow(row = {}) {
  const mapped = {};
  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeImportHeader(key);
    const target = IMPORT_HEADER_ALIASES.get(normalized);
    if (!target) continue;
    mapped[target] = value;
  }
  return mapped;
}

function buildImportPayload(row = {}) {
  const mapped = mapImportRow(row);
  return {
    entityType: normalizeImportEntityType(mapped.entityType),
    mapId: normalizeOptionalString(mapped.mapId),
    projectTitle: normalizeOptionalString(mapped.projectTitle),
    projectDescription: normalizeOptionalString(mapped.projectDescription),
    taskTitle: normalizeOptionalString(mapped.taskTitle),
    taskDescription: normalizeOptionalString(mapped.taskDescription),
    startDate: normalizeDateOnly(mapped.startDate),
    dueDate: normalizeImportDueDate(mapped.dueDate),
    requiredStudents: normalizeImportRequiredStudents(mapped.requiredStudents),
    status: normalizeImportTaskStatus(mapped.status),
    recurrence: normalizeImportTaskRecurrence(mapped.recurrence),
  };
}

function csvEscape(value) {
  const s = String(value ?? '');
  return s.includes(';') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function buildImportTemplateWorkbookRows() {
  return [
    {
      [IMPORT_TEMPLATE_COLUMNS[0]]: 'project',
      [IMPORT_TEMPLATE_COLUMNS[1]]: 'foret',
      [IMPORT_TEMPLATE_COLUMNS[2]]: 'Semis printemps',
      [IMPORT_TEMPLATE_COLUMNS[3]]: 'Planifier et suivre les semis de printemps.',
      [IMPORT_TEMPLATE_COLUMNS[4]]: '',
      [IMPORT_TEMPLATE_COLUMNS[5]]: '',
      [IMPORT_TEMPLATE_COLUMNS[6]]: '',
      [IMPORT_TEMPLATE_COLUMNS[7]]: '',
      [IMPORT_TEMPLATE_COLUMNS[8]]: '',
      [IMPORT_TEMPLATE_COLUMNS[9]]: '',
      [IMPORT_TEMPLATE_COLUMNS[10]]: '',
    },
    {
      [IMPORT_TEMPLATE_COLUMNS[0]]: 'task',
      [IMPORT_TEMPLATE_COLUMNS[1]]: 'foret',
      [IMPORT_TEMPLATE_COLUMNS[2]]: 'Semis printemps',
      [IMPORT_TEMPLATE_COLUMNS[3]]: '',
      [IMPORT_TEMPLATE_COLUMNS[4]]: 'Préparer les godets',
      [IMPORT_TEMPLATE_COLUMNS[5]]: 'Nettoyer puis remplir les godets de substrat.',
      [IMPORT_TEMPLATE_COLUMNS[6]]: '2026-04-01',
      [IMPORT_TEMPLATE_COLUMNS[7]]: '2026-04-15',
      [IMPORT_TEMPLATE_COLUMNS[8]]: '2',
      [IMPORT_TEMPLATE_COLUMNS[9]]: 'available',
      [IMPORT_TEMPLATE_COLUMNS[10]]: 'weekly',
    },
  ];
}

async function resolveImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  if (buffer.length > MAX_IMPORT_FILE_BYTES) throw new Error('Fichier import trop volumineux (max 8 Mo)');
  const fileName = asTrimmedString(body.fileName).toLowerCase();
  if (fileName.endsWith('.csv')) return parseCsvRowsFromBuffer(buffer);
  return parseWorkbookRowsFromBuffer(buffer);
}

async function parseOptionalAuth(req) {
  try {
    if (!JWT_SECRET) return null;
    const auth = req.headers.authorization;
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return null;
    const claims = jwt.verify(token, JWT_SECRET);
    return await hydrateAuthFromTokenClaims(claims);
  } catch (_) {
    return null;
  }
}

function canReadAllAssignments(auth) {
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  if (auth?.userType === 'teacher') return true;
  return perms.includes('tasks.manage') || perms.includes('tasks.validate') || perms.includes('stats.read.all');
}

function canManageTasks(auth) {
  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  if (auth?.userType === 'teacher') return true;
  return perms.includes('tasks.manage');
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

async function persistRecurringTemplateLocations(taskId, recurrenceRaw, zoneIds, markerIds) {
  const r = String(recurrenceRaw || '').trim().toLowerCase();
  if (!r || !RECURRENCE_WITH_TEMPLATE_LOCS.has(r)) return;
  const z = Array.isArray(zoneIds) ? zoneIds : [];
  const m = Array.isArray(markerIds) ? markerIds : [];
  await execute(
    'UPDATE tasks SET recurrence_template_zone_ids = ?, recurrence_template_marker_ids = ? WHERE id = ?',
    [JSON.stringify(z), JSON.stringify(m), taskId]
  );
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
    const ph = taskIds.map(() => '?').join(',');
    return queryAll(`SELECT * FROM task_assignments WHERE task_id IN (${ph})`, taskIds);
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

async function setTaskZones(taskId, zoneIds) {
  await execute('DELETE FROM task_zones WHERE task_id = ?', [taskId]);
  for (const zid of zoneIds) {
    await execute('INSERT INTO task_zones (task_id, zone_id) VALUES (?, ?)', [taskId, zid]);
  }
}

async function setTaskMarkers(taskId, markerIds) {
  await execute('DELETE FROM task_markers WHERE task_id = ?', [taskId]);
  for (const mid of markerIds) {
    await execute('INSERT INTO task_markers (task_id, marker_id) VALUES (?, ?)', [taskId, mid]);
  }
}

async function setTaskTutorials(taskId, tutorialIds) {
  await execute('DELETE FROM task_tutorials WHERE task_id = ?', [taskId]);
  for (const tid of tutorialIds) {
    await execute('INSERT INTO task_tutorials (task_id, tutorial_id) VALUES (?, ?)', [taskId, tid]);
  }
}

async function setTaskReferents(taskId, userIds) {
  await execute('DELETE FROM task_referents WHERE task_id = ?', [taskId]);
  for (const uid of userIds) {
    await execute('INSERT INTO task_referents (task_id, user_id) VALUES (?, ?)', [taskId, uid]);
  }
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
            tp.map_id AS project_map_id, tp.title AS project_title, tp.status AS project_status
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
  const isTeacherAction = canManageTasks(auth);

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

  if (isTeacherAction && providedFirstName && providedLastName) {
    return {
      auth,
      studentId: null,
      firstName: providedFirstName,
      lastName: providedLastName,
      actorUserType: auth?.userType || null,
      actorUserId: auth?.userId || null,
    };
  }

  return { errorStatus: 400, error: 'Identifiant n3beur requis' };
}

router.get('/', async (req, res) => {
  try {
    const auth = await parseOptionalAuth(req);
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    const projectId = req.query.project_id ? String(req.query.project_id).trim() : '';
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
             m.id AS map_id_resolved_join, m.label AS map_label
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
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const tasks = await queryAll(`${sqlBase} ${whereSql} ORDER BY t.due_date ASC`, params);
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
      row.is_before_start_date = isTaskBeforeStartDate(row);
      delete row.map_id_resolved_join;
      row.assignments = assignmentsByTask.get(t.id) || [];
      row.assigned_count = assignedCountByTask.get(t.id) || 0;
      row.assignees_total_count = row.assigned_count;
      row.assignees_done_count = doneCountByTask.get(t.id) || 0;
      row.proposed_by_student_id = proposerByTask.get(t.id) || null;
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

router.get('/referent-candidates', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
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
    const teachers = rows.filter((r) => r.user_type === 'teacher');
    const students = rows.filter((r) => r.user_type === 'student');
    teachers.sort((a, b) => {
      const ta = teacherTier(a.primary_role_slug);
      const tb = teacherTier(b.primary_role_slug);
      if (ta !== tb) return ta - tb;
      return labelForSort(a).localeCompare(labelForSort(b), 'fr', { sensitivity: 'base' });
    });
    students.sort((a, b) => labelForSort(a).localeCompare(labelForSort(b), 'fr', { sensitivity: 'base' }));
    res.json([...teachers, ...students]);
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.get('/:id', async (req, res) => {
  try {
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
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.get('/import/template', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const format = asTrimmedString(req.query?.format || 'csv').toLowerCase();
    if (format === 'xlsx') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(buildImportTemplateWorkbookRows(), { header: IMPORT_TEMPLATE_COLUMNS });
      XLSX.utils.book_append_sheet(wb, ws, 'taches_projets');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-taches-projets.xlsx"');
      return res.send(buffer);
    }
    if (format !== 'csv') {
      return res.status(400).json({ error: 'Format invalide (csv ou xlsx)' });
    }
    const rows = buildImportTemplateWorkbookRows();
    const BOM = '\uFEFF';
    const headerLine = IMPORT_TEMPLATE_COLUMNS.map(csvEscape).join(';');
    const csvRows = rows.map((row) => IMPORT_TEMPLATE_COLUMNS.map((col) => csvEscape(row[col])).join(';'));
    const csv = `${BOM}${headerLine}\r\n${csvRows.join('\r\n')}\r\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="foretmap-modele-taches-projets.csv"');
    res.send(csv);
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.post('/import', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const dryRun = !!req.body?.dryRun;
    const rawRows = await resolveImportRows(req.body || {});
    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return res.status(400).json({ error: 'Aucune ligne importable détectée' });
    }
    if (rawRows.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Import limité à ${MAX_IMPORT_ROWS} lignes` });
    }

    const report = {
      dryRun,
      totals: {
        received: rawRows.length,
        valid: 0,
        created_projects: 0,
        created_tasks: 0,
        skipped_existing: 0,
        skipped_invalid: 0,
      },
      preview: [],
      errors: [],
    };

    const mapRows = await queryAll('SELECT id FROM maps');
    const knownMapIds = new Set(mapRows.map((m) => String(m.id)));
    const existingProjects = await queryAll('SELECT id, map_id, title FROM task_projects');
    const projectsByMapTitle = new Map();
    for (const p of existingProjects) {
      projectsByMapTitle.set(`${String(p.map_id)}|${String(p.title).toLowerCase()}`, p);
    }
    const existingTasks = await queryAll(
      `SELECT t.id, t.title, t.map_id, t.project_id, tp.title AS project_title, tp.map_id AS project_map_id
         FROM tasks t
         LEFT JOIN task_projects tp ON tp.id = t.project_id`
    );
    const tasksByIdentity = new Set();
    for (const t of existingTasks) {
      const taskMap = t.project_map_id || t.map_id || '';
      const projectTitle = t.project_title || '';
      const identity = `${String(taskMap)}|${String(projectTitle).toLowerCase()}|${String(t.title).toLowerCase()}`;
      tasksByIdentity.add(identity);
    }

    const projectRows = [];
    const taskRows = [];
    rawRows.forEach((row, idx) => {
      const rowNumber = idx + 2;
      const payload = buildImportPayload(row);
      const errors = [];

      if (!payload.entityType) {
        errors.push({ row: rowNumber, field: 'type', error: 'Type invalide (project|task)' });
      }
      if (payload.entityType === 'project') {
        if (!payload.mapId) errors.push({ row: rowNumber, field: 'map_id', error: 'Carte requise pour un projet' });
        if (!payload.projectTitle) errors.push({ row: rowNumber, field: 'project_title', error: 'Nom du projet requis' });
        if (payload.mapId && !knownMapIds.has(payload.mapId)) {
          errors.push({ row: rowNumber, field: 'map_id', error: 'Carte introuvable' });
        }
      }
      if (payload.entityType === 'task') {
        if (!payload.taskTitle) errors.push({ row: rowNumber, field: 'task_title', error: 'Nom de tâche requis' });
        if (payload.mapId && !knownMapIds.has(payload.mapId)) {
          errors.push({ row: rowNumber, field: 'map_id', error: 'Carte introuvable' });
        }
        if (payload.requiredStudents == null) {
          errors.push({ row: rowNumber, field: 'required_students', error: 'n3beurs requis invalide (1-50)' });
        }
        if (!payload.status || !ALLOWED_IMPORT_TASK_STATUSES.has(payload.status)) {
          errors.push({ row: rowNumber, field: 'status', error: 'Statut invalide' });
        }
        if (asTrimmedString(mapImportRow(row).recurrence) && !payload.recurrence) {
          errors.push({ row: rowNumber, field: 'recurrence', error: 'Récurrence invalide (weekly|biweekly|monthly)' });
        }
        if (asTrimmedString(mapImportRow(row).dueDate) && !payload.dueDate) {
          errors.push({ row: rowNumber, field: 'due_date', error: 'Date limite invalide' });
        }
        if (asTrimmedString(mapImportRow(row).startDate) && !payload.startDate) {
          errors.push({ row: rowNumber, field: 'start_date', error: 'Date de départ invalide' });
        }
      }

      if (errors.length) {
        report.totals.skipped_invalid += 1;
        report.errors.push(...errors);
        return;
      }

      if (payload.entityType === 'project') {
        const key = `${payload.mapId}|${payload.projectTitle.toLowerCase()}`;
        if (projectsByMapTitle.has(key) || projectRows.some((p) => p.identityKey === key)) {
          report.totals.skipped_existing += 1;
          report.errors.push({ row: rowNumber, field: 'project_title', error: 'Projet déjà existant (même carte + même nom)' });
          return;
        }
        projectRows.push({
          rowNumber,
          identityKey: key,
          mapId: payload.mapId,
          title: payload.projectTitle,
          description: payload.projectDescription,
        });
      } else {
        taskRows.push({
          rowNumber,
          mapId: payload.mapId,
          projectTitle: payload.projectTitle,
          title: payload.taskTitle,
          description: payload.taskDescription,
          startDate: payload.startDate,
          dueDate: payload.dueDate,
          requiredStudents: payload.requiredStudents ?? 1,
          status: payload.status || 'available',
          recurrence: payload.recurrence || null,
        });
      }
    });

    const plannedProjectsByMapTitle = new Map(projectRows.map((p) => [p.identityKey, p]));
    const taskRowsResolved = [];
    const seenTaskKeys = new Set();
    for (const row of taskRows) {
      let resolvedProject = null;
      if (row.projectTitle) {
        if (row.mapId) {
          const mapTitleKey = `${row.mapId}|${row.projectTitle.toLowerCase()}`;
          resolvedProject = projectsByMapTitle.get(mapTitleKey) || plannedProjectsByMapTitle.get(mapTitleKey) || null;
          if (!resolvedProject) {
            report.totals.skipped_invalid += 1;
            report.errors.push({ row: row.rowNumber, field: 'project_title', error: 'Projet introuvable pour cette carte' });
            continue;
          }
        } else {
          const projectCandidates = [
            ...existingProjects.filter((p) => String(p.title).toLowerCase() === row.projectTitle.toLowerCase()),
            ...projectRows.filter((p) => String(p.title).toLowerCase() === row.projectTitle.toLowerCase()),
          ];
          const uniqueCandidates = [...new Map(projectCandidates.map((p) => [p.id || p.identityKey, p])).values()];
          if (uniqueCandidates.length !== 1) {
            report.totals.skipped_invalid += 1;
            report.errors.push({
              row: row.rowNumber,
              field: 'project_title',
              error: uniqueCandidates.length === 0
                ? 'Projet introuvable (précisez map_id)'
                : 'Projet ambigu (plusieurs cartes, précisez map_id)',
            });
            continue;
          }
          resolvedProject = uniqueCandidates[0];
        }
      }

      const resolvedMapId = row.mapId || resolvedProject?.map_id || resolvedProject?.mapId || null;
      if (!resolvedMapId) {
        report.totals.skipped_invalid += 1;
        report.errors.push({ row: row.rowNumber, field: 'map_id', error: 'Carte requise (directement ou via projet)' });
        continue;
      }
      const resolvedProjectTitle = resolvedProject?.title || row.projectTitle || '';
      const taskIdentity = `${resolvedMapId}|${resolvedProjectTitle.toLowerCase()}|${row.title.toLowerCase()}`;
      if (tasksByIdentity.has(taskIdentity) || seenTaskKeys.has(taskIdentity)) {
        report.totals.skipped_existing += 1;
        report.errors.push({
          row: row.rowNumber,
          field: 'task_title',
          error: 'Tâche déjà existante (même carte + projet + titre)',
        });
        continue;
      }
      seenTaskKeys.add(taskIdentity);
      taskRowsResolved.push({
        ...row,
        resolvedMapId,
        resolvedProjectTitle,
      });
    }

    const validTotal = projectRows.length + taskRowsResolved.length;
    report.totals.valid = validTotal;
    for (const item of projectRows.slice(0, 10)) {
      report.preview.push({ row: item.rowNumber, type: 'project', map_id: item.mapId, title: item.title });
    }
    for (const item of taskRowsResolved.slice(0, 10 - report.preview.length)) {
      report.preview.push({
        row: item.rowNumber,
        type: 'task',
        map_id: item.resolvedMapId,
        project_title: item.resolvedProjectTitle || null,
        title: item.title,
      });
    }

    if (dryRun || validTotal === 0) {
      return res.json({ report });
    }

    const createdProjectsByMapTitle = new Map();
    for (const project of projectRows) {
      const id = uuidv4();
      await execute(
        'INSERT INTO task_projects (id, map_id, title, description, created_at) VALUES (?, ?, ?, ?, ?)',
        [id, project.mapId, project.title, project.description || null, new Date().toISOString()]
      );
      createdProjectsByMapTitle.set(`${project.mapId}|${project.title.toLowerCase()}`, { id, map_id: project.mapId, title: project.title });
      report.totals.created_projects += 1;
    }

    for (const task of taskRowsResolved) {
      const projectKey = task.resolvedProjectTitle
        ? `${task.resolvedMapId}|${task.resolvedProjectTitle.toLowerCase()}`
        : null;
      const existingProject = projectKey
        ? (projectsByMapTitle.get(projectKey) || createdProjectsByMapTitle.get(projectKey) || null)
        : null;
      const id = uuidv4();
      await execute(
        'INSERT INTO tasks (id, title, description, map_id, project_id, zone_id, marker_id, start_date, due_date, required_students, status, recurrence, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)',
        [
          id,
          task.title,
          task.description || '',
          task.resolvedMapId,
          existingProject?.id || null,
          task.startDate || null,
          task.dueDate || null,
          task.requiredStudents || 1,
          task.status || 'available',
          task.recurrence || null,
          new Date().toISOString(),
        ]
      );
      report.totals.created_tasks += 1;
    }

    if (report.totals.created_projects + report.totals.created_tasks > 0) {
      logAudit('tasks_projects_import', 'task', null, `Import ${report.totals.created_projects} projet(s) / ${report.totals.created_tasks} tâche(s)`, {
        req,
        payload: { report: report.totals },
      });
      emitTasksChanged({
        reason: 'tasks_projects_import',
        created_projects: report.totals.created_projects,
        created_tasks: report.totals.created_tasks,
      });
    }
    res.json({ report });
  } catch (e) {
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
    } = req.body;
    if (!title) return res.status(400).json({ error: 'Titre requis' });

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
    const id = uuidv4();
    await execute(
      'INSERT INTO tasks (id, title, description, map_id, project_id, zone_id, marker_id, start_date, due_date, required_students, completion_mode, recurrence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        title,
        description || '',
        projectValidation.mapId,
        projectValidation.projectId,
        zIds[0] || null,
        mIds[0] || null,
        start_date || null,
        due_date || null,
        reqStudents,
        completionMode,
        recurrence || null,
        new Date().toISOString(),
      ]
    );
    await setTaskZones(id, zIds);
    await setTaskMarkers(id, mIds);
    await setTaskTutorials(id, tutorialIds);
    await setTaskReferents(id, referentValidation.userIds);
    await syncLegacyLocationColumns(id, zIds, mIds);
    const task = await getTaskWithAssignments(id);
    logAudit('create_task', 'task', id, title, {
      req,
      payload: { map_id: projectValidation.mapId, project_id: projectValidation.projectId || null },
    });
    emitTasksChanged({ reason: 'create_task', taskId: id, projectId: projectValidation.projectId || null, mapId: projectValidation.mapId });
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

    const id = uuidv4();
    const proposer = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
    const baseDescription = description ? String(description).trim() : '';
    const finalDescription = [baseDescription, proposer ? `Proposition n3beur: ${proposer}` : '']
      .filter(Boolean)
      .join('\n\n');
    await execute(
      `INSERT INTO tasks (
        id, title, description, map_id, project_id, zone_id, marker_id,
        start_date, due_date, required_students, completion_mode, status, recurrence, created_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    const auth = await parseOptionalAuth(req);
    const isTeacherAction = canManageTasks(auth);
    const isStudentSession = auth?.userType === 'student' && !!auth?.userId;
    const proposerStudentId = await getTaskProposerStudentId(task.id);
    const isProposerAction = isStudentSession
      && String(task.status || '') === 'proposed'
      && !!proposerStudentId
      && String(proposerStudentId) === String(auth.userId);

    if (!isTeacherAction && !isProposerAction) {
      return res.status(403).json({ error: 'Accès refusé' });
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
      completion_mode,
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
    const nextProjectId = isTeacherAction && Object.prototype.hasOwnProperty.call(req.body, 'project_id')
      ? normalizeOptionalId(project_id)
      : task.project_id || null;
    const projectValidation = await validateTaskProject(nextProjectId, loc.mapId);
    if (projectValidation.error) return res.status(400).json({ error: projectValidation.error });

    let nextTutorialIds;
    if (isTeacherAction && Object.prototype.hasOwnProperty.call(req.body, 'tutorial_ids')) {
      nextTutorialIds = normalizeTutorialIdArray(tutorial_ids);
    } else {
      nextTutorialIds = await getTaskTutorialIds(task.id);
    }
    const tutorialValidation = await validateTutorialIds(nextTutorialIds);
    if (tutorialValidation.error) return res.status(400).json({ error: tutorialValidation.error });

    let nextReferentIds;
    if (isTeacherAction && Object.prototype.hasOwnProperty.call(req.body, 'referent_user_ids')) {
      nextReferentIds = normalizeIdArray(referent_user_ids);
    } else {
      const refRows = await queryAll('SELECT user_id FROM task_referents WHERE task_id = ? ORDER BY user_id', [task.id]);
      nextReferentIds = refRows.map((r) => String(r.user_id));
    }
    const referentValidation = await validateReferentUserIds(nextReferentIds);
    if (referentValidation.error) return res.status(400).json({ error: referentValidation.error });

    const reqStudents = required_students != null ? sanitizeRequiredStudents(required_students) : task.required_students;
    let nextStatus = isTeacherAction && Object.prototype.hasOwnProperty.call(req.body, 'status')
      ? normalizeImportTaskStatus(status)
      : normalizeTaskStatusForRead(task.status);
    if (!nextStatus) return res.status(400).json({ error: 'Statut invalide' });
    const nextCompletionMode = isTeacherAction && Object.prototype.hasOwnProperty.call(req.body, 'completion_mode')
      ? normalizeTaskCompletionMode(completion_mode)
      : (normalizeTaskCompletionMode(task.completion_mode) || 'single_done');
    if (!nextCompletionMode) return res.status(400).json({ error: 'Mode de validation invalide' });

    const currentStatus = normalizeTaskStatusForRead(task.status);
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
      'UPDATE tasks SET title=?, description=?, map_id=?, project_id=?, zone_id=?, marker_id=?, start_date=?, due_date=?, required_students=?, status=?, completion_mode=?, recurrence=? WHERE id=?',
      [
        title ?? task.title,
        description ?? task.description,
        projectValidation.mapId,
        projectValidation.projectId,
        nextZoneIds[0] || null,
        nextMarkerIds[0] || null,
        start_date ?? task.start_date,
        due_date ?? task.due_date,
        reqStudents,
        nextStatus,
        nextCompletionMode,
        isTeacherAction
          ? (recurrence !== undefined ? recurrence || null : task.recurrence || null)
          : task.recurrence || null,
        task.id,
      ]
    );
    if (isTeacherAction
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
    await execute('DELETE FROM task_logs WHERE task_id = ?', [req.params.id]);
    await execute('DELETE FROM task_assignments WHERE task_id = ?', [req.params.id]);
    await execute('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    logAudit('delete_task', 'task', req.params.id, task.title, { req });
    emitTasksChanged({ reason: 'delete_task', taskId: req.params.id, mapId: resolveTaskMapId(task) });
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
    if (task.project_status === 'on_hold') return res.status(400).json({ error: 'Projet en attente : inscription indisponible' });
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
    res.json(updated);
  } catch (e) {
    respondInternalError(res, req, e);
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
    res.json(updated);
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
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
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

router.get('/:id/logs/:logId/image', async (req, res) => {
  try {
    const log = await queryOne('SELECT image_path FROM task_logs WHERE id = ? AND task_id = ?', [req.params.logId, req.params.id]);
    if (!log) return res.status(404).json({ error: 'Log introuvable' });
    if (log.image_path) {
      const absolutePath = getAbsolutePath(log.image_path);
      return res.sendFile(absolutePath, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
      });
    }
    res.status(404).json({ error: 'Aucune image' });
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

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
    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'validate', taskId: task.id, mapId: resolveTaskMapId(updated) });
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
    res.json(updated);
  } catch (err) {
    respondInternalError(res, req, err, 'Erreur lors du retrait');
  }
});

module.exports = router;
