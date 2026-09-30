'use strict';

// O10 — sous-routeur du sous-domaine « markers » (CRUD) de routes/visit.js.
// Monté sans préfixe via router.use(...) côté visit.js : chemins inchangés.
// N'importe AUCUN symbole de visit.js (zéro import circulaire) — uniquement lib/, database, middleware.
const express = require('express');
const crypto = require('node:crypto');
const { queryOne, execute, withTransaction } = require('../../database');
const { requirePermission } = require('../../middleware/requireTeacher');
const asyncHandler = require('../../lib/asyncHandler');
const { deleteVisitTargetCascade } = require('../../lib/visitTargetCleanup');
const {
  nowIso,
  resolveVisitMapId,
  mapExists,
  VISIT_PLACE_ON_MAP_ERROR,
} = require('../../lib/visitRouteShared');
const { emitGardenChanged } = require('../../lib/realtime');
const {
  parseVisitEditorialBlocksInput,
  parseVisitEditorialBlocksStored,
  serializeVisitEditorialBlocks,
} = require('../../lib/visitEditorialBlocks');
const { normalizeMarkerEmoji } = require('../../lib/markerEmoji');
const { normalizeCoord } = require('../../lib/visitContentHelpers');
const { logAudit } = require('../../lib/auditLog');
const { claimVisitIdentityWrite, releaseVisitIdentityWrite } = require('../../lib/visitMapMirror');
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
  '/markers',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const mapId = await resolveVisitMapId(req.body.map_id);
    const label = String(req.body.label || '').trim();
    const x = normalizeCoord(req.body.x_pct);
    const y = normalizeCoord(req.body.y_pct);
    if (!mapId || !(await mapExists(mapId)))
      return res.status(400).json({ error: 'Carte introuvable' });
    if (!label) return res.status(400).json({ error: 'Nom du repère requis' });
    if (x == null || y == null) return res.status(400).json({ error: 'Position repère invalide' });
    const audience = resolveAudienceForInsert(req.body);
    if (!audience.ok) return res.status(400).json({ error: audience.error });
    const notesInput = await readVisitNotesInput(req, res);
    if (!notesInput) return undefined;
    // La Visite reflète la carte (`lib/visitMapMirror.js`) : un repère posé ici est d'abord
    // un repère de la carte, avec le même identifiant.
    const id = crypto.randomUUID();
    const emoji = normalizeMarkerEmoji(req.body.emoji, { allowEmpty: true, fallback: '' });
    const shortDescription = String(req.body.short_description || '').trim();
    const now = nowIso();
    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, note, emoji, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, mapId, x, y, label, shortDescription, emoji, now],
      );
      await tx.execute(
        `INSERT INTO visit_markers
        (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, body_json,
         visible_role_slugs, visible_group_ids,
         sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          mapId,
          x,
          y,
          label,
          emoji,
          String(req.body.subtitle || '').trim(),
          shortDescription,
          String(req.body.details_title || 'Détails').trim() || 'Détails',
          String(req.body.details_text || '').trim(),
          serializeVisitEditorialBlocks(
            parseVisitEditorialBlocksInput(req.body.visit_editorial_blocks ?? req.body.body_json),
          ),
          audience.visible_role_slugs,
          audience.visible_group_ids,
          Number.isFinite(Number(req.body.sort_order))
            ? Math.max(0, Number(req.body.sort_order))
            : 0,
          req.body.is_active === false ? 0 : 1,
          now,
          now,
        ],
      );
    });
    emitGardenChanged({ reason: 'create_marker', markerId: id, mapId });
    await applyVisitNotes('marker', id, notesInput);
    const row = await queryOne('SELECT * FROM visit_markers WHERE id = ?', [id]);
    res.status(201).json(await withVisitNotes('marker', id, withLocationAudienceFields(row)));
  }),
);

router.put(
  '/markers/:id',
  requirePermission('visit.manage'),
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
    const audience = resolveAudienceForUpdate(req.body, exists);
    if (!audience.ok) return res.status(400).json({ error: audience.error });
    const notesInput = await readVisitNotesInput(req, res);
    if (!notesInput) return undefined;
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
    // L'éditeur renvoie le nom et l'emoji ouverts avec le formulaire. On ne les recopie
    // sur la carte que s'ils diffèrent encore et que la révision correspond.
    const mapMarker = await queryOne(
      'SELECT label, emoji, x_pct, y_pct, edit_revision FROM map_markers WHERE id = ? LIMIT 1',
      [markerId],
    );
    const labelChanged = !!(
      mapMarker &&
      req.body.label !== undefined &&
      label !== String(mapMarker.label || '').trim()
    );
    const emojiChanged = !!(
      mapMarker &&
      req.body.emoji !== undefined &&
      emoji !== normalizeMarkerEmoji(mapMarker.emoji, { allowEmpty: true, fallback: '' })
    );
    const xChanged = !!(
      mapMarker &&
      req.body.x_pct !== undefined &&
      x !== null &&
      Math.abs(x - Number(mapMarker.x_pct)) > 1e-6
    );
    const yChanged = !!(
      mapMarker &&
      req.body.y_pct !== undefined &&
      y !== null &&
      Math.abs(y - Number(mapMarker.y_pct)) > 1e-6
    );
    const gate = await claimVisitIdentityWrite(
      'marker',
      markerId,
      req.body,
      labelChanged || emojiChanged || xChanged || yChanged,
    );
    if (gate.error) return res.status(gate.error.status).json(gate.error.body);
    if (gate.missing) return res.status(404).json({ error: 'Repère introuvable' });
    const visitSets = [];
    const visitParams = [];
    if (!mapMarker || labelChanged) {
      visitSets.push('label = ?');
      visitParams.push(label);
    }
    if (!mapMarker || xChanged) {
      visitSets.push('x_pct = ?');
      visitParams.push(x);
    }
    if (!mapMarker || yChanged) {
      visitSets.push('y_pct = ?');
      visitParams.push(y);
    }
    if (!mapMarker || emojiChanged) {
      visitSets.push('emoji = ?');
      visitParams.push(emoji);
    }
    visitSets.push(
      'subtitle = ?',
      'short_description = ?',
      'details_title = ?',
      'details_text = ?',
      'body_json = ?',
      'visible_role_slugs = ?',
      'visible_group_ids = ?',
      'is_active = ?',
      'sort_order = ?',
      'updated_at = ?',
    );
    visitParams.push(
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
      markerId,
    );
    let identityWritten = false;
    try {
      await execute(`UPDATE visit_markers SET ${visitSets.join(', ')} WHERE id = ?`, visitParams);
      if (gate.apply && mapMarker) {
        const mapSets = [];
        const mapParams = [];
        if (labelChanged) {
          mapSets.push('label = ?');
          mapParams.push(label);
        }
        if (xChanged) {
          mapSets.push('x_pct = ?');
          mapParams.push(x);
        }
        if (yChanged) {
          mapSets.push('y_pct = ?');
          mapParams.push(y);
        }
        if (emojiChanged) {
          mapSets.push('emoji = ?');
          mapParams.push(emoji);
        }
        if (mapSets.length) {
          const result = await execute(
            `UPDATE map_markers SET ${mapSets.join(', ')} WHERE id = ?`,
            [...mapParams, markerId],
          );
          identityWritten = true;
          if (result?.affectedRows) {
            emitGardenChanged({ reason: 'update_marker', markerId, mapId: exists.map_id });
          }
        }
      }
      await applyVisitNotes('marker', markerId, notesInput);
    } catch (err) {
      if (!identityWritten) await releaseVisitIdentityWrite('marker', markerId, gate.claim);
      throw err;
    }
    const row = await queryOne('SELECT * FROM visit_markers WHERE id = ?', [markerId]);
    row.edit_revision = gate.apply
      ? gate.claim.revision
      : mapMarker
        ? Number(mapMarker.edit_revision) || 0
        : null;
    res.json(await withVisitNotes('marker', markerId, withLocationAudienceFields(row)));
  }),
);

router.delete(
  '/markers/:id',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const markerId = String(req.params.id || '').trim();
    if (!markerId) return res.status(400).json({ error: 'Repère invalide' });
    if (await queryOne('SELECT id FROM map_markers WHERE id = ? LIMIT 1', [markerId])) {
      return res.status(409).json({ error: VISIT_PLACE_ON_MAP_ERROR });
    }
    await withTransaction(async (tx) => {
      await deleteVisitTargetCascade('marker', markerId, tx);
      await deleteVisitOnlyNotes(tx, 'marker', markerId);
    });
    await logAudit(
      'visit_marker_delete',
      'visit_marker',
      markerId,
      `Suppression repère visite ${markerId}`,
      { req },
    );
    res.json({ ok: true });
  }),
);

module.exports = router;
