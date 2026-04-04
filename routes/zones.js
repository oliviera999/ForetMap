const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { saveBase64ToDisk, getAbsolutePath, deleteFile } = require('../lib/uploads');
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

function withLivingBeings(zone) {
  return {
    ...zone,
    living_beings_list: normalizeLivingBeings(zone.living_beings, zone.current_plant),
  };
}

router.get('/', async (req, res) => {
  try {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    const zones = mapId
      ? await queryAll('SELECT * FROM zones WHERE map_id = ?', [mapId])
      : await queryAll('SELECT * FROM zones');
    const history = await queryAll('SELECT * FROM zone_history ORDER BY harvested_at DESC');
    const result  = zones.map(z => ({
      ...withLivingBeings(z),
      special: !!z.special,
      history: history.filter(h => h.zone_id === z.id)
    }));
    res.json(result);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const history = await queryAll(
      'SELECT * FROM zone_history WHERE zone_id = ? ORDER BY harvested_at DESC',
      [req.params.id]
    );
    res.json({ ...withLivingBeings(zone), special: !!zone.special, history });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requirePermission('zones.manage', { needsElevation: true }), async (req, res) => {
  try {
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const { name, current_plant, living_beings, stage, description, points, color, map_id } = req.body;
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    if (map_id != null) {
      const nextMapId = String(map_id).trim();
      if (!nextMapId) return res.status(400).json({ error: 'map_id invalide' });
      if (!(await mapExists(nextMapId))) return res.status(400).json({ error: 'Carte introuvable' });
    }
    const existingLiving = normalizeLivingBeings(zone.living_beings, zone.current_plant);
    const nextLiving = living_beings !== undefined ? normalizeLivingBeings(living_beings, current_plant ?? zone.current_plant) : existingLiving;
    const nextCurrentPlant = current_plant !== undefined
      ? (current_plant || nextLiving[0] || '')
      : (nextLiving[0] || zone.current_plant || '');
    if (zone.current_plant && current_plant !== undefined &&
        zone.current_plant !== nextCurrentPlant && zone.current_plant.trim() !== '') {
      await execute(
        'INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)',
        [zone.id, zone.current_plant, new Date().toISOString().split('T')[0]]
      );
    }
    await execute(
      'UPDATE zones SET map_id=?, name=?, current_plant=?, living_beings=?, stage=?, description=?, points=?, color=? WHERE id=?',
      [
        map_id != null ? String(map_id).trim() : zone.map_id,
        name !== undefined ? String(name).trim() : zone.name,
        nextCurrentPlant,
        serializeLivingBeings(nextLiving, nextCurrentPlant),
        stage          ?? zone.stage,
        description    !== undefined ? description : (zone.description ?? ''),
        points         !== undefined ? JSON.stringify(points) : zone.points,
        color          ?? zone.color,
        zone.id
      ]
    );
    const updated = await queryOne('SELECT * FROM zones WHERE id = ?', [zone.id]);
    const history = await queryAll('SELECT * FROM zone_history WHERE zone_id=? ORDER BY harvested_at DESC', [zone.id]);
    emitGardenChanged({ reason: 'update_zone', zoneId: zone.id, mapId: updated.map_id });
    res.json({ ...withLivingBeings(updated), special: !!updated.special, history });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/photos', async (req, res) => {
  try {
    const zoneId = req.params.id;
    const photos = await queryAll(
      'SELECT id, zone_id, caption, uploaded_at, image_path FROM zone_photos WHERE zone_id=? ORDER BY uploaded_at DESC',
      [zoneId]
    );
    res.json(photos.map(p => ({
      ...p,
      image_url: p.image_path ? `/api/zones/${zoneId}/photos/${p.id}/data` : null,
    })));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/photos/:pid/data', async (req, res) => {
  try {
    const p = await queryOne('SELECT image_path FROM zone_photos WHERE id=? AND zone_id=?', [req.params.pid, req.params.id]);
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

router.post('/:id/photos', requirePermission('zones.manage', { needsElevation: true }), async (req, res) => {
  let photoId = null;
  try {
    const zone = await queryOne('SELECT * FROM zones WHERE id=?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const { image_data, caption } = req.body;
    if (!image_data) return res.status(400).json({ error: 'Image requise' });
    const result = await execute(
      'INSERT INTO zone_photos (zone_id, image_path, caption, uploaded_at) VALUES (?, ?, ?, ?)',
      [req.params.id, null, caption || '', new Date().toISOString()]
    );
    photoId = result.insertId;
    const relativePath = `zones/${req.params.id}/${photoId}.jpg`;
    try {
      saveBase64ToDisk(relativePath, image_data);
    } catch (fileErr) {
      await execute('DELETE FROM zone_photos WHERE id = ?', [photoId]);
      throw fileErr;
    }
    await execute('UPDATE zone_photos SET image_path = ? WHERE id = ?', [relativePath, photoId]);
    const photo = await queryOne('SELECT id, zone_id, caption, uploaded_at FROM zone_photos WHERE id=?', [photoId]);
    emitGardenChanged({ reason: 'add_zone_photo', zoneId: req.params.id, mapId: zone.map_id });
    res.status(201).json(photo);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/photos/:pid', requirePermission('zones.manage', { needsElevation: true }), async (req, res) => {
  try {
    const zone = await queryOne('SELECT map_id FROM zones WHERE id = ?', [req.params.id]);
    const p = await queryOne('SELECT image_path FROM zone_photos WHERE id=? AND zone_id=?', [req.params.pid, req.params.id]);
    if (p && p.image_path) deleteFile(p.image_path);
    await execute('DELETE FROM zone_photos WHERE id=? AND zone_id=?', [req.params.pid, req.params.id]);
    emitGardenChanged({ reason: 'delete_zone_photo', zoneId: req.params.id, mapId: zone?.map_id || null });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requirePermission('zones.manage', { needsElevation: true }), async (req, res) => {
  try {
    const { name, points, color, current_plant, living_beings, stage, map_id, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
    if (!points || points.length < 3) return res.status(400).json({ error: 'Au moins 3 points requis' });
    const mapId = String(map_id || 'foret').trim();
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    const nextLiving = normalizeLivingBeings(living_beings, current_plant);
    const nextCurrentPlant = (current_plant || nextLiving[0] || '').trim();
    const desc = description !== undefined && description !== null ? String(description) : '';
    const id = 'zone-' + uuidv4().slice(0, 8);
    await execute(
      'INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, living_beings, stage, special, points, color, description) VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?, ?, 0, ?, ?, ?)',
      [id, mapId, name.trim(), nextCurrentPlant, serializeLivingBeings(nextLiving, nextCurrentPlant), stage || 'empty', JSON.stringify(points), color || '#86efac80', desc]
    );
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [id]);
    emitGardenChanged({ reason: 'create_zone', zoneId: id, mapId });
    res.status(201).json({ ...withLivingBeings(zone), history: [] });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requirePermission('zones.manage', { needsElevation: true }), async (req, res) => {
  try {
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const photos = await queryAll('SELECT image_path FROM zone_photos WHERE zone_id = ?', [req.params.id]);
    for (const p of photos) {
      if (p && p.image_path) deleteFile(p.image_path);
    }
    await execute('DELETE FROM zone_history WHERE zone_id = ?', [req.params.id]);
    await execute('DELETE FROM zone_photos WHERE zone_id = ?', [req.params.id]);
    await execute('DELETE FROM zones WHERE id = ?', [req.params.id]);
    emitGardenChanged({ reason: 'delete_zone', zoneId: req.params.id, mapId: zone.map_id });
    res.json({ success: true });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
