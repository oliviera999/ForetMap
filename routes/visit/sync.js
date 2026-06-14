'use strict';

// O10 — sous-routeur du sous-domaine « sync » de routes/visit.js
// (GET /sync/options, POST /sync, POST /rebuild-from-map).
// Monté sans préfixe via router.use(...) côté visit.js : chemins inchangés.
// N'importe AUCUN symbole de visit.js (zéro import circulaire) — uniquement lib/, database, middleware.
const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { requirePermission } = require('../../middleware/requireTeacher');
const { logRouteError } = require('../../lib/routeLog');
const { emitGardenChanged } = require('../../lib/realtime');
const { deleteFile } = require('../../lib/uploads');
const { visitContentRowIsPublicActive } = require('../../lib/visitContentPublicActive');
const { resolveDefaultMapId } = require('../../lib/settings');
const {
  parseVisitEditorialBlocksStored,
  serializeVisitEditorialBlocks,
} = require('../../lib/visitEditorialBlocks');
const { normalizeMarkerEmoji } = require('../../lib/markerEmoji');
const { normalizeIdList } = require('../../lib/visitContentHelpers');

const router = express.Router();

// Helpers partagés courts recopiés depuis visit.js (purs ou I/O triviale mono-requête) —
// laissés AUSSI dans visit.js car ses routes hors-sync les utilisent encore.
function nowIso() {
  return new Date().toISOString();
}

async function resolveVisitMapId(rawMapId) {
  const requested = String(rawMapId || '').trim();
  if (requested) return requested;
  return resolveDefaultMapId('visit');
}

async function mapExists(mapId) {
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
  return !!row;
}

router.get('/sync/options', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mapId = await resolveVisitMapId(req.query.map_id);
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const [mapZones, mapMarkers, visitZones, visitMarkers] = await Promise.all([
      queryAll(
        `SELECT id, name
         FROM zones
         WHERE map_id = ?
         ORDER BY name ASC, id ASC`,
        [mapId]
      ),
      queryAll(
        `SELECT id, label
         FROM map_markers
         WHERE map_id = ?
         ORDER BY label ASC, id ASC`,
        [mapId]
      ),
      queryAll(
        `SELECT id, name
         FROM visit_zones
         WHERE map_id = ?
         ORDER BY sort_order ASC, name ASC, id ASC`,
        [mapId]
      ),
      queryAll(
        `SELECT id, label
         FROM visit_markers
         WHERE map_id = ?
         ORDER BY sort_order ASC, label ASC, id ASC`,
        [mapId]
      ),
    ]);

    return res.json({
      map_id: mapId,
      source: {
        map: {
          zones: mapZones,
          markers: mapMarkers,
        },
        visit: {
          zones: visitZones,
          markers: visitMarkers,
        },
      },
    });
  } catch (err) {
    logRouteError(err, req);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/sync', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mapId = await resolveVisitMapId(req.body.map_id);
    const direction = String(req.body.direction || '').trim();
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    if (direction !== 'map_to_visit' && direction !== 'visit_to_map') {
      return res.status(400).json({ error: 'direction invalide' });
    }

    const zoneIds = normalizeIdList(req.body.zone_ids);
    const markerIds = normalizeIdList(req.body.marker_ids);
    if (zoneIds.length === 0 && markerIds.length === 0) {
      return res.status(400).json({ error: 'Aucun élément sélectionné' });
    }

    const sourceZones = direction === 'map_to_visit'
      ? await queryAll('SELECT id, map_id, name, points FROM zones WHERE map_id = ?', [mapId])
      : await queryAll('SELECT id, map_id, name, points FROM visit_zones WHERE map_id = ?', [mapId]);
    const sourceMarkers = direction === 'map_to_visit'
      ? await queryAll('SELECT id, map_id, x_pct, y_pct, label, emoji FROM map_markers WHERE map_id = ?', [mapId])
      : await queryAll('SELECT id, map_id, x_pct, y_pct, label, emoji FROM visit_markers WHERE map_id = ?', [mapId]);

    const zoneById = new Map(sourceZones.map((z) => [String(z.id), z]));
    const markerById = new Map(sourceMarkers.map((m) => [String(m.id), m]));

    const invalidZoneIds = zoneIds.filter((id) => !zoneById.has(id));
    const invalidMarkerIds = markerIds.filter((id) => !markerById.has(id));
    if (invalidZoneIds.length || invalidMarkerIds.length) {
      return res.status(400).json({
        error: 'Sélection invalide',
        invalid_zone_ids: invalidZoneIds,
        invalid_marker_ids: invalidMarkerIds,
      });
    }

    const now = nowIso();
    let importedZones = 0;
    let importedMarkers = 0;

    if (direction === 'map_to_visit') {
      for (const zoneId of zoneIds) {
        const z = zoneById.get(zoneId);
        await execute(
          `INSERT INTO visit_zones
            (id, map_id, name, points, subtitle, short_description, details_title, details_text, body_json, is_active, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, '', '', 'Détails', '', NULL, 1, 0, ?, ?)
           ON DUPLICATE KEY UPDATE
             map_id = VALUES(map_id),
             name = VALUES(name),
             points = VALUES(points),
             updated_at = VALUES(updated_at)`,
          [z.id, z.map_id, z.name, z.points || '[]', now, now]
        );
        importedZones += 1;
      }
      for (const markerId of markerIds) {
        const m = markerById.get(markerId);
        await execute(
          `INSERT INTO visit_markers
            (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, body_json, is_active, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, '', '', 'Détails', '', NULL, 1, 0, ?, ?)
           ON DUPLICATE KEY UPDATE
             map_id = VALUES(map_id),
             x_pct = VALUES(x_pct),
             y_pct = VALUES(y_pct),
             label = VALUES(label),
             emoji = VALUES(emoji),
             updated_at = VALUES(updated_at)`,
          [m.id, m.map_id, m.x_pct, m.y_pct, m.label, normalizeMarkerEmoji(m.emoji, { allowEmpty: true, fallback: '' }), now, now]
        );
        importedMarkers += 1;
      }
    } else {
      for (const zoneId of zoneIds) {
        const z = zoneById.get(zoneId);
        await execute(
          `INSERT INTO zones
            (id, map_id, name, x, y, width, height, current_plant, living_beings, stage, special, shape, points, color, description)
           VALUES (?, ?, ?, 0, 0, 0, 0, '', '[]', 'empty', 0, 'polygon', ?, '#86efac80', '')
           ON DUPLICATE KEY UPDATE
             map_id = VALUES(map_id),
             name = VALUES(name),
             shape = VALUES(shape),
             points = VALUES(points)`,
          [z.id, z.map_id, z.name, z.points || '[]']
        );
        importedZones += 1;
      }
      for (const markerId of markerIds) {
        const m = markerById.get(markerId);
        await execute(
          `INSERT INTO map_markers
            (id, map_id, x_pct, y_pct, label, plant_name, living_beings, note, emoji, created_at)
           VALUES (?, ?, ?, ?, ?, '', '[]', '', ?, ?)
           ON DUPLICATE KEY UPDATE
             map_id = VALUES(map_id),
             x_pct = VALUES(x_pct),
             y_pct = VALUES(y_pct),
             label = VALUES(label),
             emoji = VALUES(emoji)`,
          [m.id, m.map_id, m.x_pct, m.y_pct, m.label, normalizeMarkerEmoji(m.emoji, { allowEmpty: true, fallback: '' }), now]
        );
        importedMarkers += 1;
      }
      emitGardenChanged({ reason: 'visit_sync_to_map', mapId });
    }

    return res.json({
      ok: true,
      map_id: mapId,
      direction,
      imported: {
        zones: importedZones,
        markers: importedMarkers,
      },
    });
  } catch (err) {
    logRouteError(err, req);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Réaligne toute la couche visite (zones + repères) sur la carte pour un plan :
 * recrée les lignes `visit_zones` / `visit_markers` à partir de `zones` / `map_markers`,
 * en réinjectant pour chaque id conservé les champs éditoriaux et l’ordre issus de l’ancienne visite.
 * Les cibles visite disparues (ids hors carte) sont retirées avec nettoyage médias / progression.
 */
router.post('/rebuild-from-map', requirePermission('visit.manage', { needsElevation: true }), async (req, res) => {
  try {
    const mapId = await resolveVisitMapId(req.body.map_id);
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const mapZones = await queryAll(
      `SELECT id, map_id, name, points FROM zones WHERE map_id = ? ORDER BY name ASC, id ASC`,
      [mapId]
    );
    const mapMarkers = await queryAll(
      `SELECT id, map_id, x_pct, y_pct, label, emoji FROM map_markers WHERE map_id = ? ORDER BY label ASC, id ASC`,
      [mapId]
    );

    const newZoneIds = new Set(mapZones.map((z) => String(z.id)));
    const newMarkerIds = new Set(mapMarkers.map((m) => String(m.id)));

    const prevZones = await queryAll('SELECT * FROM visit_zones WHERE map_id = ?', [mapId]);
    const prevMarkers = await queryAll('SELECT * FROM visit_markers WHERE map_id = ?', [mapId]);

    const savedZoneById = new Map(prevZones.map((z) => [String(z.id), z]));
    const savedMarkerById = new Map(prevMarkers.map((m) => [String(m.id), m]));

    const removedZoneIds = prevZones.map((z) => String(z.id)).filter((id) => !newZoneIds.has(id));
    const removedMarkerIds = prevMarkers.map((m) => String(m.id)).filter((id) => !newMarkerIds.has(id));

    const filesToDelete = [];
    for (const id of removedZoneIds) {
      const rows = await queryAll(
        'SELECT image_path FROM visit_media WHERE target_type = ? AND target_id = ?',
        ['zone', id]
      );
      for (const r of rows) {
        if (r.image_path) filesToDelete.push(r.image_path);
      }
    }
    for (const id of removedMarkerIds) {
      const rows = await queryAll(
        'SELECT image_path FROM visit_media WHERE target_type = ? AND target_id = ?',
        ['marker', id]
      );
      for (const r of rows) {
        if (r.image_path) filesToDelete.push(r.image_path);
      }
    }

    const now = nowIso();
    let importedZones = 0;
    let importedMarkers = 0;

    await withTransaction(async (tx) => {
      for (const id of removedZoneIds) {
        await tx.execute(`DELETE FROM visit_media WHERE target_type = 'zone' AND target_id = ?`, [id]);
        await tx.execute(`DELETE FROM visit_seen_students WHERE target_type = 'zone' AND target_id = ?`, [id]);
        await tx.execute(`DELETE FROM visit_seen_anonymous WHERE target_type = 'zone' AND target_id = ?`, [id]);
      }
      for (const id of removedMarkerIds) {
        await tx.execute(`DELETE FROM visit_media WHERE target_type = 'marker' AND target_id = ?`, [id]);
        await tx.execute(`DELETE FROM visit_seen_students WHERE target_type = 'marker' AND target_id = ?`, [id]);
        await tx.execute(`DELETE FROM visit_seen_anonymous WHERE target_type = 'marker' AND target_id = ?`, [id]);
      }

      await tx.execute('DELETE FROM visit_zones WHERE map_id = ?', [mapId]);
      await tx.execute('DELETE FROM visit_markers WHERE map_id = ?', [mapId]);

      for (const z of mapZones) {
        const saved = savedZoneById.get(String(z.id));
        const pointsStr =
          z.points != null ? (typeof z.points === 'string' ? z.points : JSON.stringify(z.points)) : '[]';
        const subtitle = saved ? String(saved.subtitle ?? '') : '';
        const shortDescription = saved ? String(saved.short_description ?? '') : '';
        const detailsTitle = saved
          ? String(saved.details_title || 'Détails').trim() || 'Détails'
          : 'Détails';
        const detailsText = saved ? String(saved.details_text ?? '') : '';
        const bodyJson = saved
          ? serializeVisitEditorialBlocks(parseVisitEditorialBlocksStored(saved.body_json))
          : null;
        const isActive = visitContentRowIsPublicActive({ visit_is_active: saved?.is_active }) ? 1 : 0;
        const sortOrder =
          saved != null && Number.isFinite(Number(saved.sort_order))
            ? Math.max(0, Number(saved.sort_order))
            : 0;
        const createdAt = saved && saved.created_at ? String(saved.created_at) : now;

        await tx.execute(
          `INSERT INTO visit_zones
            (id, map_id, name, points, subtitle, short_description, details_title, details_text, body_json, is_active, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            z.id,
            z.map_id,
            String(z.name || '').trim() || z.id,
            pointsStr,
            subtitle,
            shortDescription,
            detailsTitle,
            detailsText,
            bodyJson,
            isActive,
            sortOrder,
            createdAt,
            now,
          ]
        );
        importedZones += 1;
      }

      for (const m of mapMarkers) {
        const saved = savedMarkerById.get(String(m.id));
        const subtitle = saved ? String(saved.subtitle ?? '') : '';
        const shortDescription = saved ? String(saved.short_description ?? '') : '';
        const detailsTitle = saved
          ? String(saved.details_title || 'Détails').trim() || 'Détails'
          : 'Détails';
        const detailsText = saved ? String(saved.details_text ?? '') : '';
        const bodyJson = saved
          ? serializeVisitEditorialBlocks(parseVisitEditorialBlocksStored(saved.body_json))
          : null;
        const isActive = visitContentRowIsPublicActive({ visit_is_active: saved?.is_active }) ? 1 : 0;
        const sortOrder =
          saved != null && Number.isFinite(Number(saved.sort_order))
            ? Math.max(0, Number(saved.sort_order))
            : 0;
        const createdAt = saved && saved.created_at ? String(saved.created_at) : now;
        const emoji = normalizeMarkerEmoji(m.emoji, { allowEmpty: true, fallback: '' });

        await tx.execute(
          `INSERT INTO visit_markers
            (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, body_json, is_active, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            m.id,
            m.map_id,
            Number(m.x_pct),
            Number(m.y_pct),
            String(m.label || '').trim() || m.id,
            emoji,
            subtitle,
            shortDescription,
            detailsTitle,
            detailsText,
            bodyJson,
            isActive,
            sortOrder,
            createdAt,
            now,
          ]
        );
        importedMarkers += 1;
      }
    });

    for (const p of filesToDelete) {
      try {
        deleteFile(p);
      } catch (_) {
        /* fichier déjà absent */
      }
    }

    return res.json({
      ok: true,
      map_id: mapId,
      removed: { zones: removedZoneIds.length, markers: removedMarkerIds.length },
      imported: { zones: importedZones, markers: importedMarkers },
    });
  } catch (err) {
    logRouteError(err, req);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
