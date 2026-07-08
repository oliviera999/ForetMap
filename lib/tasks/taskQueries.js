/**
 * Requêtes et helpers partagés du cluster « tasks » (routes/tasks.js,
 * routes/tasks/proposals.js, routes/tasks/assignments.js).
 *
 * Ce module ne dépend que de database.js, du middleware d'auth et de lib/* :
 * il ne crée aucun import circulaire avec les routeurs qui le consomment
 * (il remplace les copies locales « recopiées pour éviter tout import circulaire »).
 *
 * Les helpers d'écriture acceptent un exécuteur optionnel (`dbx`) : soit la base
 * par défaut (avec `withTransaction`), soit un `tx` fourni par `withTransaction`
 * — même modèle que lib/speciesJunction.js.
 */
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { JWT_SECRET, hydrateAuthFromTokenClaims } = require('../../middleware/requireTeacher');
const { parseOptionalForetAuth } = require('../auth/jwtPipeline');
const logger = require('../logger');
const {
  normalizeTaskStatusForRead,
  normalizeTaskCompletionMode,
  recalculateTaskStatusWithConn,
} = require('../taskStatusRecalc');
const {
  taskDangerLevelForResponse,
  taskDifficultyLevelForResponse,
  taskImportanceLevelForResponse,
  attachTaskLivingBeingsApiFields,
  attachTaskImagePublicFields,
  countDoneAssignments,
  isTaskBeforeStartDate,
  enrichTaskRow,
} = require('../taskRouteHelpers');
const { loadTaskSpeciesMap } = require('../speciesJunction');

/** Exécuteur par défaut : le pool (avec `withTransaction` disponible). */
const defaultDb = { queryAll, queryOne, execute, withTransaction };

async function parseOptionalAuth(req) {
  return parseOptionalForetAuth(req, { jwtSecret: JWT_SECRET, hydrateAuthFromTokenClaims });
}

async function recalculateTaskStatus(taskLike, dbx = defaultDb) {
  return recalculateTaskStatusWithConn({ queryOne: dbx.queryOne, execute: dbx.execute }, taskLike);
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
 * Appelé seul (sans `dbx`), le DELETE+INSERT est rendu atomique via `withTransaction` ;
 * appelé avec un `tx`, il s'exécute dans la transaction englobante.
 */
async function replaceTaskJoinRows(table, column, taskId, ids, dbx = defaultDb) {
  const run = async (tx) => {
    await tx.execute(`DELETE FROM ${table} WHERE task_id = ?`, [taskId]);
    const list = Array.isArray(ids) ? ids : [];
    if (list.length === 0) return;
    const placeholders = list.map(() => '(?, ?)').join(', ');
    const params = [];
    for (const id of list) params.push(taskId, id);
    await tx.execute(`INSERT INTO ${table} (task_id, ${column}) VALUES ${placeholders}`, params);
  };
  if (typeof dbx.withTransaction === 'function') {
    await dbx.withTransaction(run);
  } else {
    await run(dbx);
  }
}

async function setTaskZones(taskId, zoneIds, dbx = defaultDb) {
  return replaceTaskJoinRows('task_zones', 'zone_id', taskId, zoneIds, dbx);
}

async function setTaskMarkers(taskId, markerIds, dbx = defaultDb) {
  return replaceTaskJoinRows('task_markers', 'marker_id', taskId, markerIds, dbx);
}

async function setTaskTutorials(taskId, tutorialIds, dbx = defaultDb) {
  return replaceTaskJoinRows('task_tutorials', 'tutorial_id', taskId, tutorialIds, dbx);
}

async function setTaskReferents(taskId, userIds, dbx = defaultDb) {
  return replaceTaskJoinRows('task_referents', 'user_id', taskId, userIds, dbx);
}

// F5 — invariant : tasks.zone_id / tasks.marker_id sont UNIQUEMENT la copie du
// premier lien task_zones / task_markers (compat exports & données historiques).
// Ne jamais les écrire ailleurs, ne jamais les lire comme source de vérité.
async function syncLegacyLocationColumns(taskId, zoneIds, markerIds, dbx = defaultDb) {
  await dbx.execute('UPDATE tasks SET zone_id = ?, marker_id = ? WHERE id = ?', [
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
    logger.warn(
      { err, taskId },
      'Lecture proposeur (audit_log) en échec — poursuite sans métadonnée',
    );
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
    `SELECT t.*,
            tp.map_id AS project_map_id, tp.title AS project_title, tp.status AS project_status,
            t.image_path AS task_cover_image_path
       FROM tasks t
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
  const taskSpeciesRows = await loadTaskSpeciesMap(defaultDb, [taskId]);
  attachTaskLivingBeingsApiFields(task, taskSpeciesRows.get(taskId) || []);
  attachTaskImagePublicFields(task);
  return task;
}

module.exports = {
  parseOptionalAuth,
  recalculateTaskStatus,
  mapExists,
  getZone,
  getMarker,
  validateTaskLocations,
  replaceTaskJoinRows,
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
};
