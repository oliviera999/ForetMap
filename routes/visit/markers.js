'use strict';

// O10 — sous-routeur du sous-domaine « markers » (CRUD) de routes/visit.js.
// Monté sans préfixe via router.use(...) côté visit.js : chemins inchangés.
// N'importe AUCUN symbole de visit.js (zéro import circulaire) — uniquement lib/, database, middleware.
const express = require('express');
const crypto = require('node:crypto');
const { queryOne, execute } = require('../../database');
const { requirePermission } = require('../../middleware/requireTeacher');
const asyncHandler = require('../../lib/asyncHandler');
const { deleteVisitTargetCascade } = require('../../lib/visitTargetCleanup');
const { nowIso, resolveVisitMapId, mapExists } = require('../../lib/visitRouteShared');
const {
  parseVisitEditorialBlocksInput,
  parseVisitEditorialBlocksStored,
  serializeVisitEditorialBlocks,
} = require('../../lib/visitEditorialBlocks');
const { normalizeMarkerEmoji } = require('../../lib/markerEmoji');
const { normalizeCoord } = require('../../lib/visitContentHelpers');

const router = express.Router();

router.post(
  '/markers',
  requirePermission('visit.manage', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const mapId = await resolveVisitMapId(req.body.map_id);
    const label = String(req.body.label || '').trim();
    const x = normalizeCoord(req.body.x_pct);
    const y = normalizeCoord(req.body.y_pct);
    if (!mapId || !(await mapExists(mapId)))
      return res.status(400).json({ error: 'Carte introuvable' });
    if (!label) return res.status(400).json({ error: 'Nom du repère requis' });
    if (x == null || y == null) return res.status(400).json({ error: 'Position repère invalide' });
    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO visit_markers
      (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, body_json, sort_order, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        mapId,
        x,
        y,
        label,
        normalizeMarkerEmoji(req.body.emoji, { allowEmpty: true, fallback: '' }),
        String(req.body.subtitle || '').trim(),
        String(req.body.short_description || '').trim(),
        String(req.body.details_title || 'Détails').trim() || 'Détails',
        String(req.body.details_text || '').trim(),
        serializeVisitEditorialBlocks(
          parseVisitEditorialBlocksInput(req.body.visit_editorial_blocks ?? req.body.body_json),
        ),
        Number.isFinite(Number(req.body.sort_order)) ? Math.max(0, Number(req.body.sort_order)) : 0,
        req.body.is_active === false ? 0 : 1,
        nowIso(),
        nowIso(),
      ],
    );
    const row = await queryOne('SELECT * FROM visit_markers WHERE id = ?', [id]);
    res.status(201).json(row);
  }),
);

router.put(
  '/markers/:id',
  requirePermission('visit.manage', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const markerId = String(req.params.id || '').trim();
    if (!markerId) return res.status(400).json({ error: 'Repère invalide' });
    const exists = await queryOne('SELECT * FROM visit_markers WHERE id = ? LIMIT 1', [markerId]);
    if (!exists) return res.status(404).json({ error: 'Repère introuvable' });
    const label = req.body.label !== undefined ? String(req.body.label || '').trim() : exists.label;
    if (!label) return res.status(400).json({ error: 'Nom du repère requis' });
    const x = req.body.x_pct !== undefined ? normalizeCoord(req.body.x_pct) : Number(exists.x_pct);
    const y = req.body.y_pct !== undefined ? normalizeCoord(req.body.y_pct) : Number(exists.y_pct);
    if (x == null || y == null) return res.status(400).json({ error: 'Position repère invalide' });
    const emoji =
      req.body.emoji !== undefined
        ? normalizeMarkerEmoji(req.body.emoji, { allowEmpty: true, fallback: '' })
        : String(exists.emoji ?? '').trim();
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
      `UPDATE visit_markers
     SET label = ?, x_pct = ?, y_pct = ?, emoji = ?, subtitle = ?, short_description = ?, details_title = ?, details_text = ?, body_json = ?,
         is_active = ?, sort_order = ?, updated_at = ?
     WHERE id = ?`,
      [
        label,
        x,
        y,
        emoji,
        subtitle,
        shortDescription,
        detailsTitle,
        detailsText,
        bodyJson,
        isActive,
        sortOrder,
        nowIso(),
        markerId,
      ],
    );
    const row = await queryOne('SELECT * FROM visit_markers WHERE id = ?', [markerId]);
    res.json(row);
  }),
);

router.delete(
  '/markers/:id',
  requirePermission('visit.manage', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const markerId = String(req.params.id || '').trim();
    if (!markerId) return res.status(400).json({ error: 'Repère invalide' });
    await deleteVisitTargetCascade('marker', markerId);
    res.json({ ok: true });
  }),
);

module.exports = router;
