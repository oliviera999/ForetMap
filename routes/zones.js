const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const { saveBase64ToDisk, getAbsolutePath } = require('../lib/uploads');
const { serializeZonePhotoListRow, redirectIfPublicZonePhotoDataUrl } = require('../lib/uploadsPublicUrls');
const { generateMapPhotoThumbFromMainRelativePath, deleteMapPhotoMainAndThumb } = require('../lib/imageThumb');
const { sendFilePublicImageOptions } = require('../lib/httpImageCache');
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

/** Champs éditoriaux visite (tables `visit_zones`, même `id` que `zones` après sync carte → visite). */
function hasVisitZoneContentPatch(body) {
  if (!body || typeof body !== 'object') return false;
  return ['visit_subtitle', 'visit_short_description', 'visit_details_title', 'visit_details_text']
    .some((k) => body[k] !== undefined);
}

async function upsertVisitZoneEditorial(reqBody, zoneRow) {
  const existing = await queryOne(
    'SELECT subtitle, short_description, details_title, details_text FROM visit_zones WHERE id = ? LIMIT 1',
    [zoneRow.id],
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
    `INSERT INTO visit_zones
      (id, map_id, name, points, subtitle, short_description, details_title, details_text, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
     ON DUPLICATE KEY UPDATE
       map_id = VALUES(map_id),
       name = VALUES(name),
       points = VALUES(points),
       subtitle = VALUES(subtitle),
       short_description = VALUES(short_description),
       details_title = VALUES(details_title),
       details_text = VALUES(details_text),
       updated_at = VALUES(updated_at)`,
    [
      zoneRow.id,
      zoneRow.map_id,
      zoneRow.name,
      zoneRow.points,
      subtitle,
      shortDescription,
      detailsTitle,
      detailsText,
      now,
      now,
    ],
  );
}

const ZONES_LIST_SQL = `SELECT z.*,
  vz.subtitle AS visit_subtitle,
  vz.short_description AS visit_short_description,
  vz.details_title AS visit_details_title,
  vz.details_text AS visit_details_text
FROM zones z
LEFT JOIN visit_zones vz ON vz.id = z.id`;

router.get('/', async (req, res) => {
  try {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    const zones = mapId
      ? await queryAll(`${ZONES_LIST_SQL} WHERE z.map_id = ?`, [mapId])
      : await queryAll(ZONES_LIST_SQL);
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
    const zone = await queryOne(`${ZONES_LIST_SQL} WHERE z.id = ?`, [req.params.id]);
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
    const nextLiving = living_beings !== undefined
      ? normalizeLivingBeings(living_beings, '')
      : existingLiving;
    const nextCurrentPlant = nextLiving.length > 0
      ? ''
      : (current_plant !== undefined
        ? String(current_plant || '').trim()
        : String(zone.current_plant || '').trim());
    if (living_beings !== undefined) {
      const prevCp = String(zone.current_plant || '').trim();
      if (prevCp && !nextLiving.some((n) => String(n).trim() === prevCp)) {
        await execute(
          'INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)',
          [zone.id, prevCp, new Date().toISOString().split('T')[0]]
        );
      }
    } else if (
      current_plant !== undefined
      && zone.current_plant
      && String(zone.current_plant).trim() !== ''
      && String(zone.current_plant).trim() !== String(nextCurrentPlant || '').trim()
    ) {
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
    const updated = await queryOne(`${ZONES_LIST_SQL} WHERE z.id = ?`, [zone.id]);
    const history = await queryAll('SELECT * FROM zone_history WHERE zone_id=? ORDER BY harvested_at DESC', [zone.id]);
    if (hasVisitZoneContentPatch(req.body)) {
      await upsertVisitZoneEditorial(req.body, updated);
    }
    const updatedWithVisit = await queryOne(`${ZONES_LIST_SQL} WHERE z.id = ?`, [zone.id]);
    emitGardenChanged({ reason: 'update_zone', zoneId: zone.id, mapId: updatedWithVisit.map_id });
    res.json({ ...withLivingBeings(updatedWithVisit), special: !!updatedWithVisit.special, history });
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id/photos', async (req, res) => {
  try {
    const zoneId = req.params.id;
    const photos = await queryAll(
      'SELECT id, zone_id, caption, sort_order, uploaded_at, image_path FROM zone_photos WHERE zone_id=? ORDER BY sort_order ASC, id ASC',
      [zoneId]
    );
    res.json(photos.map((p) => serializeZonePhotoListRow(p, zoneId)));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/photos/reorder', requirePermission('zones.manage', { needsElevation: true }), async (req, res) => {
  try {
    const zoneId = String(req.params.id || '').trim();
    const zone = await queryOne('SELECT id, map_id FROM zones WHERE id = ?', [zoneId]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const raw = req.body?.photo_ids ?? req.body?.ordered_ids;
    if (!Array.isArray(raw)) {
      return res.status(400).json({ error: 'Liste photo_ids (ou ordered_ids) requise' });
    }
    const photoIds = raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    const rows = await queryAll('SELECT id FROM zone_photos WHERE zone_id = ?', [zoneId]);
    const existing = rows.map((r) => r.id);
    if (photoIds.length !== existing.length || existing.length === 0) {
      return res.status(400).json({ error: 'La liste doit contenir exactement toutes les photos de la zone' });
    }
    const set = new Set(existing);
    for (const id of photoIds) {
      if (!set.has(id)) return res.status(400).json({ error: 'Identifiant de photo invalide' });
    }
    if (new Set(photoIds).size !== photoIds.length) {
      return res.status(400).json({ error: 'photo_ids en double' });
    }
    await withTransaction(async (tx) => {
      for (let i = 0; i < photoIds.length; i += 1) {
        await tx.execute('UPDATE zone_photos SET sort_order = ? WHERE id = ? AND zone_id = ?', [i, photoIds[i], zoneId]);
      }
    });
    emitGardenChanged({ reason: 'reorder_zone_photos', zoneId, mapId: zone.map_id });
    res.json({ ok: true });
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
      const redirectTo = redirectIfPublicZonePhotoDataUrl(p.image_path, req.params.id, req.params.pid);
      if (redirectTo) return res.redirect(302, redirectTo);
      const absolutePath = getAbsolutePath(p.image_path);
      return res.sendFile(absolutePath, sendFilePublicImageOptions(), (err) => {
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
    const nextSortRow = await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM zone_photos WHERE zone_id = ?',
      [req.params.id]
    );
    const sortOrder = Number(nextSortRow?.n) >= 0 ? Number(nextSortRow.n) : 0;
    const result = await execute(
      'INSERT INTO zone_photos (zone_id, image_path, caption, sort_order, uploaded_at) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, null, caption || '', sortOrder, new Date().toISOString()]
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
    await generateMapPhotoThumbFromMainRelativePath(relativePath);
    const photo = await queryOne('SELECT id, zone_id, caption, sort_order, uploaded_at, image_path FROM zone_photos WHERE id=?', [photoId]);
    emitGardenChanged({ reason: 'add_zone_photo', zoneId: req.params.id, mapId: zone.map_id });
    res.status(201).json(serializeZonePhotoListRow(photo, req.params.id));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/photos/:pid', requirePermission('zones.manage', { needsElevation: true }), async (req, res) => {
  try {
    const zone = await queryOne('SELECT map_id FROM zones WHERE id = ?', [req.params.id]);
    const p = await queryOne('SELECT image_path FROM zone_photos WHERE id=? AND zone_id=?', [req.params.pid, req.params.id]);
    if (p && p.image_path) deleteMapPhotoMainAndThumb(p.image_path);
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
    const nextCurrentPlant = nextLiving.length > 0 ? '' : String(current_plant || '').trim();
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
      if (p && p.image_path) deleteMapPhotoMainAndThumb(p.image_path);
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
