'use strict';

// O10 — sous-routeur du sous-domaine « media » (photos de visite) de routes/visit.js.
// Monté sans préfixe via router.use(...) côté visit.js : chemins inchangés.
// N'importe AUCUN symbole de visit.js (zéro import circulaire) — uniquement lib/, database, middleware.
const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { requirePermission } = require('../../middleware/requireTeacher');
const asyncHandler = require('../../lib/asyncHandler');
const { logRouteError } = require('../../lib/routeLog');
const { emitGardenChanged } = require('../../lib/realtime');
const { saveBase64ToDisk, getAbsolutePath, deleteFile } = require('../../lib/uploads');
const { nowIso } = require('../../lib/visitRouteShared');
const {
  sanitizeTargetType,
  sanitizeTargetId,
  serializeVisitMedia,
} = require('../../lib/visitContentHelpers');

const router = express.Router();

router.put(
  '/media/reorder',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const targetType = sanitizeTargetType(req.body?.target_type);
    const targetId = sanitizeTargetId(req.body?.target_id);
    const raw = req.body?.ordered_ids ?? req.body?.photo_ids;
    if (!targetType || !targetId) {
      return res.status(400).json({ error: 'target_type et target_id requis' });
    }
    if (!Array.isArray(raw)) {
      return res.status(400).json({ error: 'Liste ordered_ids (ou photo_ids) requise' });
    }
    const ids = raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
    if (targetType === 'zone') {
      const zone = await queryOne('SELECT id FROM visit_zones WHERE id = ? LIMIT 1', [targetId]);
      if (!zone) return res.status(404).json({ error: 'Zone de visite introuvable' });
    } else {
      const marker = await queryOne('SELECT id FROM visit_markers WHERE id = ? LIMIT 1', [
        targetId,
      ]);
      if (!marker) return res.status(404).json({ error: 'Repère de visite introuvable' });
    }
    const rows = await queryAll(
      'SELECT id FROM visit_media WHERE target_type = ? AND target_id = ?',
      [targetType, targetId],
    );
    const existing = rows.map((r) => r.id);
    if (ids.length !== existing.length || existing.length === 0) {
      return res
        .status(400)
        .json({ error: 'La liste doit contenir exactement tous les médias de la cible' });
    }
    const set = new Set(existing);
    for (const id of ids) {
      if (!set.has(id)) return res.status(400).json({ error: 'Identifiant de média invalide' });
    }
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: 'ordered_ids en double' });
    }
    const now = nowIso();
    await withTransaction(async (tx) => {
      for (let i = 0; i < ids.length; i += 1) {
        await tx.execute(
          'UPDATE visit_media SET sort_order = ?, updated_at = ? WHERE id = ? AND target_type = ? AND target_id = ?',
          [i, now, ids[i], targetType, targetId],
        );
      }
    });
    const mapRow =
      targetType === 'zone'
        ? await queryOne('SELECT map_id FROM visit_zones WHERE id = ? LIMIT 1', [targetId])
        : await queryOne('SELECT map_id FROM visit_markers WHERE id = ? LIMIT 1', [targetId]);
    if (mapRow?.map_id) {
      emitGardenChanged({
        reason: 'reorder_visit_media',
        mapId: mapRow.map_id,
        targetType,
        targetId,
      });
    }
    res.json({ ok: true });
  }),
);

router.get(
  '/media/:id/data',
  asyncHandler(async (req, res) => {
    const mediaId = Number(req.params.id);
    if (!Number.isFinite(mediaId) || mediaId <= 0)
      return res.status(400).json({ error: 'Photo invalide' });
    const row = await queryOne('SELECT image_path FROM visit_media WHERE id = ? LIMIT 1', [
      mediaId,
    ]);
    if (!row?.image_path) return res.status(404).json({ error: 'Image introuvable' });
    const absolutePath = getAbsolutePath(row.image_path);
    return res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  }),
);

router.post(
  '/media',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    let insertedId = null;
    const targetType = sanitizeTargetType(req.body.target_type);
    const targetId = sanitizeTargetId(req.body.target_id);
    const imageDataRaw = req.body.image_data;
    const imageData =
      imageDataRaw !== undefined && imageDataRaw !== null ? String(imageDataRaw).trim() : '';
    const imageUrl = String(req.body.image_url || '').trim();
    const caption = String(req.body.caption || '').trim();
    if (!targetType || !targetId || (!imageUrl && !imageData)) {
      return res
        .status(400)
        .json({ error: 'Photo de visite invalide (image_url ou image_data requis)' });
    }
    if (targetType === 'zone') {
      const zone = await queryOne('SELECT id FROM visit_zones WHERE id = ? LIMIT 1', [targetId]);
      if (!zone) return res.status(404).json({ error: 'Zone de visite introuvable' });
    } else {
      const marker = await queryOne('SELECT id FROM visit_markers WHERE id = ? LIMIT 1', [
        targetId,
      ]);
      if (!marker) return res.status(404).json({ error: 'Repère de visite introuvable' });
    }
    const maxSo = await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1) AS m FROM visit_media WHERE target_type = ? AND target_id = ?',
      [targetType, targetId],
    );
    const sortOrder = Number(maxSo?.m) >= 0 ? Number(maxSo.m) + 1 : 0;
    const now = nowIso();
    if (imageData) {
      const result = await execute(
        `INSERT INTO visit_media (target_type, target_id, image_url, image_path, caption, sort_order, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)`,
        [targetType, targetId, caption, sortOrder, now, now],
      );
      insertedId = result.insertId;
      const relativePath = `visit_media/${insertedId}.jpg`;
      try {
        saveBase64ToDisk(relativePath, imageData);
      } catch (fileErr) {
        await execute('DELETE FROM visit_media WHERE id = ?', [insertedId]);
        logRouteError(fileErr, req);
        return res.status(400).json({ error: 'Image invalide ou trop volumineuse' });
      }
      const publicUrl = `/api/visit/media/${insertedId}/data`;
      await execute('UPDATE visit_media SET image_path = ?, image_url = ? WHERE id = ?', [
        relativePath,
        publicUrl,
        insertedId,
      ]);
    } else {
      const result = await execute(
        `INSERT INTO visit_media (target_type, target_id, image_url, image_path, caption, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
        [targetType, targetId, imageUrl, caption, sortOrder, now, now],
      );
      insertedId = result.insertId;
    }
    const row = await queryOne('SELECT * FROM visit_media WHERE id = ?', [insertedId]);
    res.status(201).json(serializeVisitMedia(row));
  }),
);

router.put(
  '/media/:id',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const mediaId = Number(req.params.id);
    if (!Number.isFinite(mediaId) || mediaId <= 0)
      return res.status(400).json({ error: 'Photo invalide' });
    const exists = await queryOne('SELECT * FROM visit_media WHERE id = ? LIMIT 1', [mediaId]);
    if (!exists) return res.status(404).json({ error: 'Photo introuvable' });
    const caption = String(req.body.caption ?? exists.caption ?? '').trim();
    const sortOrder = Number.isFinite(Number(req.body.sort_order))
      ? Math.max(0, Number(req.body.sort_order))
      : Number(exists.sort_order || 0);
    const now = nowIso();
    const imageDataRaw = req.body.image_data;
    const imageData =
      imageDataRaw !== undefined && imageDataRaw !== null ? String(imageDataRaw).trim() : '';

    if (imageData) {
      if (exists.image_path) deleteFile(exists.image_path);
      const relativePath = `visit_media/${mediaId}.jpg`;
      try {
        saveBase64ToDisk(relativePath, imageData);
      } catch (fileErr) {
        logRouteError(fileErr, req);
        return res.status(400).json({ error: 'Image invalide ou trop volumineuse' });
      }
      const publicUrl = `/api/visit/media/${mediaId}/data`;
      await execute(
        `UPDATE visit_media
       SET image_path = ?, image_url = ?, caption = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
        [relativePath, publicUrl, caption, sortOrder, now, mediaId],
      );
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'image_url')) {
      const imageUrl = String(req.body.image_url || '').trim();
      if (!imageUrl) return res.status(400).json({ error: 'image_url requis' });
      if (exists.image_path) deleteFile(exists.image_path);
      await execute(
        `UPDATE visit_media
       SET image_path = NULL, image_url = ?, caption = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
        [imageUrl, caption, sortOrder, now, mediaId],
      );
    } else {
      const hasDisplay =
        (exists.image_path && String(exists.image_path).trim()) ||
        (exists.image_url && String(exists.image_url).trim());
      if (!hasDisplay) return res.status(400).json({ error: 'Photo invalide' });
      await execute(
        `UPDATE visit_media SET caption = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
        [caption, sortOrder, now, mediaId],
      );
    }
    const row = await queryOne('SELECT * FROM visit_media WHERE id = ?', [mediaId]);
    res.json(serializeVisitMedia(row));
  }),
);

router.delete(
  '/media/:id',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const mediaId = Number(req.params.id);
    if (!Number.isFinite(mediaId) || mediaId <= 0)
      return res.status(400).json({ error: 'Photo invalide' });
    const row = await queryOne('SELECT image_path FROM visit_media WHERE id = ? LIMIT 1', [
      mediaId,
    ]);
    if (row?.image_path) deleteFile(row.image_path);
    await execute('DELETE FROM visit_media WHERE id = ?', [mediaId]);
    res.json({ ok: true });
  }),
);

module.exports = router;
