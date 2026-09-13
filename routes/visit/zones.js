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
const {
  readAudienceWriteFields,
  serializeRoleSlugList,
  withLocationAudienceFields,
} = require('../../lib/locationAudience');

const router = express.Router();

function resolveAudienceForInsert(body) {
  const audienceInput = readAudienceWriteFields(body);
  if (!audienceInput.ok) return audienceInput;
  return {
    ok: true,
    visible_role_slugs: serializeRoleSlugList(audienceInput.visible_role_slugs || []) || null,
    restricted_note: audienceInput.restricted_note || null,
    restricted_note_role_slugs:
      serializeRoleSlugList(audienceInput.restricted_note_role_slugs || []) || null,
  };
}

function resolveAudienceForUpdate(body, exists) {
  const audienceInput = readAudienceWriteFields(body);
  if (!audienceInput.ok) return audienceInput;
  return {
    ok: true,
    visible_role_slugs:
      audienceInput.visible_role_slugs === null
        ? (exists.visible_role_slugs ?? null)
        : serializeRoleSlugList(audienceInput.visible_role_slugs) || null,
    restricted_note:
      audienceInput.restricted_note === null
        ? (exists.restricted_note ?? null)
        : audienceInput.restricted_note || null,
    restricted_note_role_slugs:
      audienceInput.restricted_note_role_slugs === null
        ? (exists.restricted_note_role_slugs ?? null)
        : serializeRoleSlugList(audienceInput.restricted_note_role_slugs) || null,
  };
}

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
    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO visit_zones
        (id, map_id, name, points, subtitle, short_description, details_title, details_text, body_json,
         visible_role_slugs, restricted_note, restricted_note_role_slugs,
         sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        audience.restricted_note,
        audience.restricted_note_role_slugs,
        Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : 0,
        req.body.is_active === false ? 0 : 1,
        nowIso(),
        nowIso(),
      ],
    );
    const row = await queryOne('SELECT * FROM visit_zones WHERE id = ?', [id]);
    res.status(201).json(withLocationAudienceFields(row));
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
           visible_role_slugs = ?, restricted_note = ?, restricted_note_role_slugs = ?,
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
        audience.restricted_note,
        audience.restricted_note_role_slugs,
        isActive,
        sortOrder,
        nowIso(),
        zoneId,
      ],
    );
    const row = await queryOne('SELECT * FROM visit_zones WHERE id = ?', [zoneId]);
    res.json(withLocationAudienceFields(row));
  }),
);

router.delete(
  '/zones/:id',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const zoneId = String(req.params.id || '').trim();
    if (!zoneId) return res.status(400).json({ error: 'Zone invalide' });
    await withTransaction((tx) => deleteVisitTargetCascade('zone', zoneId, tx));
    await logAudit('visit_zone_delete', 'visit_zone', zoneId, `Suppression zone visite ${zoneId}`, {
      req,
    });
    res.json({ ok: true });
  }),
);

module.exports = router;
