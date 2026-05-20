'use strict';

const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');

const router = express.Router();

const MIN_LABEL = 1;
const MAX_LABEL = 180;
const MAX_POINTS = 200;

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function validatePoints(points) {
  if (!Array.isArray(points)) return false;
  if (points.length < 3 || points.length > MAX_POINTS) return false;
  for (const p of points) {
    if (!p || typeof p !== 'object') return false;
    const x = Number(p.x);
    const y = Number(p.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (x < 0 || x > 100 || y < 0 || y > 100) return false;
  }
  return true;
}

router.get('/zones', requireGlAuth, async (req, res) => {
  const chapterId = req.query?.chapterId != null ? Number(req.query.chapterId) : null;
  if (chapterId == null || !Number.isFinite(chapterId)) {
    return res.status(400).json({ error: 'chapterId requis' });
  }
  const rows = await queryAll(
    `SELECT id, chapter_id, label, description, points_json, color, created_at, updated_at
       FROM gl_kingdom_zones
      WHERE chapter_id = ?
      ORDER BY id ASC`,
    [chapterId]
  );
  const zones = rows.map((row) => {
    let points = [];
    try {
      points = row.points_json ? JSON.parse(row.points_json) : [];
    } catch (_) {
      points = [];
    }
    return {
      id: Number(row.id),
      chapter_id: Number(row.chapter_id),
      label: row.label,
      description: row.description,
      points,
      color: row.color,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
  return res.json({ zones });
});

router.post('/zones', requireGlPermission('gl.content.manage'), async (req, res) => {
  const chapterId = Number(req.body?.chapterId);
  const label = normalizeOptionalString(req.body?.label);
  const description = normalizeOptionalString(req.body?.description);
  const color = normalizeOptionalString(req.body?.color) || '#22c55e';
  const points = req.body?.points;
  if (!Number.isFinite(chapterId)) return res.status(400).json({ error: 'chapterId invalide' });
  if (!label || label.length < MIN_LABEL || label.length > MAX_LABEL) {
    return res.status(400).json({ error: `Label invalide (${MIN_LABEL}-${MAX_LABEL} caractères)` });
  }
  if (!validatePoints(points)) {
    return res.status(400).json({ error: 'Points invalides (3-200 points {x,y} en pourcentage 0-100)' });
  }
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [chapterId]);
  if (!chapter) return res.status(404).json({ error: 'Chapitre introuvable' });
  const result = await execute(
    `INSERT INTO gl_kingdom_zones (chapter_id, label, description, points_json, color, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [chapterId, label, description, JSON.stringify(points), color, req.glAuth.userId]
  );
  const created = await queryOne('SELECT * FROM gl_kingdom_zones WHERE id = ? LIMIT 1', [result.insertId]);
  return res.status(201).json({
    id: Number(created.id),
    chapter_id: Number(created.chapter_id),
    label: created.label,
    description: created.description,
    points: JSON.parse(created.points_json),
    color: created.color,
    created_at: created.created_at,
    updated_at: created.updated_at,
  });
});

router.put('/zones/:id', requireGlPermission('gl.content.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  const existing = await queryOne('SELECT id FROM gl_kingdom_zones WHERE id = ? LIMIT 1', [id]);
  if (!existing) return res.status(404).json({ error: 'Zone introuvable' });
  const label = normalizeOptionalString(req.body?.label);
  const description = req.body?.description == null ? null : normalizeOptionalString(req.body.description);
  const color = normalizeOptionalString(req.body?.color);
  const points = req.body?.points;
  let pointsJson = null;
  if (points != null) {
    if (!validatePoints(points)) {
      return res.status(400).json({ error: 'Points invalides' });
    }
    pointsJson = JSON.stringify(points);
  }
  await execute(
    `UPDATE gl_kingdom_zones
        SET label = COALESCE(?, label),
            description = COALESCE(?, description),
            color = COALESCE(?, color),
            points_json = COALESCE(?, points_json),
            updated_at = NOW()
      WHERE id = ?`,
    [label, description, color, pointsJson, id]
  );
  const updated = await queryOne('SELECT * FROM gl_kingdom_zones WHERE id = ? LIMIT 1', [id]);
  return res.json({
    id: Number(updated.id),
    chapter_id: Number(updated.chapter_id),
    label: updated.label,
    description: updated.description,
    points: JSON.parse(updated.points_json),
    color: updated.color,
    created_at: updated.created_at,
    updated_at: updated.updated_at,
  });
});

router.delete('/zones/:id', requireGlPermission('gl.content.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  await execute('DELETE FROM gl_kingdom_zones WHERE id = ?', [id]);
  return res.json({ ok: true });
});

module.exports = router;
