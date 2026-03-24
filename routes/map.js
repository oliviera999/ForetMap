const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requireTeacher } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitGardenChanged } = require('../lib/realtime');

const router = express.Router();

async function mapExists(mapId) {
  if (!mapId) return false;
  const row = await queryOne('SELECT id FROM maps WHERE id = ?', [mapId]);
  return !!row;
}

function normalizeLivingBeings(input, fallback = '') {
  const base = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? (() => {
        try {
          const parsed = JSON.parse(input);
          if (Array.isArray(parsed)) return parsed;
        } catch (_) {}
        return input.split(',');
      })()
      : [];
  const cleaned = [...new Set(base
    .map((v) => String(v || '').trim())
    .filter(Boolean))];
  if (cleaned.length === 0 && fallback && String(fallback).trim()) return [String(fallback).trim()];
  return cleaned;
}

function serializeLivingBeings(input, fallback = '') {
  return JSON.stringify(normalizeLivingBeings(input, fallback));
}

function withLivingBeings(marker) {
  return {
    ...marker,
    living_beings_list: normalizeLivingBeings(marker.living_beings, marker.plant_name),
  };
}

router.get('/markers', async (req, res) => {
  try {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    const rows = mapId
      ? await queryAll('SELECT * FROM map_markers WHERE map_id = ? ORDER BY created_at', [mapId])
      : await queryAll('SELECT * FROM map_markers ORDER BY created_at');
    res.json(rows.map(withLivingBeings));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/markers', requireTeacher, async (req, res) => {
  try {
    const { x_pct, y_pct, label, plant_name, living_beings, note, emoji, map_id } = req.body;
    const mapId = String(map_id || 'foret').trim();
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    if (!label?.trim()) return res.status(400).json({ error: 'Label requis' });
    const nextLiving = normalizeLivingBeings(living_beings, plant_name);
    const nextPlantName = (plant_name || nextLiving[0] || '').trim();
    const id = uuidv4();
    await execute(
      'INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, plant_name, living_beings, note, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, mapId, x_pct, y_pct, label.trim(), nextPlantName, serializeLivingBeings(nextLiving, nextPlantName), note || '', emoji || '🌱', new Date().toISOString()]
    );
    const row = await queryOne('SELECT * FROM map_markers WHERE id = ?', [id]);
    emitGardenChanged({ reason: 'create_marker', markerId: id });
    res.status(201).json(withLivingBeings(row));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.put('/markers/:id', requireTeacher, async (req, res) => {
  try {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    const { x_pct, y_pct, label, plant_name, living_beings, note, emoji, map_id } = req.body;
    if (map_id != null) {
      const mapId = String(map_id).trim();
      if (!mapId) return res.status(400).json({ error: 'map_id invalide' });
      if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    }
    const existingLiving = normalizeLivingBeings(m.living_beings, m.plant_name);
    const nextLiving = living_beings !== undefined ? normalizeLivingBeings(living_beings, plant_name ?? m.plant_name) : existingLiving;
    const nextPlantName = plant_name !== undefined
      ? (plant_name || nextLiving[0] || '')
      : (nextLiving[0] || m.plant_name || '');
    await execute(
      'UPDATE map_markers SET map_id=?, x_pct=?, y_pct=?, label=?, plant_name=?, living_beings=?, note=?, emoji=? WHERE id=?',
      [
        map_id != null ? String(map_id).trim() : m.map_id,
        x_pct ?? m.x_pct,
        y_pct ?? m.y_pct,
        label ?? m.label,
        nextPlantName,
        serializeLivingBeings(nextLiving, nextPlantName),
        note ?? m.note,
        emoji ?? m.emoji,
        m.id,
      ]
    );
    const updated = await queryOne('SELECT * FROM map_markers WHERE id = ?', [m.id]);
    emitGardenChanged({ reason: 'update_marker', markerId: m.id });
    res.json(withLivingBeings(updated));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/markers/:id', requireTeacher, async (req, res) => {
  try {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    await execute('DELETE FROM map_markers WHERE id = ?', [req.params.id]);
    emitGardenChanged({ reason: 'delete_marker', markerId: req.params.id });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
