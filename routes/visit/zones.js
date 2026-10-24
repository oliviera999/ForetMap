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
const {
  nowIso,
  resolveVisitMapId,
  mapExists,
  VISIT_PLACE_ON_MAP_ERROR,
} = require('../../lib/visitRouteShared');
const { emitGardenChanged } = require('../../lib/realtime');
const { resolveZoneEmojiForWrite } = require('../../lib/zoneEmoji');
const {
  parseVisitEditorialBlocksInput,
  parseVisitEditorialBlocksStored,
  serializeVisitEditorialBlocks,
} = require('../../lib/visitEditorialBlocks');
const { normalizePoints } = require('../../lib/visitContentHelpers');
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

/** Polygone stocké (JSON ou déjà parsé) identique au polygone normalisé du corps. */
function storedPointsEqual(stored, normalized) {
  let parsed = stored;
  if (typeof stored === 'string') {
    try {
      parsed = JSON.parse(stored);
    } catch (_) {
      return false;
    }
  }
  return JSON.stringify(parsed) === JSON.stringify(normalized);
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
    const notesInput = await readVisitNotesInput(req, res, 'zone');
    if (!notesInput) return undefined;
    // La Visite reflète la carte (`lib/visitMapMirror.js`) : une zone dessinée ici est d'abord
    // un lieu de la carte, avec le même identifiant.
    const id = 'zone-' + crypto.randomUUID().slice(0, 8);
    const shortDescription = String(req.body.short_description || '').trim();
    await withTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO zones
          (id, map_id, name, emoji, x, y, width, height, special, shape, points, color, description)
         VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 'polygon', ?, '#86efac80', ?)`,
        [
          id,
          mapId,
          name,
          resolveZoneEmojiForWrite(undefined, name, ''),
          JSON.stringify(points),
          shortDescription,
        ],
      );
      await tx.execute(
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
          nowIso(),
          nowIso(),
        ],
      );
    });
    emitGardenChanged({ reason: 'create_zone', zoneId: id, mapId });
    await applyVisitNotes('zone', id, notesInput);
    const row = await queryOne('SELECT * FROM visit_zones WHERE id = ?', [id]);
    res
      .status(201)
      .json(await withVisitNotes('zone', id, withLocationAudienceFields(row), req.auth));
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
    const notesInput = await readVisitNotesInput(req, res, 'zone');
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
    // L'éditeur renvoie le nom ouvert avec le formulaire. On ne le recopie sur la carte
    // que s'il diffère encore de la fiche carte et que la révision correspond.
    const mapZone = await queryOne(
      'SELECT name, points, emoji, edit_revision FROM zones WHERE id = ? LIMIT 1',
      [zoneId],
    );
    const nameChanged = !!(
      mapZone &&
      req.body.name !== undefined &&
      name !== String(mapZone.name || '').trim()
    );
    const pointsChanged = !!(
      mapZone &&
      maybePoints &&
      !storedPointsEqual(mapZone.points, maybePoints)
    );
    const gate = await claimVisitIdentityWrite(
      'zone',
      zoneId,
      req.body,
      nameChanged || pointsChanged,
    );
    if (gate.error) return res.status(gate.error.status).json(gate.error.body);
    if (gate.missing) return res.status(404).json({ error: 'Zone introuvable' });
    const visitSets = [];
    const visitParams = [];
    if (!mapZone || nameChanged) {
      visitSets.push('name = ?');
      visitParams.push(name);
    }
    if ((!mapZone && maybePoints) || pointsChanged) {
      visitSets.push('points = ?');
      visitParams.push(JSON.stringify(maybePoints));
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
      zoneId,
    );
    let identityWritten = false;
    try {
      await execute(`UPDATE visit_zones SET ${visitSets.join(', ')} WHERE id = ?`, visitParams);
      if (gate.apply && mapZone) {
        const mapSets = [];
        const mapParams = [];
        if (nameChanged) {
          mapSets.push('name = ?', 'emoji = ?');
          mapParams.push(name, resolveZoneEmojiForWrite(undefined, name, mapZone.emoji || ''));
        }
        if (pointsChanged) {
          mapSets.push('points = ?');
          mapParams.push(JSON.stringify(maybePoints));
        }
        if (mapSets.length) {
          await execute(`UPDATE zones SET ${mapSets.join(', ')} WHERE id = ?`, [
            ...mapParams,
            zoneId,
          ]);
          identityWritten = true;
          emitGardenChanged({ reason: 'update_zone', zoneId, mapId: exists.map_id });
        }
      }
      await applyVisitNotes('zone', zoneId, notesInput);
    } catch (err) {
      if (!identityWritten) await releaseVisitIdentityWrite('zone', zoneId, gate.claim);
      throw err;
    }
    const row = await queryOne('SELECT * FROM visit_zones WHERE id = ?', [zoneId]);
    row.edit_revision = gate.apply
      ? gate.claim.revision
      : mapZone
        ? Number(mapZone.edit_revision) || 0
        : null;
    res.json(await withVisitNotes('zone', zoneId, withLocationAudienceFields(row), req.auth));
  }),
);

router.delete(
  '/zones/:id',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const zoneId = String(req.params.id || '').trim();
    if (!zoneId) return res.status(400).json({ error: 'Zone invalide' });
    if (await queryOne('SELECT id FROM zones WHERE id = ? LIMIT 1', [zoneId])) {
      return res.status(409).json({ error: VISIT_PLACE_ON_MAP_ERROR });
    }
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
