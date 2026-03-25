const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { saveBase64ToDisk, getAbsolutePath } = require('../lib/uploads');
const { logRouteError } = require('../lib/routeLog');
const { logAudit } = require('./audit');
const { emitTasksChanged } = require('../lib/realtime');
const { ensurePrimaryRole, buildAuthzPayload, verifyRolePin } = require('../lib/rbac');

const router = express.Router();

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
    'SELECT id, map_id, title FROM task_projects WHERE id = ?',
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

async function getTaskTutorialIds(taskId) {
  const rows = await queryAll('SELECT tutorial_id FROM task_tutorials WHERE task_id = ? ORDER BY tutorial_id', [taskId]);
  return rows.map((r) => Number(r.tutorial_id));
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

function enrichTaskRow(task, zonesLinked, markersLinked, tutorialsLinked) {
  const zl = zonesLinked || [];
  const ml = markersLinked || [];
  const tl = tutorialsLinked || [];
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
            tp.map_id AS project_map_id, tp.title AS project_title
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
  enrichTaskRow(task, zm.get(taskId), mm.get(taskId), tm.get(taskId));
  if (!task.zone_name && task.zone_name_legacy) task.zone_name = task.zone_name_legacy;
  if (!task.marker_label && task.marker_label_legacy) task.marker_label = task.marker_label_legacy;
  delete task.zone_name_legacy;
  delete task.marker_label_legacy;
  const m = await queryOne('SELECT id, label FROM maps WHERE id = ?', [task.map_id_resolved]);
  task.map_label = m ? m.label : null;
  task.assignments = await queryAll('SELECT * FROM task_assignments WHERE task_id = ? ORDER BY assigned_at', [taskId]);
  return task;
}

async function ensureStudentPermission({ studentId, permissionKey, profilePin }) {
  await ensurePrimaryRole('student', studentId, 'eleve_novice');
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

router.get('/', async (req, res) => {
  try {
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
             tp.map_id AS project_map_id, tp.title AS project_title,
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
    const zm = await fetchZonesForTasks(taskIds);
    const mm = await fetchMarkersForTasks(taskIds);
    const tutorialsMap = await fetchTutorialsForTasks(taskIds);
    const assignments = await queryAll('SELECT * FROM task_assignments');
    const enriched = tasks.map((t) => {
      const row = { ...t };
      enrichTaskRow(row, zm.get(t.id), mm.get(t.id), tutorialsMap.get(t.id));
      delete row.map_id_resolved_join;
      row.assignments = assignments.filter((a) => a.task_id === t.id);
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
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    res.json(task);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const { title, description, zone_id, marker_id, zone_ids, marker_ids, tutorial_ids, map_id, project_id, due_date, required_students, recurrence } = req.body;
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

    const reqStudents = sanitizeRequiredStudents(required_students);
    const id = uuidv4();
    await execute(
      'INSERT INTO tasks (id, title, description, map_id, project_id, zone_id, marker_id, due_date, required_students, recurrence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        title,
        description || '',
        projectValidation.mapId,
        projectValidation.projectId,
        zIds[0] || null,
        mIds[0] || null,
        due_date || null,
        reqStudents,
        recurrence || null,
        new Date().toISOString(),
      ]
    );
    await setTaskZones(id, zIds);
    await setTaskMarkers(id, mIds);
    await setTaskTutorials(id, tutorialIds);
    await syncLegacyLocationColumns(id, zIds, mIds);
    const task = await getTaskWithAssignments(id);
    logAudit('create_task', 'task', id, title, {
      req,
      payload: { map_id: projectValidation.mapId, project_id: projectValidation.projectId || null },
    });
    emitTasksChanged({ reason: 'create_task', taskId: id, projectId: projectValidation.projectId || null });
    res.status(201).json(task);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
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
      due_date,
      firstName,
      lastName,
      studentId,
      profilePin,
    } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Titre requis' });
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });
    if (!studentId) return res.status(400).json({ error: 'Identifiant élève requis' });

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

    const id = uuidv4();
    const proposer = `${String(firstName).trim()} ${String(lastName).trim()}`.trim();
    const baseDescription = description ? String(description).trim() : '';
    const finalDescription = [baseDescription, proposer ? `Proposition élève: ${proposer}` : '']
      .filter(Boolean)
      .join('\n\n');
    await execute(
      'INSERT INTO tasks (id, title, description, map_id, zone_id, marker_id, due_date, required_students, status, recurrence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        String(title).trim(),
        finalDescription,
        loc.mapId,
        zIds[0] || null,
        mIds[0] || null,
        due_date || null,
        1,
        'proposed',
        null,
        new Date().toISOString(),
      ]
    );
    await setTaskZones(id, zIds);
    await setTaskMarkers(id, mIds);
    await setTaskTutorials(id, []);
    await syncLegacyLocationColumns(id, zIds, mIds);
    const task = await getTaskWithAssignments(id);
    logAudit('propose_task', 'task', id, `${String(title).trim()} (${proposer})`, {
      req,
      actorUserType: 'student',
      actorUserId: studentId,
      payload: { proposer, student_id: studentId },
    });
    emitTasksChanged({ reason: 'propose_task', taskId: id });
    res.status(201).json(task);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    const {
      title,
      description,
      zone_id,
      marker_id,
      zone_ids,
      marker_ids,
      tutorial_ids,
      map_id,
      due_date,
      required_students,
      status,
      recurrence,
      project_id,
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
    const nextProjectId = Object.prototype.hasOwnProperty.call(req.body, 'project_id')
      ? normalizeOptionalId(project_id)
      : task.project_id || null;
    const projectValidation = await validateTaskProject(nextProjectId, loc.mapId);
    if (projectValidation.error) return res.status(400).json({ error: projectValidation.error });

    let nextTutorialIds;
    if (Object.prototype.hasOwnProperty.call(req.body, 'tutorial_ids')) {
      nextTutorialIds = normalizeTutorialIdArray(tutorial_ids);
    } else {
      nextTutorialIds = await getTaskTutorialIds(task.id);
    }
    const tutorialValidation = await validateTutorialIds(nextTutorialIds);
    if (tutorialValidation.error) return res.status(400).json({ error: tutorialValidation.error });

    const reqStudents = required_students != null ? sanitizeRequiredStudents(required_students) : task.required_students;
    await execute(
      'UPDATE tasks SET title=?, description=?, map_id=?, project_id=?, zone_id=?, marker_id=?, due_date=?, required_students=?, status=?, recurrence=? WHERE id=?',
      [
        title ?? task.title,
        description ?? task.description,
        projectValidation.mapId,
        projectValidation.projectId,
        nextZoneIds[0] || null,
        nextMarkerIds[0] || null,
        due_date ?? task.due_date,
        reqStudents,
        status ?? task.status,
        recurrence !== undefined ? recurrence || null : task.recurrence || null,
        task.id,
      ]
    );
    await setTaskZones(task.id, nextZoneIds);
    await setTaskMarkers(task.id, nextMarkerIds);
    await setTaskTutorials(task.id, nextTutorialIds);
    await syncLegacyLocationColumns(task.id, nextZoneIds, nextMarkerIds);
    const updated = await getTaskWithAssignments(task.id);
    logAudit('update_task', 'task', task.id, updated.title, {
      req,
      payload: {
        status: updated.status,
        required_students: updated.required_students,
        project_id: updated.project_id || null,
      },
    });
    emitTasksChanged({ reason: 'update_task', taskId: task.id, projectId: projectValidation.projectId || null });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
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
    emitTasksChanged({ reason: 'delete_task', taskId: req.params.id });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/assign', async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status === 'validated') return res.status(400).json({ error: 'Tâche déjà validée' });

    const { firstName, lastName, studentId, profilePin } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });

    if (studentId) {
      const exists = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [studentId]);
      if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
      const permission = await ensureStudentPermission({ studentId, permissionKey: 'tasks.assign_self', profilePin });
      if (!permission.ok) return res.status(403).json({ error: permission.error });
    }

    const already = task.assignments.find(
      (a) =>
        String(a.student_first_name).toLowerCase() === firstName.toLowerCase() &&
        String(a.student_last_name).toLowerCase() === lastName.toLowerCase()
    );
    if (already) return res.status(400).json({ error: 'Déjà assigné à cette tâche' });

    if (task.assignments.length >= task.required_students) {
      return res.status(400).json({ error: 'Plus de place disponible sur cette tâche' });
    }

    await execute(
      'INSERT INTO task_assignments (task_id, student_id, student_first_name, student_last_name, assigned_at) VALUES (?, ?, ?, ?, ?)',
      [task.id, studentId || null, firstName, lastName, new Date().toISOString()]
    );

    const newCount = task.assignments.length + 1;
    const newStatus = newCount > 0 ? 'in_progress' : 'available';
    await execute('UPDATE tasks SET status = ? WHERE id = ?', [newStatus, task.id]);

    const updated = await getTaskWithAssignments(task.id);
    logAudit('assign_task', 'task', task.id, `${firstName} ${lastName}`, {
      req,
      actorUserType: studentId ? 'student' : null,
      actorUserId: studentId || null,
      payload: { student_id: studentId || null, status: newStatus },
    });
    emitTasksChanged({ reason: 'assign', taskId: task.id });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/done', async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });

    const { comment, imageData, firstName, lastName, studentId, profilePin } = req.body || {};

    if (studentId) {
      const exists = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [studentId]);
      if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
      const permission = await ensureStudentPermission({ studentId, permissionKey: 'tasks.done_self', profilePin });
      if (!permission.ok) return res.status(403).json({ error: permission.error });
    }

    if (comment || imageData) {
      const result = await execute(
        'INSERT INTO task_logs (task_id, student_id, student_first_name, student_last_name, comment, image_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [task.id, studentId || null, firstName || '', lastName || '', comment || '', null, new Date().toISOString()]
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

    await execute("UPDATE tasks SET status = 'done' WHERE id = ?", [task.id]);
    const updated = await getTaskWithAssignments(task.id);
    logAudit('done_task', 'task', task.id, `${firstName || ''} ${lastName || ''}`.trim(), {
      req,
      actorUserType: studentId ? 'student' : null,
      actorUserId: studentId || null,
      payload: { student_id: studentId || null, with_comment: !!comment, with_image: !!imageData },
    });
    emitTasksChanged({ reason: 'done', taskId: task.id });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
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
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
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
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/logs/:logId', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const log = await queryOne('SELECT * FROM task_logs WHERE id = ? AND task_id = ?', [req.params.logId, req.params.id]);
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
    emitTasksChanged({ reason: 'delete_log', taskId: req.params.id });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/validate', requirePermission('tasks.validate', { needsElevation: true }), async (req, res) => {
  try {
    const task = await queryOne('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    await execute("UPDATE tasks SET status = 'validated' WHERE id = ?", [req.params.id]);
    logAudit('validate_task', 'task', req.params.id, task.title, { req });
    const updated = await getTaskWithAssignments(task.id);
    emitTasksChanged({ reason: 'validate', taskId: task.id });
    res.json(updated);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

/** Même modèle que POST assign : l’élève envoie son nom (+ studentId pour compte supprimé) ; pas de JWT élève. */
router.post('/:id/unassign', async (req, res) => {
  try {
    const task = await getTaskWithAssignments(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tâche introuvable' });
    if (task.status === 'done' || task.status === 'validated') {
      return res.status(400).json({ error: 'Impossible de quitter une tâche déjà terminée' });
    }

    const { firstName, lastName, studentId, profilePin } = req.body;
    if (!firstName || !lastName) return res.status(400).json({ error: 'Nom requis' });

    if (studentId) {
      const exists = await queryOne("SELECT id FROM users WHERE user_type = 'student' AND id = ?", [studentId]);
      if (!exists) return res.status(401).json({ error: 'Compte supprimé', deleted: true });
      const permission = await ensureStudentPermission({ studentId, permissionKey: 'tasks.unassign_self', profilePin });
      if (!permission.ok) return res.status(403).json({ error: permission.error });
    }

    if (studentId) {
      await execute(
        'DELETE FROM task_assignments WHERE task_id = ? AND (student_id = ? OR (student_first_name = ? AND student_last_name = ?))',
        [task.id, studentId, firstName, lastName]
      );
    } else {
      await execute(
        'DELETE FROM task_assignments WHERE task_id = ? AND student_first_name = ? AND student_last_name = ?',
        [task.id, firstName, lastName]
      );
    }

    const remainingRow = await queryOne('SELECT COUNT(*) AS c FROM task_assignments WHERE task_id = ?', [task.id]);
    const remaining = remainingRow ? Number(remainingRow.c) : 0;

    let newStatus;
    if (remaining === 0) {
      newStatus = 'available';
    } else if (task.status === 'done') {
      newStatus = 'done';
    } else {
      newStatus = 'in_progress';
    }
    await execute('UPDATE tasks SET status = ? WHERE id = ?', [newStatus, task.id]);

    const updated = await getTaskWithAssignments(task.id);
    logAudit('unassign_task', 'task', task.id, `${firstName} ${lastName}`, {
      req,
      actorUserType: studentId ? 'student' : null,
      actorUserId: studentId || null,
      payload: { student_id: studentId || null, status: newStatus },
    });
    emitTasksChanged({ reason: 'unassign', taskId: task.id });
    res.json(updated);
  } catch (err) {
    logRouteError(err, req, 'Erreur retrait assignation tâche');
    res.status(500).json({ error: 'Erreur lors du retrait : ' + err.message });
  }
});

module.exports = router;
