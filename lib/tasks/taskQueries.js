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
 *
 * Dépôt de référence du domaine « tâches » (piste B, étape B5) : le SQL seulement, sans
 * règle métier. Les règles vivent dans `lib/tasks/taskService.js`.
 */
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { buildInClauseParams } = require('../shared/httpHelpers');
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
const { mapExists } = require('../mapQueries');

/** Exécuteur par défaut : le pool (avec `withTransaction` disponible). */
const defaultDb = { queryAll, queryOne, execute, withTransaction };

async function parseOptionalAuth(req) {
  return parseOptionalForetAuth(req, { jwtSecret: JWT_SECRET, hydrateAuthFromTokenClaims });
}

async function recalculateTaskStatus(taskLike, dbx = defaultDb) {
  return recalculateTaskStatusWithConn({ queryOne: dbx.queryOne, execute: dbx.execute }, taskLike);
}

/**
 * Valide les listes de zones/repères, vérifie une carte unique, retourne mapId résolu ou erreur.
 */
async function validateTaskLocations(zoneIds, markerIds, explicitMapId) {
  const mapIds = new Set();
  // Chargement groupé (une requête par famille) au lieu d'un getZone/getMarker par id (N+1).
  // La validation se fait ensuite en mémoire pour conserver le comportement observable :
  // priorité aux zones (avant les repères), mêmes messages d'erreur, mêmes map_id agrégés.
  if (zoneIds.length > 0) {
    // Un id falsy était traité comme « introuvable » par getZone() (getZone(null) -> null).
    if (zoneIds.some((zid) => !zid)) return { error: 'Zone introuvable' };
    const { clause, params } = buildInClauseParams(zoneIds);
    const rows = await queryAll(`SELECT id, map_id FROM zones WHERE id IN ${clause}`, params);
    const zoneById = new Map(rows.map((r) => [String(r.id), r]));
    for (const zid of zoneIds) {
      const zone = zoneById.get(String(zid));
      if (!zone) return { error: 'Zone introuvable' };
      mapIds.add(zone.map_id);
    }
  }
  if (markerIds.length > 0) {
    if (markerIds.some((mid) => !mid)) return { error: 'Repère introuvable' };
    const { clause, params } = buildInClauseParams(markerIds);
    const rows = await queryAll(`SELECT id, map_id FROM map_markers WHERE id IN ${clause}`, params);
    const markerById = new Map(rows.map((r) => [String(r.id), r]));
    for (const mid of markerIds) {
      const marker = markerById.get(String(mid));
      if (!marker) return { error: 'Repère introuvable' };
      mapIds.add(marker.map_id);
    }
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

/**
 * Tutoriels liés aux tâches.
 * @param {string[]} taskIds
 * @param {{ includeSources?: boolean }} [options] — `includeSources:false` pour les listes
 *   de polling (omet `source_url` / `source_file_path` ; l’aperçu peut les résoudre via le
 *   catalogue `/api/tutorials` ou `GET /api/tasks/:id`).
 */
async function fetchTutorialsForTasks(taskIds, options = {}) {
  if (!taskIds.length) return new Map();
  const includeSources = options.includeSources !== false;
  const ph = taskIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT tt.task_id, tu.id AS tutorial_id, tu.title, tu.slug, tu.type
            ${includeSources ? ', tu.source_url, tu.source_file_path' : ''}
       FROM task_tutorials tt
       INNER JOIN tutorials tu ON tu.id = tt.tutorial_id
      WHERE tt.task_id IN (${ph}) AND tu.is_active = 1
      ORDER BY tu.sort_order ASC, tu.title ASC`,
    taskIds,
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.task_id)) m.set(r.task_id, []);
    const item = {
      id: Number(r.tutorial_id),
      title: r.title,
      slug: r.slug,
      type: r.type,
    };
    if (includeSources) {
      item.source_url = r.source_url;
      item.source_file_path = r.source_file_path;
    }
    m.get(r.task_id).push(item);
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

// --- Lectures unitaires et écritures de la mise à jour d'une tâche (B5) -----------------------
// Extraites de l'ancien handler `PUT /api/tasks/:id` (routes/tasks.js) : SQL inchangé, rendu
// seulement réutilisable (exécuteur `dbx` : pool par défaut, ou `tx` d'une transaction).

/** Ligne `tasks` complète, ou `null`. */
async function getTaskRowById(taskId, dbx = defaultDb) {
  return dbx.queryOne('SELECT * FROM tasks WHERE id = ?', [taskId]);
}

/** Projet de tâches minimal (`id, map_id, title, status`), ou `null` si l'identifiant est vide. */
async function getTaskProject(projectId, dbx = defaultDb) {
  if (!projectId) return null;
  return dbx.queryOne('SELECT id, map_id, title, status FROM task_projects WHERE id = ?', [
    projectId,
  ]);
}

async function getTaskZoneIds(taskId, dbx = defaultDb) {
  const rows = await dbx.queryAll(
    'SELECT zone_id FROM task_zones WHERE task_id = ? ORDER BY zone_id',
    [taskId],
  );
  return rows.map((r) => r.zone_id);
}

async function getTaskMarkerIds(taskId, dbx = defaultDb) {
  const rows = await dbx.queryAll(
    'SELECT marker_id FROM task_markers WHERE task_id = ? ORDER BY marker_id',
    [taskId],
  );
  return rows.map((r) => r.marker_id);
}

async function getTaskTutorialIds(taskId, dbx = defaultDb) {
  const rows = await dbx.queryAll(
    'SELECT tutorial_id FROM task_tutorials WHERE task_id = ? ORDER BY tutorial_id',
    [taskId],
  );
  return rows.map((r) => Number(r.tutorial_id));
}

async function getTaskReferentIds(taskId, dbx = defaultDb) {
  const rows = await dbx.queryAll(
    'SELECT user_id FROM task_referents WHERE task_id = ? ORDER BY user_id',
    [taskId],
  );
  return rows.map((r) => String(r.user_id));
}

/** Comptes actifs (enseignant ou élève) parmi `userIds` : lignes `{ id, user_type }`. */
async function findActiveReferentUsers(userIds, dbx = defaultDb) {
  if (!userIds.length) return [];
  const placeholders = userIds.map(() => '?').join(',');
  return dbx.queryAll(
    `SELECT id, user_type FROM users
      WHERE id IN (${placeholders}) AND is_active = 1 AND user_type IN ('teacher','student')`,
    userIds,
  );
}

/** Tutoriels actifs parmi `tutorialIds` : lignes `{ id }`. */
async function findActiveTutorialIds(tutorialIds, dbx = defaultDb) {
  if (!tutorialIds.length) return [];
  const placeholders = tutorialIds.map(() => '?').join(',');
  return dbx.queryAll(
    `SELECT id FROM tutorials WHERE id IN (${placeholders}) AND is_active = 1`,
    tutorialIds,
  );
}

/** Séance pédagogique désignée par son identifiant OU son slug : `{ id }` ou `null`. */
async function findPedagoSessionByKey(key, dbx = defaultDb) {
  return dbx.queryOne('SELECT id FROM pedago_sessions WHERE id = ? OR slug = ? LIMIT 1', [
    key,
    key,
  ]);
}

let recurrenceTemplateColumnsReady = null;

/**
 * Présence des colonnes `recurrence_template_*` (migration 051), mémorisée pour le processus.
 * Une écriture qui découvre leur absence (`persistDetachedLocationsSnapshot`) remet le cache à
 * `false`.
 */
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
 * Mémorise les zones/repères d'une tâche **avant** qu'une validation ne l'en détache.
 *
 * Deux usages, un seul enregistrement (colonnes `recurrence_template_*`, migration 051) :
 * - le job de récurrence y reprend les lieux de l'occurrence suivante ;
 * - une tâche remise à un statut actif y retrouve les siens (`restoreDetachedLocations` du
 *   service des tâches).
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

/** Ancre de récurrence (migration 258) : date de départ de la série, ou `null`. */
async function setTaskRecurrenceAnchor(taskId, anchorDate, dbx = defaultDb) {
  await dbx.execute('UPDATE tasks SET recurrence_anchor_date = ? WHERE id = ?', [
    anchorDate || null,
    taskId,
  ]);
}

/**
 * Réécrit les champs éditables d'une tâche (UPDATE unique de l'ancien `PUT`).
 * `recurrenceSeriesId` n'écrase jamais une série existante (`COALESCE`).
 */
async function updateTaskEditableFields(taskId, fields, dbx = defaultDb) {
  await dbx.execute(
    'UPDATE tasks SET title=?, description=?, map_id=?, project_id=?, group_id=?, zone_id=?, marker_id=?, start_date=?, due_date=?, required_students=?, status=?, completion_mode=?, danger_level=?, difficulty_level=?, importance_level=?, recurrence=?, recurrence_series_id=COALESCE(?, recurrence_series_id), pedago_session_id=? WHERE id=?',
    [
      fields.title,
      fields.description,
      fields.mapId,
      fields.projectId,
      fields.groupId,
      fields.zoneId,
      fields.markerId,
      fields.startDate,
      fields.dueDate,
      fields.requiredStudents,
      fields.status,
      fields.completionMode,
      fields.dangerLevel,
      fields.difficultyLevel,
      fields.importanceLevel,
      fields.recurrence,
      fields.recurrenceSeriesId,
      fields.pedagoSessionId,
      taskId,
    ],
  );
}

/** Horodatage de validation (référence de l'archivage automatique). */
async function markTaskValidatedNow(taskId, dbx = defaultDb) {
  await dbx.execute('UPDATE tasks SET validated_at = NOW() WHERE id = ?', [taskId]);
}

/** Chemin relatif (sous `uploads/`) de l'image de la tâche, ou `null` pour la retirer. */
async function setTaskImagePath(taskId, imagePath, dbx = defaultDb) {
  if (imagePath == null) {
    await dbx.execute('UPDATE tasks SET image_path = NULL WHERE id = ?', [taskId]);
    return;
  }
  await dbx.execute('UPDATE tasks SET image_path = ? WHERE id = ?', [imagePath, taskId]);
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
  getTaskRowById,
  getTaskProject,
  getTaskZoneIds,
  getTaskMarkerIds,
  getTaskTutorialIds,
  getTaskReferentIds,
  findActiveReferentUsers,
  findActiveTutorialIds,
  findPedagoSessionByKey,
  hasRecurrenceTemplateColumns,
  persistDetachedLocationsSnapshot,
  setTaskRecurrenceAnchor,
  updateTaskEditableFields,
  markTaskValidatedNow,
  setTaskImagePath,
};
