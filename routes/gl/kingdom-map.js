'use strict';

const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const {
  DEFAULT_MUSIC_VOLUME,
  parseZoneMusicInput,
  serializeZoneMusicRow,
} = require('../../lib/glZoneMusic');

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

function mapZoneRow(row) {
  let points = [];
  try {
    points = row.points_json ? JSON.parse(row.points_json) : [];
  } catch (_) {
    points = [];
  }
  const music = serializeZoneMusicRow(row);
  return {
    id: Number(row.id),
    chapter_id: Number(row.chapter_id),
    label: row.label,
    description: row.description,
    points,
    color: row.color,
    music_url: music.music_url,
    music_volume: music.music_volume,
    musicUrl: music.musicUrl,
    musicVolume: music.musicVolume,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.get('/zones', requireGlAuth, async (req, res) => {
  const chapterId = req.query?.chapterId != null ? Number(req.query.chapterId) : null;
  if (chapterId == null || !Number.isFinite(chapterId)) {
    return res.status(400).json({ error: 'chapterId requis' });
  }
  const rows = await queryAll(
    `SELECT id, chapter_id, label, description, points_json, color,
            music_url, music_volume, created_at, updated_at
       FROM gl_kingdom_zones
      WHERE chapter_id = ?
      ORDER BY id ASC`,
    [chapterId]
  );
  return res.json({ zones: rows.map(mapZoneRow) });
});

router.post('/zones', requireGlPermission('gl.content.manage'), async (req, res) => {
  const chapterId = Number(req.body?.chapterId);
  const label = normalizeOptionalString(req.body?.label);
  const description = normalizeOptionalString(req.body?.description);
  const color = normalizeOptionalString(req.body?.color) || '#22c55e';
  const points = req.body?.points;
  const musicParsed = parseZoneMusicInput(req.body);
  if (musicParsed.error) return res.status(400).json({ error: musicParsed.error });
  if (!Number.isFinite(chapterId)) return res.status(400).json({ error: 'chapterId invalide' });
  if (!label || label.length < MIN_LABEL || label.length > MAX_LABEL) {
    return res.status(400).json({ error: `Label invalide (${MIN_LABEL}-${MAX_LABEL} caractères)` });
  }
  if (!validatePoints(points)) {
    return res.status(400).json({ error: 'Points invalides (3-200 points {x,y} en pourcentage 0-100)' });
  }
  const chapter = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [chapterId]);
  if (!chapter) return res.status(404).json({ error: 'Chapitre introuvable' });
  const musicUrl = musicParsed.hasMusicUrl ? musicParsed.musicUrl : null;
  const musicVolume = musicParsed.hasMusicVolume ? musicParsed.musicVolume : DEFAULT_MUSIC_VOLUME;
  const result = await execute(
    `INSERT INTO gl_kingdom_zones
       (chapter_id, label, description, points_json, color, music_url, music_volume, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [chapterId, label, description, JSON.stringify(points), color, musicUrl, musicVolume, req.glAuth.userId]
  );
  const created = await queryOne('SELECT * FROM gl_kingdom_zones WHERE id = ? LIMIT 1', [result.insertId]);
  return res.status(201).json(mapZoneRow(created));
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
  const musicParsed = parseZoneMusicInput(req.body);
  if (musicParsed.error) return res.status(400).json({ error: musicParsed.error });
  let pointsJson = null;
  if (points != null) {
    if (!validatePoints(points)) {
      return res.status(400).json({ error: 'Points invalides' });
    }
    pointsJson = JSON.stringify(points);
  }
  const musicUrl = musicParsed.hasMusicUrl ? musicParsed.musicUrl : undefined;
  const musicVolume = musicParsed.hasMusicVolume ? musicParsed.musicVolume : undefined;
  await execute(
    `UPDATE gl_kingdom_zones
        SET label = COALESCE(?, label),
            description = COALESCE(?, description),
            color = COALESCE(?, color),
            points_json = COALESCE(?, points_json),
            music_url = ${musicParsed.hasMusicUrl ? '?' : 'music_url'},
            music_volume = ${musicParsed.hasMusicVolume ? '?' : 'music_volume'},
            updated_at = NOW()
      WHERE id = ?`,
    [
      label,
      description,
      color,
      pointsJson,
      ...(musicParsed.hasMusicUrl ? [musicUrl] : []),
      ...(musicParsed.hasMusicVolume ? [musicVolume] : []),
      id,
    ]
  );
  const updated = await queryOne('SELECT * FROM gl_kingdom_zones WHERE id = ? LIMIT 1', [id]);
  return res.json(mapZoneRow(updated));
});

router.delete('/zones/:id', requireGlPermission('gl.content.manage'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identifiant invalide' });
  await execute('DELETE FROM gl_kingdom_zones WHERE id = ?', [id]);
  return res.json({ ok: true });
});

module.exports = router;
