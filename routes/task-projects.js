const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitTasksChanged } = require('../lib/realtime');

const router = express.Router();
const ALLOWED_PROJECT_STATUSES = new Set(['active', 'on_hold']);

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function normalizeProjectStatus(value, fallback = 'active') {
  const raw = normalizeText(value).toLowerCase();
  if (!raw) return fallback;
  if (raw === 'en_attente' || raw === 'en attente' || raw === 'attente') return 'on_hold';
  return ALLOWED_PROJECT_STATUSES.has(raw) ? raw : '';
}

async function ensureMapExists(mapId) {
  const map = await queryOne('SELECT id FROM maps WHERE id = ?', [mapId]);
  return !!map;
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
    res.json(rows);
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
    const status = normalizeProjectStatus(req.body.status, 'active');
    if (!mapId) return res.status(400).json({ error: 'Carte requise' });
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (!status) return res.status(400).json({ error: 'Statut projet invalide' });
    if (!(await ensureMapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const id = uuidv4();
    const createdAt = new Date().toISOString();
    await execute(
      'INSERT INTO task_projects (id, map_id, title, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, mapId, title, description, status, createdAt]
    );

    const created = await queryOne(
      `SELECT p.*, m.label AS map_label
         FROM task_projects p
         INNER JOIN maps m ON m.id = p.map_id
        WHERE p.id = ?`,
      [id]
    );
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
      ? normalizeProjectStatus(req.body.status, 'active')
      : (existing.status || 'active');

    if (!nextMapId) return res.status(400).json({ error: 'Carte requise' });
    if (!nextTitle) return res.status(400).json({ error: 'Titre requis' });
    if (!nextStatus) return res.status(400).json({ error: 'Statut projet invalide' });
    if (!(await ensureMapExists(nextMapId))) return res.status(400).json({ error: 'Carte introuvable' });

    await execute('UPDATE task_projects SET map_id = ?, title = ?, description = ?, status = ? WHERE id = ?', [
      nextMapId,
      nextTitle,
      nextDescription,
      nextStatus,
      req.params.id,
    ]);
    const updated = await queryOne(
      `SELECT p.*, m.label AS map_label
         FROM task_projects p
         INNER JOIN maps m ON m.id = p.map_id
        WHERE p.id = ?`,
      [req.params.id]
    );
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

module.exports = router;
