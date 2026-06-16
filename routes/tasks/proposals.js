const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../../database');
const { JWT_SECRET, hydrateAuthFromTokenClaims } = require('../../middleware/requireTeacher');
const { deleteFile, writeBufferToDisk } = require('../../lib/uploads');
const asyncHandler = require('../../lib/asyncHandler');
const { logAudit } = require('../audit');
const { emitTasksChanged } = require('../../lib/realtime');
const {
  ensurePrimaryRole,
  buildAuthzPayload,
  verifyRolePin,
  syncStudentPrimaryRoleFromProgress,
} = require('../../lib/rbac');
const {
  normalizeTaskStatusForRead,
  normalizeTaskCompletionMode,
} = require('../../lib/taskStatusRecalc');
const { parseOptionalForetAuth } = require('../../lib/auth/jwtPipeline');
const {
  resolveTaskMapId,
  parseTaskDangerLevelFromClient,
  parseTaskDifficultyLevelFromClient,
  parseTaskImportanceLevelFromClient,
  taskDangerLevelForResponse,
  taskDifficultyLevelForResponse,
  taskImportanceLevelForResponse,
  serializeTaskLivingBeingsForDb,
  attachTaskLivingBeingsApiFields,
  decodeTaskImageBuffer,
  attachTaskImagePublicFields,
  countDoneAssignments,
  isTaskBeforeStartDate,
  sanitizeRequiredStudents,
  normalizeIdArray,
  enrichTaskRow,
} = require('../../lib/taskRouteHelpers');
const { isVisitorRole } = require('../../lib/taskAuthzHelpers');

const router = express.Router();

// Helpers recopiés depuis routes/tasks.js pour rester autonome et éviter
// tout import circulaire (même convention que routes/tasks/assignments.js).
async function parseOptionalAuth(req) {
  return parseOptionalForetAuth(req, { jwtSecret: JWT_SECRET, hydrateAuthFromTokenClaims });
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

async function syncLegacyLocationColumns(taskId, zoneIds, markerIds) {
  await execute('UPDATE tasks SET zone_id = ?, marker_id = ? WHERE id = ?', [
    zoneIds[0] || null,
    markerIds[0] || null,
    taskId,
  ]);
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

router.post(
  '/proposals',
  asyncHandler(async (req, res) => {
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

    const student = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [
      studentId,
    ]);
    if (!student) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
    const permission = await ensureStudentPermission({
      studentId,
      permissionKey: 'tasks.propose',
      profilePin,
    });
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
    if (proposalDangerParsed.error)
      return res.status(400).json({ error: proposalDangerParsed.error });
    const proposalDifficultyParsed = parseTaskDifficultyLevelFromClient(difficulty_level);
    if (proposalDifficultyParsed.error)
      return res.status(400).json({ error: proposalDifficultyParsed.error });
    const proposalImportanceParsed = parseTaskImportanceLevelFromClient(importance_level);
    if (proposalImportanceParsed.error)
      return res.status(400).json({ error: proposalImportanceParsed.error });

    let proposalDecodedImage = null;
    const bodyProposal = req.body || {};
    if (
      Object.prototype.hasOwnProperty.call(bodyProposal, 'imageData') &&
      bodyProposal.imageData != null &&
      String(bodyProposal.imageData).trim()
    ) {
      proposalDecodedImage = decodeTaskImageBuffer(bodyProposal.imageData);
      if (proposalDecodedImage.error)
        return res.status(400).json({ error: proposalDecodedImage.error });
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
      ],
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
  }),
);

module.exports = router;
