'use strict';

// O10 — sous-routeur du sous-domaine « zones » (CRUD) de routes/visit.js.
// Monté sans préfixe via router.use(...) côté visit.js : chemins inchangés.
// N'importe AUCUN symbole de visit.js (zéro import circulaire) — uniquement lib/, database, middleware.
const express = require('express');
const crypto = require('node:crypto');
const { queryOne, execute, withTransaction } = require('../../database');
const { requirePermission } = require('../../middleware/requireTeacher');
const asyncHandler = require('../../lib/asyncHandler');
const { deleteVisitTargetCascade } = require('../../lib/visitTargetCleanup');
const { nowIso, resolveVisitMapId, mapExists } = require('../../lib/visitRouteShared');
const {
  parseVisitEditorialBlocksInput,
  parseVisitEditorialBlocksStored,
  serializeVisitEditorialBlocks,
} = require('../../lib/visitEditorialBlocks');
const { normalizePoints } = require('../../lib/visitContentHelpers');
const { logAudit } = require('../../lib/auditLog');
const { withLocationAudienceFields } = require('../../lib/locationAudience');
const {
  resolveAudienceForInsert,
  resolveAudienceForUpdate,
} = require('../../lib/visitAudienceWrite');
const {
  readVisitNotesInput,
  applyVisitNotes,
  withVisitNotes,
  deleteVisitOnlyNotes,
} = require('../../lib/visitNotesWrite');

const router = express.Router();

router.post(
  '/zones',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const mapId = await resolveVisitMapId(req.body.map_id);
    const name = String(req.body.name || '').trim();
    const points = normalizePoints(req.body.points);
    if (!mapId || !(await mapExists(mapId)))
      return res.status(400).json({ error: 'Carte introuvable' });
    if (!name) return res.status(400).json({ error: 'Nom de zone requis' });
    if (!points) return res.status(400).json({ error: 'Polygone invalide (min 3 points)' });
    const audience = resolveAudienceForInsert(req.body);
    if (!audience.ok) return res.status(400).json({ error: audience.error });
    const notesInput = await readVisitNotesInput(req, res);
    if (!notesInput) return undefined;
    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO visit_zones
        (id, map_id, name, points, subtitle, short_description, details_title, details_text, body_json,
         visible_role_slugs, visible_group_ids,
         sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        mapId,
        name,
        JSON.stringify(points),
        String(req.body.subtitle || '').trim(),
        String(req.body.short_description || '').trim(),
        String(req.body.details_title || 'Détails').trim() || 'Détails',
        String(req.body.details_text || '').trim(),
        serializeVisitEditorialBlocks(
          parseVisitEditorialBlocksInput(req.body.visit_editorial_blocks ?? req.body.body_json),
        ),
        audience.visible_role_slugs,
        audience.visible_group_ids,
        Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : 0,
        req.body.is_active === false ? 0 : 1,
        nowIso(),
        nowIso(),
      ],
    );
    await applyVisitNotes('zone', id, notesInput);
    const row = await queryOne('SELECT * FROM visit_zones WHERE id = ?', [id]);
    res.status(201).json(await withVisitNotes('zone', id, withLocationAudienceFields(row)));
  }),
);

router.put(
  '/zones/:id',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const zoneId = String(req.params.id || '').trim();
    if (!zoneId) return res.status(400).json({ error: 'Zone invalide' });
    const exists = await queryOne('SELECT * FROM visit_zones WHERE id = ? LIMIT 1', [zoneId]);
    if (!exists) return res.status(404).json({ error: 'Zone introuvable' });
    const name = req.body.name !== undefined ? String(req.body.name || '').trim() : exists.name;
    if (!name) return res.status(400).json({ error: 'Nom de zone requis' });
    const maybePoints = req.body.points !== undefined ? normalizePoints(req.body.points) : null;
    if (req.body.points !== undefined && !maybePoints) {
      return res.status(400).json({ error: 'Polygone invalide (min 3 points)' });
    }
    const audience = resolveAudienceForUpdate(req.body, exists);
    if (!audience.ok) return res.status(400).json({ error: audience.error });
    const notesInput = await readVisitNotesInput(req, res);
    if (!notesInput) return undefined;
    const subtitle =
      req.body.subtitle !== undefined
        ? String(req.body.subtitle || '').trim()
        : String(exists.subtitle || '');
    const shortDescription =
      req.body.short_description !== undefined
        ? String(req.body.short_description || '').trim()
        : String(exists.short_description || '');
    const detailsTitle =
      req.body.details_title !== undefined
        ? String(req.body.details_title || 'Détails').trim() || 'Détails'
        : String(exists.details_title || 'Détails').trim() || 'Détails';
    const detailsText =
      req.body.details_text !== undefined
        ? String(req.body.details_text || '').trim()
        : String(exists.details_text || '');
    const bodyJson =
      req.body.visit_editorial_blocks !== undefined || req.body.body_json !== undefined
        ? serializeVisitEditorialBlocks(
            parseVisitEditorialBlocksInput(req.body.visit_editorial_blocks ?? req.body.body_json),
          )
        : serializeVisitEditorialBlocks(parseVisitEditorialBlocksStored(exists.body_json));
    const isActive =
      req.body.is_active !== undefined
        ? req.body.is_active === false
          ? 0
          : 1
        : Number(exists.is_active ?? 1);
    const sortOrder =
      req.body.sort_order !== undefined
        ? Number.isFinite(Number(req.body.sort_order))
          ? Math.max(0, Number(req.body.sort_order))
          : Number(exists.sort_order || 0)
        : Number(exists.sort_order || 0);
    await execute(
      `UPDATE visit_zones
       SET name = ?, points = ?, subtitle = ?, short_description = ?, details_title = ?, details_text = ?, body_json = ?,
           visible_role_slugs = ?, visible_group_ids = ?,
           is_active = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`,
      [
        name,
        maybePoints ? JSON.stringify(maybePoints) : exists.points,
        subtitle,
        shortDescription,
        detailsTitle,
        detailsText,
        bodyJson,
        audience.visible_role_slugs,
        audience.visible_group_ids,
        isActive,
        sortOrder,
        nowIso(),
        zoneId,
      ],
    );
    await applyVisitNotes('zone', zoneId, notesInput);
    const row = await queryOne('SELECT * FROM visit_zones WHERE id = ?', [zoneId]);
    res.json(await withVisitNotes('zone', zoneId, withLocationAudienceFields(row)));
  }),
);

router.delete(
  '/zones/:id',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const zoneId = String(req.params.id || '').trim();
    if (!zoneId) return res.status(400).json({ error: 'Zone invalide' });
    await withTransaction(async (tx) => {
      await deleteVisitTargetCascade('zone', zoneId, tx);
      await deleteVisitOnlyNotes(tx, 'zone', zoneId);
    });
    await logAudit('visit_zone_delete', 'visit_zone', zoneId, `Suppression zone visite ${zoneId}`, {
      req,
    });
    res.json({ ok: true });
  }),
);

module.exports = router;
