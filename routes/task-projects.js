const express = require('express');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { emitTasksChanged } = require('../lib/realtime');
const { logAudit } = require('./audit');
const { normalizeIdArray } = require('../lib/taskRouteHelpers');

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

// O7 — Schéma zod du corps de POST / (création projet). Reproduit exactement la validation
// manuelle : normalisation permissive de tous les champs, puis vérification des champs requis
// dans l'ordre map_id → title → status (mêmes messages, statut 400 via lib/validate). Les
// contrôles dépendants de la base (carte/zones/repères/tutoriels) restent dans le handler.
const createProjectBodySchema = z
  .object({})
  .loose()
  .transform((b) => ({
    map_id: normalizeText(b.map_id),
    title: normalizeText(b.title),
    description: normalizeText(b.description) || null,
    status: normalizeProjectStatusForApi(b.status, 'active'),
    zone_ids: normalizeIdArray(b.zone_ids),
    marker_ids: normalizeIdArray(b.marker_ids),
    tutorial_ids: normalizeTutorialIdArray(b.tutorial_ids),
  }))
  .superRefine((d, ctx) => {
    if (!d.map_id) ctx.addIssue({ code: 'custom', message: 'Carte requise', path: [] });
    else if (!d.title) ctx.addIssue({ code: 'custom', message: 'Titre requis', path: [] });
    else if (!d.status)
      ctx.addIssue({ code: 'custom', message: 'Statut projet invalide', path: [] });
  });

async function ensureMapExists(mapId) {
  const map = await queryOne('SELECT id FROM maps WHERE id = ?', [mapId]);
  return !!map;
}

async function getProjectZoneIds(projectId) {
  const rows = await queryAll(
    'SELECT zone_id FROM project_zones WHERE project_id = ? ORDER BY zone_id',
    [projectId],
  );
  return rows.map((r) => r.zone_id);
}

async function getProjectMarkerIds(projectId) {
  const rows = await queryAll(
    'SELECT marker_id FROM project_markers WHERE project_id = ? ORDER BY marker_id',
    [projectId],
  );
  return rows.map((r) => r.marker_id);
}

async function getProjectTutorialIds(projectId) {
  const rows = await queryAll(
    'SELECT tutorial_id FROM project_tutorials WHERE project_id = ? ORDER BY tutorial_id',
    [projectId],
  );
  return rows.map((r) => Number(r.tutorial_id));
}

// DELETE + INSERT multi-valeurs (au lieu d'un INSERT par ligne — N+1).
// `db` : exécuteur SQL (pool global ou transaction `tx`), même contrat `.execute` — permet
// d'écrire projet + liens de façon atomique dans un `withTransaction` (cf. lib/speciesJunction.js).
async function replaceProjectJunctionRows(db, table, childCol, projectId, ids) {
  await db.execute(`DELETE FROM ${table} WHERE project_id = ?`, [projectId]);
  if (!ids.length) return;
  const placeholders = ids.map(() => '(?, ?)').join(', ');
  const params = ids.flatMap((id) => [projectId, id]);
  await db.execute(`INSERT INTO ${table} (project_id, ${childCol}) VALUES ${placeholders}`, params);
}

async function setProjectZones(db, projectId, zoneIds) {
  await replaceProjectJunctionRows(db, 'project_zones', 'zone_id', projectId, zoneIds);
}

async function setProjectMarkers(db, projectId, markerIds) {
  await replaceProjectJunctionRows(db, 'project_markers', 'marker_id', projectId, markerIds);
}

async function setProjectTutorials(db, projectId, tutorialIds) {
  await replaceProjectJunctionRows(db, 'project_tutorials', 'tutorial_id', projectId, tutorialIds);
}

async function validateProjectLinksForMap(mapId, zoneIds, markerIds) {
  // 2 requêtes IN au lieu d'un queryOne par id ; l'itération dans l'ordre des ids
  // demandés préserve le message d'erreur du premier élément fautif.
  if (zoneIds.length) {
    const rows = await queryAll(
      `SELECT id, map_id FROM zones WHERE id IN (${zoneIds.map(() => '?').join(',')})`,
      zoneIds,
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    for (const zid of zoneIds) {
      const zone = byId.get(String(zid));
      if (!zone) return { error: 'Zone introuvable' };
      if (zone.map_id !== mapId)
        return { error: 'Une zone ne fait pas partie de la carte du projet' };
    }
  }
  if (markerIds.length) {
    const rows = await queryAll(
      `SELECT id, map_id FROM map_markers WHERE id IN (${markerIds.map(() => '?').join(',')})`,
      markerIds,
    );
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    for (const mid of markerIds) {
      const marker = byId.get(String(mid));
      if (!marker) return { error: 'Repère introuvable' };
      if (marker.map_id !== mapId)
        return { error: 'Un repère ne fait pas partie de la carte du projet' };
    }
  }
  return {};
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

async function fetchZonesForProjects(projectIds) {
  if (!projectIds.length) return new Map();
  const ph = projectIds.map(() => '?').join(',');
  const rows = await queryAll(
    `SELECT pz.project_id, z.id AS zone_id, z.name AS zone_name, z.map_id
       FROM project_zones pz
       INNER JOIN zones z ON z.id = pz.zone_id
      WHERE pz.project_id IN (${ph})
      ORDER BY z.name`,
    projectIds,
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
    projectIds,
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
    projectIds,
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
    [projectId],
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

router.get(
  '/',
  asyncHandler(async (req, res) => {
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
  }),
);

router.post(
  '/',
  requirePermission('tasks.manage'),
  validate({ body: createProjectBodySchema }),
  asyncHandler(async (req, res) => {
    const {
      map_id: mapId,
      title,
      description,
      status,
      zone_ids: zoneIds,
      marker_ids: markerIds,
      tutorial_ids: tutorialIds,
    } = req.body;

    if (!(await ensureMapExists(mapId)))
      return res.status(400).json({ error: 'Carte introuvable' });

    const loc = await validateProjectLinksForMap(mapId, zoneIds, markerIds);
    if (loc.error) return res.status(400).json({ error: loc.error });
    const tuto = await validateTutorialIds(tutorialIds);
    if (tuto.error) return res.status(400).json({ error: tuto.error });

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    // Atomicité (audit §2.5) : projet + liens dans une seule transaction — un crash au milieu
    // ne laisse plus de liens orphelins. Validations 400/403/404 déjà faites ci-dessus.
    await withTransaction(async (tx) => {
      await tx.execute(
        'INSERT INTO task_projects (id, map_id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, mapId, title, description, status, createdAt],
      );
      await setProjectZones(tx, id, zoneIds);
      await setProjectMarkers(tx, id, markerIds);
      await setProjectTutorials(tx, id, tutorialIds);
    });

    const created = await loadProjectRow(id);
    emitTasksChanged({ reason: 'project_create', projectId: id, mapId });
    res.status(201).json(created);
  }),
);

router.put(
  '/:id',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const existing = await queryOne('SELECT * FROM task_projects WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Projet introuvable' });

    const nextMapId =
      req.body.map_id !== undefined ? normalizeText(req.body.map_id) : existing.map_id;
    const nextTitle = req.body.title !== undefined ? normalizeText(req.body.title) : existing.title;
    const nextDescription =
      req.body.description !== undefined
        ? normalizeText(req.body.description) || null
        : existing.description;
    const nextStatus =
      req.body.status !== undefined
        ? normalizeProjectStatusForApi(req.body.status, 'active')
        : existing.status || 'active';

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
    if (!(await ensureMapExists(nextMapId)))
      return res.status(400).json({ error: 'Carte introuvable' });

    const loc = await validateProjectLinksForMap(nextMapId, nextZoneIds, nextMarkerIds);
    if (loc.error) return res.status(400).json({ error: loc.error });
    const tuto = await validateTutorialIds(nextTutorialIds);
    if (tuto.error) return res.status(400).json({ error: tuto.error });

    // Invariant tâches↔projet (cf. validateTaskProject) : une tâche doit être sur la même
    // carte que son projet. Refuser le changement de carte tant que des tâches y sont liées,
    // sinon elles resteraient sur l'ancienne carte avec des zones incohérentes.
    if (String(nextMapId) !== String(existing.map_id)) {
      const linked = await queryOne(
        'SELECT COUNT(*) AS c FROM tasks WHERE project_id = ? AND map_id <> ?',
        [req.params.id, nextMapId],
      );
      if (Number(linked?.c) > 0) {
        return res.status(400).json({
          error:
            'Impossible de changer la carte : des tâches de ce projet sont sur l’ancienne carte (déplacez-les ou détachez-les d’abord)',
        });
      }
    }

    // Atomicité (audit §2.5) : mise à jour projet + liens dans une seule transaction — un crash
    // au milieu ne laisse plus de liens orphelins. Validations 400/403/404 déjà faites ci-dessus.
    await withTransaction(async (tx) => {
      await tx.execute(
        'UPDATE task_projects SET map_id = ?, title = ?, description = ?, status = ? WHERE id = ?',
        [nextMapId, nextTitle, nextDescription, nextStatus, req.params.id],
      );
      await setProjectZones(tx, req.params.id, nextZoneIds);
      await setProjectMarkers(tx, req.params.id, nextMarkerIds);
      await setProjectTutorials(tx, req.params.id, nextTutorialIds);
    });

    const updated = await loadProjectRow(req.params.id);
    emitTasksChanged({ reason: 'project_update', projectId: req.params.id, mapId: nextMapId });
    res.json(updated);
  }),
);

router.delete(
  '/:id',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const existing = await queryOne('SELECT id, map_id FROM task_projects WHERE id = ?', [
      req.params.id,
    ]);
    if (!existing) return res.status(404).json({ error: 'Projet introuvable' });
    await execute('DELETE FROM task_projects WHERE id = ?', [req.params.id]);
    emitTasksChanged({
      reason: 'project_delete',
      projectId: req.params.id,
      mapId: existing.map_id,
    });
    res.json({ success: true });
  }),
);

router.post(
  '/:id/validate',
  requirePermission('tasks.validate'),
  asyncHandler(async (req, res) => {
    const existing = await queryOne(
      'SELECT id, map_id, title, status FROM task_projects WHERE id = ?',
      [req.params.id],
    );
    if (!existing) return res.status(404).json({ error: 'Projet introuvable' });

    const cur = String(existing.status || 'active')
      .trim()
      .toLowerCase();
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
    emitTasksChanged({
      reason: 'project_validate',
      projectId: req.params.id,
      mapId: existing.map_id,
    });
    res.json(updated);
  }),
);

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

// `copyLocationLinks` : ne recopier zones/repères que si la carte cible est identique à
// la source. Vers une autre carte, ces liens pointeraient sur des lieux d'une carte étrangère.
async function copyProjectLinksTx(tx, sourceProjectId, targetProjectId, copyLocationLinks = true) {
  if (copyLocationLinks) {
    const zoneRows = await tx.queryAll(
      'SELECT zone_id FROM project_zones WHERE project_id = ? ORDER BY zone_id',
      [sourceProjectId],
    );
    for (const row of zoneRows) {
      await tx.execute('INSERT INTO project_zones (project_id, zone_id) VALUES (?, ?)', [
        targetProjectId,
        row.zone_id,
      ]);
    }

    const markerRows = await tx.queryAll(
      'SELECT marker_id FROM project_markers WHERE project_id = ? ORDER BY marker_id',
      [sourceProjectId],
    );
    for (const row of markerRows) {
      await tx.execute('INSERT INTO project_markers (project_id, marker_id) VALUES (?, ?)', [
        targetProjectId,
        row.marker_id,
      ]);
    }
  }

  const tutorialRows = await tx.queryAll(
    'SELECT tutorial_id FROM project_tutorials WHERE project_id = ? ORDER BY tutorial_id',
    [sourceProjectId],
  );
  for (const row of tutorialRows) {
    await tx.execute('INSERT INTO project_tutorials (project_id, tutorial_id) VALUES (?, ?)', [
      targetProjectId,
      row.tutorial_id,
    ]);
  }
}

async function copyProjectTasksTx(
  tx,
  sourceProjectId,
  targetProjectId,
  mapId,
  copyLocationLinks = true,
) {
  const sourceTasks = await tx.queryAll(
    `SELECT id, title, description, zone_id, marker_id, start_date, due_date, required_students,
            completion_mode, danger_level, difficulty_level, importance_level,
            recurrence, sort_order
       FROM tasks
      WHERE project_id = ?
      ORDER BY sort_order ASC, created_at ASC, title ASC`,
    [sourceProjectId],
  );

  const createdTaskIds = [];
  const duplicatedStartDate = currentLocalDateOnly();
  for (const task of sourceTasks) {
    const newTaskId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await tx.execute(
      `INSERT INTO tasks (
        id, title, description, map_id, project_id, zone_id, marker_id,
        start_date, due_date, required_students, completion_mode, danger_level, difficulty_level,
        importance_level, recurrence, sort_order, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newTaskId,
        task.title,
        task.description || '',
        mapId,
        targetProjectId,
        copyLocationLinks ? task.zone_id || null : null,
        copyLocationLinks ? task.marker_id || null : null,
        duplicatedStartDate,
        task.due_date || null,
        task.required_students != null ? Number(task.required_students) : 1,
        task.completion_mode || 'single_done',
        task.danger_level || null,
        task.difficulty_level || null,
        task.importance_level || null,
        task.recurrence || null,
        Number(task.sort_order) || 0,
        'available',
        createdAt,
      ],
    );

    if (copyLocationLinks) {
      const zoneRows = await tx.queryAll('SELECT zone_id FROM task_zones WHERE task_id = ?', [
        task.id,
      ]);
      const zoneIds = [
        ...new Set(
          [
            ...zoneRows.map((row) => String(row.zone_id || '').trim()).filter(Boolean),
            task.zone_id != null ? String(task.zone_id).trim() : '',
          ].filter(Boolean),
        ),
      ];
      for (const zoneId of zoneIds) {
        await tx.execute('INSERT INTO task_zones (task_id, zone_id) VALUES (?, ?)', [
          newTaskId,
          zoneId,
        ]);
      }
      const markerRows = await tx.queryAll('SELECT marker_id FROM task_markers WHERE task_id = ?', [
        task.id,
      ]);
      const markerIds = [
        ...new Set(
          [
            ...markerRows.map((row) => String(row.marker_id || '').trim()).filter(Boolean),
            task.marker_id != null ? String(task.marker_id).trim() : '',
          ].filter(Boolean),
        ),
      ];
      for (const markerId of markerIds) {
        await tx.execute('INSERT INTO task_markers (task_id, marker_id) VALUES (?, ?)', [
          newTaskId,
          markerId,
        ]);
      }
    }
    const tutorialRows = await tx.queryAll(
      'SELECT tutorial_id FROM task_tutorials WHERE task_id = ?',
      [task.id],
    );
    for (const tr of tutorialRows) {
      await tx.execute('INSERT INTO task_tutorials (task_id, tutorial_id) VALUES (?, ?)', [
        newTaskId,
        tr.tutorial_id,
      ]);
    }

    const speciesRows = await tx.queryAll(
      'SELECT plant_id FROM task_species WHERE task_id = ? ORDER BY plant_id',
      [task.id],
    );
    for (const sr of speciesRows) {
      await tx.execute('INSERT INTO task_species (task_id, plant_id) VALUES (?, ?)', [
        newTaskId,
        sr.plant_id,
      ]);
    }

    createdTaskIds.push(newTaskId);
  }
  return createdTaskIds;
}

router.post(
  '/:id/duplicate',
  requirePermission('tasks.manage'),
  asyncHandler(async (req, res) => {
    const source = await queryOne('SELECT * FROM task_projects WHERE id = ?', [req.params.id]);
    if (!source) return res.status(404).json({ error: 'Projet introuvable' });

    const requestedTitle = req.body?.title !== undefined ? normalizeText(req.body.title) : '';
    const nextTitle = requestedTitle || duplicateTitleSuffix(source.title);
    if (!nextTitle) return res.status(400).json({ error: 'Titre requis' });

    const nextMapId =
      req.body?.map_id !== undefined ? normalizeText(req.body.map_id) : source.map_id;
    if (!nextMapId) return res.status(400).json({ error: 'Carte requise' });
    if (!(await ensureMapExists(nextMapId)))
      return res.status(400).json({ error: 'Carte introuvable' });

    const newProjectId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const createdTaskIds = await withTransaction(async (tx) => {
      await tx.execute(
        'INSERT INTO task_projects (id, map_id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [newProjectId, nextMapId, nextTitle, source.description || null, 'active', createdAt],
      );
      // Ne conserver les liens zones/repères que si la duplication reste sur la même carte.
      const sameMap = String(nextMapId) === String(source.map_id || '');
      await copyProjectLinksTx(tx, source.id, newProjectId, sameMap);
      return copyProjectTasksTx(tx, source.id, newProjectId, nextMapId, sameMap);
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
  }),
);

module.exports = router;
// Exporté pour les tests unitaires (sans base) du schéma de validation O7.
module.exports.createProjectBodySchema = createProjectBodySchema;
