const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { logRouteError } = require('../lib/routeLog');
const { emitGardenChanged } = require('../lib/realtime');
const { saveBase64ToDisk, getAbsolutePath, deleteFile } = require('../lib/uploads');

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

function hasVisitMarkerContentPatch(body) {
  if (!body || typeof body !== 'object') return false;
  return ['visit_subtitle', 'visit_short_description', 'visit_details_title', 'visit_details_text']
    .some((k) => body[k] !== undefined);
}

async function upsertVisitMarkerEditorial(reqBody, markerRow) {
  const existing = await queryOne(
    'SELECT subtitle, short_description, details_title, details_text FROM visit_markers WHERE id = ? LIMIT 1',
    [markerRow.id],
  );
  const subtitle = reqBody.visit_subtitle !== undefined
    ? String(reqBody.visit_subtitle || '').trim()
    : String(existing?.subtitle || '');
  const shortDescription = reqBody.visit_short_description !== undefined
    ? String(reqBody.visit_short_description || '').trim()
    : String(existing?.short_description || '');
  const detailsTitle = reqBody.visit_details_title !== undefined
    ? (String(reqBody.visit_details_title || 'Détails').trim() || 'Détails')
    : (String(existing?.details_title || 'Détails').trim() || 'Détails');
  const detailsText = reqBody.visit_details_text !== undefined
    ? String(reqBody.visit_details_text || '').trim()
    : String(existing?.details_text || '');
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO visit_markers
      (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
     ON DUPLICATE KEY UPDATE
       map_id = VALUES(map_id),
       x_pct = VALUES(x_pct),
       y_pct = VALUES(y_pct),
       label = VALUES(label),
       emoji = VALUES(emoji),
       subtitle = VALUES(subtitle),
       short_description = VALUES(short_description),
       details_title = VALUES(details_title),
       details_text = VALUES(details_text),
       updated_at = VALUES(updated_at)`,
    [
      markerRow.id,
      markerRow.map_id,
      markerRow.x_pct,
      markerRow.y_pct,
      markerRow.label,
      normalizeMarkerEmoji(markerRow.emoji),
      subtitle,
      shortDescription,
      detailsTitle,
      detailsText,
      now,
      now,
    ],
  );
}

const MARKERS_LIST_SQL = `SELECT m.*,
  vm.subtitle AS visit_subtitle,
  vm.short_description AS visit_short_description,
  vm.details_title AS visit_details_title,
  vm.details_text AS visit_details_text
FROM map_markers m
LEFT JOIN visit_markers vm ON vm.id = m.id`;

/** Colonne `map_markers.emoji` : VARCHAR(16). */
function normalizeMarkerEmoji(value, fallback = '🌱') {
  const s = String(value ?? '').trim();
  if (!s) return fallback;
  return s.slice(0, 16);
}

router.get('/markers/:id/photos/:pid/data', async (req, res) => {
  try {
    const markerId = String(req.params.id || '').trim();
    const p = await queryOne(
      'SELECT mp.image_path FROM marker_photos mp WHERE mp.id=? AND mp.marker_id=?',
      [req.params.pid, markerId]
    );
    if (!p) return res.status(404).json({ error: 'Photo introuvable' });
    if (p.image_path) {
      const absolutePath = getAbsolutePath(p.image_path);
      return res.sendFile(absolutePath, (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
      });
    }
    return res.status(404).json({ error: 'Aucune image' });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/markers/:id/photos', async (req, res) => {
  try {
    const markerId = String(req.params.id || '').trim();
    const photos = await queryAll(
      'SELECT id, marker_id, caption, uploaded_at, image_path FROM marker_photos WHERE marker_id=? ORDER BY uploaded_at DESC',
      [markerId]
    );
    res.json(
      photos.map((p) => ({
        ...p,
        image_url: p.image_path ? `/api/map/markers/${markerId}/photos/${p.id}/data` : null,
      }))
    );
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/markers/:id/photos', requirePermission('map.manage_markers', { needsElevation: true }), async (req, res) => {
  let photoId = null;
  try {
    const m = await queryOne('SELECT * FROM map_markers WHERE id=?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    const { image_data, caption } = req.body;
    if (!image_data) return res.status(400).json({ error: 'Image requise' });
    const result = await execute(
      'INSERT INTO marker_photos (marker_id, image_path, caption, uploaded_at) VALUES (?, ?, ?, ?)',
      [req.params.id, null, caption || '', new Date().toISOString()]
    );
    photoId = result.insertId;
    const relativePath = `markers/${req.params.id}/${photoId}.jpg`;
    try {
      saveBase64ToDisk(relativePath, image_data);
    } catch (fileErr) {
      await execute('DELETE FROM marker_photos WHERE id = ?', [photoId]);
      throw fileErr;
    }
    await execute('UPDATE marker_photos SET image_path = ? WHERE id = ?', [relativePath, photoId]);
    const photo = await queryOne('SELECT id, marker_id, caption, uploaded_at FROM marker_photos WHERE id=?', [photoId]);
    emitGardenChanged({ reason: 'add_marker_photo', markerId: req.params.id, mapId: m.map_id });
    res.status(201).json(photo);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/markers/:id/photos/:pid', requirePermission('map.manage_markers', { needsElevation: true }), async (req, res) => {
  try {
    const m = await queryOne('SELECT map_id FROM map_markers WHERE id = ?', [req.params.id]);
    const p = await queryOne('SELECT image_path FROM marker_photos WHERE id=? AND marker_id=?', [req.params.pid, req.params.id]);
    if (p && p.image_path) deleteFile(p.image_path);
    await execute('DELETE FROM marker_photos WHERE id=? AND marker_id=?', [req.params.pid, req.params.id]);
    emitGardenChanged({ reason: 'delete_marker_photo', markerId: req.params.id, mapId: m?.map_id || null });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/markers', async (req, res) => {
  try {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    const rows = mapId
      ? await queryAll(`${MARKERS_LIST_SQL} WHERE m.map_id = ? ORDER BY m.created_at`, [mapId])
      : await queryAll(`${MARKERS_LIST_SQL} ORDER BY m.created_at`);
    res.json(rows.map(withLivingBeings));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/markers', requirePermission('map.manage_markers', { needsElevation: true }), async (req, res) => {
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
      [id, mapId, x_pct, y_pct, label.trim(), nextPlantName, serializeLivingBeings(nextLiving, nextPlantName), note || '', normalizeMarkerEmoji(emoji), new Date().toISOString()]
    );
    let row = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [id]);
    if (hasVisitMarkerContentPatch(req.body)) {
      await upsertVisitMarkerEditorial(req.body, row);
      row = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [id]);
    }
    emitGardenChanged({ reason: 'create_marker', markerId: id, mapId });
    res.status(201).json(withLivingBeings(row));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.put('/markers/:id', requirePermission('map.manage_markers', { needsElevation: true }), async (req, res) => {
  try {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    const { x_pct, y_pct, label, plant_name, living_beings, note, emoji, map_id } = req.body;
    if (label !== undefined && !String(label).trim()) {
      return res.status(400).json({ error: 'Label requis' });
    }
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
        label !== undefined ? String(label).trim() : m.label,
        nextPlantName,
        serializeLivingBeings(nextLiving, nextPlantName),
        note ?? m.note,
        emoji !== undefined ? normalizeMarkerEmoji(emoji, m.emoji) : m.emoji,
        m.id,
      ]
    );
    let updated = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [m.id]);
    if (hasVisitMarkerContentPatch(req.body)) {
      await upsertVisitMarkerEditorial(req.body, updated);
      updated = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [m.id]);
    }
    emitGardenChanged({ reason: 'update_marker', markerId: m.id, mapId: updated.map_id });
    res.json(withLivingBeings(updated));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/markers/:id', requirePermission('map.manage_markers', { needsElevation: true }), async (req, res) => {
  try {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    const photos = await queryAll('SELECT image_path FROM marker_photos WHERE marker_id = ?', [req.params.id]);
    for (const p of photos) {
      if (p && p.image_path) deleteFile(p.image_path);
    }
    await execute('DELETE FROM marker_photos WHERE marker_id = ?', [req.params.id]);
    await execute('DELETE FROM map_markers WHERE id = ?', [req.params.id]);
    emitGardenChanged({ reason: 'delete_marker', markerId: req.params.id, mapId: m.map_id });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
