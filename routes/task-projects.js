const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitTasksChanged } = require('../lib/realtime');
const { logAudit } = require('./audit');

const router = express.Router();
/** Statuts acceptés sur POST/PUT corps JSON (pas `completed` : réservé à la synchro tâches). */
const PROJECT_STATUSES_API_WRITE = new Set(['active', 'on_hold']);

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeProjectStatusForApi(value, fallback = 'active') {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return fallback;
  if (raw === 'en_attente' || raw === 'en attente' || raw === 'attente') return 'on_hold';
  return PROJECT_STATUSES_API_WRITE.has(raw) ? raw : '';
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

async function ensureMapExists(mapId) {
  const map = await queryOne('SELECT id FROM maps WHERE id = ?', [mapId]);
  return !!map;
}

async function getProjectZoneIds(projectId) {
  const rows = await queryAll('SELECT zone_id FROM project_zones WHERE project_id = ? ORDER BY zone_id', [projectId]);
  return rows.map((r) => r.zone_id);
}

async function getProjectMarkerIds(projectId) {
  const rows = await queryAll('SELECT marker_id FROM project_markers WHERE project_id = ? ORDER BY marker_id', [projectId]);
  return rows.map((r) => r.marker_id);
}

async function getProjectTutorialIds(projectId) {
  const rows = await queryAll('SELECT tutorial_id FROM project_tutorials WHERE project_id = ? ORDER BY tutorial_id', [projectId]);
  return rows.map((r) => Number(r.tutorial_id));
}

async function setProjectZones(projectId, zoneIds) {
  await execute('DELETE FROM project_zones WHERE project_id = ?', [projectId]);
  for (const zid of zoneIds) {
    await execute('INSERT INTO project_zones (project_id, zone_id) VALUES (?, ?)', [projectId, zid]);
  }
}

async function setProjectMarkers(projectId, markerIds) {
  await execute('DELETE FROM project_markers WHERE project_id = ?', [projectId]);
  for (const mid of markerIds) {
    await execute('INSERT INTO project_markers (project_id, marker_id) VALUES (?, ?)', [projectId, mid]);
  }
}

async function setProjectTutorials(projectId, tutorialIds) {
  await execute('DELETE FROM project_tutorials WHERE project_id = ?', [projectId]);
  for (const tid of tutorialIds) {
    await execute('INSERT INTO project_tutorials (project_id, tutorial_id) VALUES (?, ?)', [projectId, tid]);
  }
}

async function validateProjectLinksForMap(mapId, zoneIds, markerIds) {
  for (const zid of zoneIds) {
    const zone = await queryOne('SELECT map_id FROM zones WHERE id = ?', [zid]);
    if (!zone) return { error: 'Zone introuvable' };
    if (zone.map_id !== mapId) return { error: 'Une zone ne fait pas partie de la carte du projet' };
  }
  for (const mid of markerIds) {
    const marker = await queryOne('SELECT map_id FROM map_markers WHERE id = ?', [mid]);
    if (!marker) return { error: 'Repère introuvable' };
    if (marker.map_id !== mapId) return { error: 'Un repère ne fait pas partie de la carte du projet' };
  }
  return {};
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

async function fetchZonesForProjects(projectIds) {
  if (!projectIds.length) return new Map();
  const ph = projectIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT pz.project_id, z.id AS zone_id, z.name AS zone_name, z.map_id
       FROM project_zones pz
       INNER JOIN zones z ON z.id = pz.zone_id
      WHERE pz.project_id IN (${ph})
      ORDER BY z.name`,
    projectIds
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.project_id)) m.set(r.project_id, []);
    m.get(r.project_id).push({ id: r.zone_id, name: r.zone_name, map_id: r.map_id });
  }
  return m;
}

async function fetchMarkersForProjects(projectIds) {
  if (!projectIds.length) return new Map();
  const ph = projectIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT pm.project_id, mk.id AS marker_id, mk.label AS marker_label, mk.map_id
       FROM project_markers pm
       INNER JOIN map_markers mk ON mk.id = pm.marker_id
      WHERE pm.project_id IN (${ph})
      ORDER BY mk.label`,
    projectIds
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.project_id)) m.set(r.project_id, []);
    m.get(r.project_id).push({ id: r.marker_id, label: r.marker_label, map_id: r.map_id });
  }
  return m;
}

async function fetchTutorialsForProjects(projectIds) {
  if (!projectIds.length) return new Map();
  const ph = projectIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT pt.project_id, tu.id AS tutorial_id, tu.title, tu.slug, tu.type, tu.source_url, tu.source_file_path
       FROM project_tutorials pt
       INNER JOIN tutorials tu ON tu.id = pt.tutorial_id
      WHERE pt.project_id IN (${ph}) AND tu.is_active = 1
      ORDER BY tu.sort_order ASC, tu.title ASC`,
    projectIds
  );
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.project_id)) m.set(r.project_id, []);
    m.get(r.project_id).push({
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

function enrichProjectRow(project, zonesLinked, markersLinked, tutorialsLinked) {
  const zl = zonesLinked || [];
  const ml = markersLinked || [];
  const tl = tutorialsLinked || [];
  project.zone_ids = zl.map((z) => z.id);
  project.marker_ids = ml.map((x) => x.id);
  project.tutorial_ids = tl.map((x) => Number(x.id));
  project.zones_linked = zl.map((z) => ({ id: z.id, name: z.name }));
  project.markers_linked = ml.map((x) => ({ id: x.id, label: x.label }));
  project.tutorials_linked = tl.map((x) => ({
    id: Number(x.id),
    title: x.title,
    slug: x.slug,
    type: x.type,
    source_url: x.source_url || null,
    source_file_path: x.source_file_path || null,
  }));
}

async function enrichProjects(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const [zm, mm, tm] = await Promise.all([
    fetchZonesForProjects(ids),
    fetchMarkersForProjects(ids),
    fetchTutorialsForProjects(ids),
  ]);
  return rows.map((r) => {
    const copy = { ...r };
    enrichProjectRow(copy, zm.get(r.id), mm.get(r.id), tm.get(r.id));
    return copy;
  });
}

async function loadProjectRow(projectId) {
  const row = await queryOne(
    `SELECT p.*, m.label AS map_label
       FROM task_projects p
       INNER JOIN maps m ON m.id = p.map_id
      WHERE p.id = ?`,
    [projectId]
  );
  if (!row) return null;
  const [zm, mm, tm] = await Promise.all([
    fetchZonesForProjects([projectId]),
    fetchMarkersForProjects([projectId]),
    fetchTutorialsForProjects([projectId]),
  ]);
  enrichProjectRow(row, zm.get(projectId), mm.get(projectId), tm.get(projectId));
  return row;
}

router.get('/', async (req, res) => {
  try {
    const mapId = normalizeText(req.query.map_id);
    if (mapId && !(await ensureMapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }

    const sql = `
      SELECT p.*, m.label AS map_label
      FROM task_projects p
      INNER JOIN maps m ON m.id = p.map_id
      ${mapId ? 'WHERE p.map_id = ?' : ''}
      ORDER BY p.created_at DESC, p.title ASC
    `;
    const rows = mapId ? await queryAll(sql, [mapId]) : await queryAll(sql);
    res.json(await enrichProjects(rows));
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mapId = normalizeText(req.body.map_id);
    const title = normalizeText(req.body.title);
    const description = normalizeText(req.body.description) || null;
    const status = normalizeProjectStatusForApi(req.body.status, 'active');
    const zoneIds = normalizeIdArray(req.body.zone_ids);
    const markerIds = normalizeIdArray(req.body.marker_ids);
    const tutorialIds = normalizeTutorialIdArray(req.body.tutorial_ids);

    if (!mapId) return res.status(400).json({ error: 'Carte requise' });
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (!status) return res.status(400).json({ error: 'Statut projet invalide' });
    if (!(await ensureMapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const loc = await validateProjectLinksForMap(mapId, zoneIds, markerIds);
    if (loc.error) return res.status(400).json({ error: loc.error });
    const tuto = await validateTutorialIds(tutorialIds);
    if (tuto.error) return res.status(400).json({ error: tuto.error });

    const id = uuidv4();
    const createdAt = new Date().toISOString();
    await execute(
      'INSERT INTO task_projects (id, map_id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, mapId, title, description, status, createdAt]
    );
    await setProjectZones(id, zoneIds);
    await setProjectMarkers(id, markerIds);
    await setProjectTutorials(id, tutorialIds);

    const created = await loadProjectRow(id);
    emitTasksChanged({ reason: 'project_create', projectId: id, mapId });
    res.status(201).json(created);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM task_projects WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Projet introuvable' });

    const nextMapId = req.body.map_id !== undefined ? normalizeText(req.body.map_id) : existing.map_id;
    const nextTitle = req.body.title !== undefined ? normalizeText(req.body.title) : existing.title;
    const nextDescription = req.body.description !== undefined ? normalizeText(req.body.description) || null : existing.description;
    const nextStatus = req.body.status !== undefined
      ? normalizeProjectStatusForApi(req.body.status, 'active')
      : (existing.status || 'active');

    let nextZoneIds;
    if (Object.prototype.hasOwnProperty.call(req.body, 'zone_ids')) {
      nextZoneIds = normalizeIdArray(req.body.zone_ids);
    } else {
      nextZoneIds = await getProjectZoneIds(req.params.id);
    }

    let nextMarkerIds;
    if (Object.prototype.hasOwnProperty.call(req.body, 'marker_ids')) {
      nextMarkerIds = normalizeIdArray(req.body.marker_ids);
    } else {
      nextMarkerIds = await getProjectMarkerIds(req.params.id);
    }

    let nextTutorialIds;
    if (Object.prototype.hasOwnProperty.call(req.body, 'tutorial_ids')) {
      nextTutorialIds = normalizeTutorialIdArray(req.body.tutorial_ids);
    } else {
      nextTutorialIds = await getProjectTutorialIds(req.params.id);
    }

    if (!nextMapId) return res.status(400).json({ error: 'Carte requise' });
    if (!nextTitle) return res.status(400).json({ error: 'Titre requis' });
    if (!nextStatus) return res.status(400).json({ error: 'Statut projet invalide' });
    if (!(await ensureMapExists(nextMapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const loc = await validateProjectLinksForMap(nextMapId, nextZoneIds, nextMarkerIds);
    if (loc.error) return res.status(400).json({ error: loc.error });
    const tuto = await validateTutorialIds(nextTutorialIds);
    if (tuto.error) return res.status(400).json({ error: tuto.error });

    await execute('UPDATE task_projects SET map_id = ?, title = ?, description = ?, status = ? WHERE id = ?', [
      nextMapId,
      nextTitle,
      nextDescription,
      nextStatus,
      req.params.id,
    ]);
    await setProjectZones(req.params.id, nextZoneIds);
    await setProjectMarkers(req.params.id, nextMarkerIds);
    await setProjectTutorials(req.params.id, nextTutorialIds);

    const updated = await loadProjectRow(req.params.id);
    emitTasksChanged({ reason: 'project_update', projectId: req.params.id, mapId: nextMapId });
    res.json(updated);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const existing = await queryOne('SELECT id, map_id FROM task_projects WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Projet introuvable' });
    await execute('DELETE FROM task_projects WHERE id = ?', [req.params.id]);
    emitTasksChanged({ reason: 'project_delete', projectId: req.params.id, mapId: existing.map_id });
    res.json({ success: true });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/validate', requirePermission('tasks.validate', { needsElevation: true }), async (req, res) => {
  try {
    const existing = await queryOne('SELECT id, map_id, title, status FROM task_projects WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Projet introuvable' });

    const cur = String(existing.status || 'active').trim().toLowerCase();
    if (cur === 'validated') {
      const unchanged = await loadProjectRow(req.params.id);
      return res.json(unchanged);
    }

    await execute('UPDATE task_projects SET status = ? WHERE id = ?', ['validated', req.params.id]);
    const updated = await loadProjectRow(req.params.id);
    logAudit('validate_task_project', 'task_project', req.params.id, existing.title || 'Projet', {
      req,
      payload: { previous_status: cur, map_id: existing.map_id },
    });
    emitTasksChanged({ reason: 'project_validate', projectId: req.params.id, mapId: existing.map_id });
    res.json(updated);
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: err.message });
  }
});

function duplicateTitleSuffix(title) {
  const base = normalizeText(title) || 'Projet';
  return base.endsWith(' (copie)') ? base : `${base} (copie)`;
}

function currentLocalDateOnly() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function copyProjectLinksTx(tx, sourceProjectId, targetProjectId) {
  const zoneRows = await tx.queryAll(
    'SELECT zone_id FROM project_zones WHERE project_id = ? ORDER BY zone_id',
    [sourceProjectId]
  );
  for (const row of zoneRows) {
    await tx.execute('INSERT INTO project_zones (project_id, zone_id) VALUES (?, ?)', [
      targetProjectId,
      row.zone_id,
    ]);
  }

  const markerRows = await tx.queryAll(
    'SELECT marker_id FROM project_markers WHERE project_id = ? ORDER BY marker_id',
    [sourceProjectId]
  );
  for (const row of markerRows) {
    await tx.execute('INSERT INTO project_markers (project_id, marker_id) VALUES (?, ?)', [
      targetProjectId,
      row.marker_id,
    ]);
  }

  const tutorialRows = await tx.queryAll(
    'SELECT tutorial_id FROM project_tutorials WHERE project_id = ? ORDER BY tutorial_id',
    [sourceProjectId]
  );
  for (const row of tutorialRows) {
    await tx.execute('INSERT INTO project_tutorials (project_id, tutorial_id) VALUES (?, ?)', [
      targetProjectId,
      row.tutorial_id,
    ]);
  }
}

async function copyProjectTasksTx(tx, sourceProjectId, targetProjectId, mapId) {
  const sourceTasks = await tx.queryAll(
    `SELECT id, title, description, zone_id, marker_id, start_date, due_date, required_students,
            completion_mode, danger_level, difficulty_level, importance_level, living_beings,
            recurrence, sort_order
       FROM tasks
      WHERE project_id = ?
      ORDER BY sort_order ASC, created_at ASC, title ASC`,
    [sourceProjectId]
  );

  const createdTaskIds = [];
  const duplicatedStartDate = currentLocalDateOnly();
  for (const task of sourceTasks) {
    const newTaskId = uuidv4();
    const createdAt = new Date().toISOString();
    await tx.execute(
      `INSERT INTO tasks (
        id, title, description, map_id, project_id, zone_id, marker_id,
        start_date, due_date, required_students, completion_mode, danger_level, difficulty_level,
        importance_level, living_beings, recurrence, sort_order, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newTaskId,
        task.title,
        task.description || '',
        mapId,
        targetProjectId,
        task.zone_id || null,
        task.marker_id || null,
        duplicatedStartDate,
        task.due_date || null,
        task.required_students != null ? Number(task.required_students) : 1,
        task.completion_mode || 'single_done',
        task.danger_level || null,
        task.difficulty_level || null,
        task.importance_level || null,
        task.living_beings || null,
        task.recurrence || null,
        Number(task.sort_order) || 0,
        'available',
        createdAt,
      ]
    );

    const zoneRows = await tx.queryAll('SELECT zone_id FROM task_zones WHERE task_id = ?', [task.id]);
    const zoneIds = [...new Set([
      ...zoneRows.map((row) => String(row.zone_id || '').trim()).filter(Boolean),
      task.zone_id != null ? String(task.zone_id).trim() : '',
    ].filter(Boolean))];
    for (const zoneId of zoneIds) {
      await tx.execute('INSERT INTO task_zones (task_id, zone_id) VALUES (?, ?)', [newTaskId, zoneId]);
    }
    const markerRows = await tx.queryAll('SELECT marker_id FROM task_markers WHERE task_id = ?', [task.id]);
    const markerIds = [...new Set([
      ...markerRows.map((row) => String(row.marker_id || '').trim()).filter(Boolean),
      task.marker_id != null ? String(task.marker_id).trim() : '',
    ].filter(Boolean))];
    for (const markerId of markerIds) {
      await tx.execute('INSERT INTO task_markers (task_id, marker_id) VALUES (?, ?)', [newTaskId, markerId]);
    }
    const tutorialRows = await tx.queryAll('SELECT tutorial_id FROM task_tutorials WHERE task_id = ?', [task.id]);
    for (const tr of tutorialRows) {
      await tx.execute('INSERT INTO task_tutorials (task_id, tutorial_id) VALUES (?, ?)', [
        newTaskId,
        tr.tutorial_id,
      ]);
    }

    createdTaskIds.push(newTaskId);
  }
  return createdTaskIds;
}

router.post('/:id/duplicate', requirePermission('tasks.manage', { needsElevation: true }), async (req, res) => {
  try {
    const source = await queryOne('SELECT * FROM task_projects WHERE id = ?', [req.params.id]);
    if (!source) return res.status(404).json({ error: 'Projet introuvable' });

    const requestedTitle = req.body?.title !== undefined ? normalizeText(req.body.title) : '';
    const nextTitle = requestedTitle || duplicateTitleSuffix(source.title);
    if (!nextTitle) return res.status(400).json({ error: 'Titre requis' });

    const nextMapId = req.body?.map_id !== undefined ? normalizeText(req.body.map_id) : source.map_id;
    if (!nextMapId) return res.status(400).json({ error: 'Carte requise' });
    if (!(await ensureMapExists(nextMapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const newProjectId = uuidv4();
    const createdAt = new Date().toISOString();

    const createdTaskIds = await withTransaction(async (tx) => {
      await tx.execute(
        'INSERT INTO task_projects (id, map_id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newProjectId, nextMapId, nextTitle, source.description || null, 'active', createdAt]
      );
      await copyProjectLinksTx(tx, source.id, newProjectId);
      return copyProjectTasksTx(tx, source.id, newProjectId, nextMapId);
    });

    const created = await loadProjectRow(newProjectId);
    logAudit('duplicate_task_project', 'task_project', newProjectId, nextTitle, {
      req,
      payload: {
        source_project_id: source.id,
        map_id: nextMapId,
        tasks_copied: createdTaskIds.length,
      },
    });
    emitTasksChanged({
      reason: 'project_duplicate',
      projectId: newProjectId,
      mapId: nextMapId,
    });
    res.status(201).json({
      project: created,
      source_project_id: source.id,
      tasks_copied: createdTaskIds.length,
      task_ids: createdTaskIds,
    });
  } catch (err) {
    logRouteError(err, req);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
