'use strict';

// O10 — sous-routeur du sous-domaine « sync » de routes/visit.js
// (GET /sync/options, POST /sync, POST /rebuild-from-map).
// Monté sans préfixe via router.use(...) côté visit.js : chemins inchangés.
// N'importe AUCUN symbole de visit.js (zéro import circulaire) — uniquement lib/, database, middleware.
const express = require('express');
const { queryAll, withTransaction } = require('../../database');
const { requirePermission } = require('../../middleware/requireTeacher');
const asyncHandler = require('../../lib/asyncHandler');
const { emitGardenChanged } = require('../../lib/realtime');
const { deleteFile } = require('../../lib/uploads');
const { visitContentRowIsPublicActive } = require('../../lib/visitContentPublicActive');
const { nowIso, resolveVisitMapId, mapExists } = require('../../lib/visitRouteShared');
const { toDbTimestamp } = require('../../lib/shared/isoTimestamp');
const {
  parseVisitEditorialBlocksStored,
  serializeVisitEditorialBlocks,
} = require('../../lib/visitEditorialBlocks');
const { normalizeIdList } = require('../../lib/visitContentHelpers');
const { normalizeMarkerEmoji } = require('../../lib/markerEmoji');
const {
  mapZoneToVisitWhitelistFields,
  mapMarkerToVisitWhitelistFields,
} = require('../../lib/visitMapToVisitFields');

const router = express.Router();

router.get(
  '/sync/options',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const mapId = await resolveVisitMapId(req.query.map_id);
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const [mapZones, mapMarkers, visitZones, visitMarkers] = await Promise.all([
      queryAll(
        `SELECT id, name
       FROM zones
       WHERE map_id = ?
       ORDER BY name ASC, id ASC`,
        [mapId],
      ),
      queryAll(
        `SELECT id, label
       FROM map_markers
       WHERE map_id = ?
       ORDER BY label ASC, id ASC`,
        [mapId],
      ),
      queryAll(
        `SELECT id, name
       FROM visit_zones
       WHERE map_id = ?
       ORDER BY sort_order ASC, name ASC, id ASC`,
        [mapId],
      ),
      queryAll(
        `SELECT id, label
       FROM visit_markers
       WHERE map_id = ?
       ORDER BY sort_order ASC, label ASC, id ASC`,
        [mapId],
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
  }),
);

router.post(
  '/sync',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
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

    const sourceZones =
      direction === 'map_to_visit'
        ? await queryAll(
            `SELECT id, map_id, name, points, description,
                    visible_role_slugs, restricted_note, restricted_note_role_slugs
             FROM zones WHERE map_id = ?`,
            [mapId],
          )
        : await queryAll('SELECT id, map_id, name, points FROM visit_zones WHERE map_id = ?', [
            mapId,
          ]);
    const sourceMarkers =
      direction === 'map_to_visit'
        ? await queryAll(
            `SELECT id, map_id, x_pct, y_pct, label, emoji, note,
                    visible_role_slugs, restricted_note, restricted_note_role_slugs
             FROM map_markers WHERE map_id = ?`,
            [mapId],
          )
        : await queryAll(
            'SELECT id, map_id, x_pct, y_pct, label, emoji FROM visit_markers WHERE map_id = ?',
            [mapId],
          );

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

    // Audit 2026-09-13 §5.5 : une requête par élément, hors transaction, laissait un import
    // partiel en cas d'échec au milieu. Lots multi-lignes dans une transaction : atomique, et
    // deux à quatre requêtes au lieu de N.
    const insertInBatches = async (tx, { head, tail, rowParams }) => {
      const BATCH = 100;
      const width = rowParams.length ? rowParams[0].length : 0;
      const placeholderRow = `(${Array.from({ length: width }, () => '?').join(', ')})`;
      for (let i = 0; i < rowParams.length; i += BATCH) {
        const chunk = rowParams.slice(i, i + BATCH);
        const placeholders = chunk.map(() => placeholderRow).join(',\n           ');
        await tx.execute(
          `${head}\n         VALUES ${placeholders}\n         ${tail}`,
          chunk.flat(),
        );
      }
      return rowParams.length;
    };

    let importedZones = 0;
    let importedMarkers = 0;

    await withTransaction(async (tx) => {
      if (direction === 'map_to_visit') {
        importedZones = await insertInBatches(tx, {
          head: `INSERT INTO visit_zones
          (id, map_id, name, points, subtitle, short_description, details_title, details_text, body_json,
           visible_role_slugs, restricted_note, restricted_note_role_slugs,
           is_active, sort_order, created_at, updated_at)`,
          tail: `ON DUPLICATE KEY UPDATE
           map_id = VALUES(map_id),
           name = VALUES(name),
           points = VALUES(points),
           short_description = VALUES(short_description),
           visible_role_slugs = VALUES(visible_role_slugs),
           restricted_note = VALUES(restricted_note),
           restricted_note_role_slugs = VALUES(restricted_note_role_slugs),
           updated_at = VALUES(updated_at)`,
          rowParams: zoneIds.map((zoneId) => {
            const w = mapZoneToVisitWhitelistFields(zoneById.get(zoneId));
            // (id, map_id, name, points, subtitle '', short_description, details_title 'Détails',
            //  details_text '', body_json NULL, audience ×3, is_active 1, sort_order 0, created, updated)
            return [
              w.id,
              w.map_id,
              w.name,
              w.points,
              '',
              w.short_description,
              'Détails',
              '',
              null,
              w.visible_role_slugs,
              w.restricted_note,
              w.restricted_note_role_slugs,
              1,
              0,
              now,
              now,
            ];
          }),
        });
        importedMarkers = await insertInBatches(tx, {
          head: `INSERT INTO visit_markers
          (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, body_json,
           visible_role_slugs, restricted_note, restricted_note_role_slugs,
           is_active, sort_order, created_at, updated_at)`,
          tail: `ON DUPLICATE KEY UPDATE
           map_id = VALUES(map_id),
           x_pct = VALUES(x_pct),
           y_pct = VALUES(y_pct),
           label = VALUES(label),
           emoji = VALUES(emoji),
           short_description = VALUES(short_description),
           visible_role_slugs = VALUES(visible_role_slugs),
           restricted_note = VALUES(restricted_note),
           restricted_note_role_slugs = VALUES(restricted_note_role_slugs),
           updated_at = VALUES(updated_at)`,
          rowParams: markerIds.map((markerId) => {
            const w = mapMarkerToVisitWhitelistFields(markerById.get(markerId));
            return [
              w.id,
              w.map_id,
              w.x_pct,
              w.y_pct,
              w.label,
              w.emoji,
              '',
              w.short_description,
              'Détails',
              '',
              null,
              w.visible_role_slugs,
              w.restricted_note,
              w.restricted_note_role_slugs,
              1,
              0,
              now,
              now,
            ];
          }),
        });
      } else {
        importedZones = await insertInBatches(tx, {
          head: `INSERT INTO zones
          (id, map_id, name, x, y, width, height, current_plant, stage, special, shape, points, color, description)`,
          tail: `ON DUPLICATE KEY UPDATE
           map_id = VALUES(map_id),
           name = VALUES(name),
           shape = VALUES(shape),
           points = VALUES(points)`,
          rowParams: zoneIds.map((zoneId) => {
            const z = zoneById.get(zoneId);
            return [
              z.id,
              z.map_id,
              z.name,
              0,
              0,
              0,
              0,
              '',
              'empty',
              0,
              'polygon',
              z.points || '[]',
              '#86efac80',
              '',
            ];
          }),
        });
        importedMarkers = await insertInBatches(tx, {
          head: `INSERT INTO map_markers
          (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at)`,
          tail: `ON DUPLICATE KEY UPDATE
           map_id = VALUES(map_id),
           x_pct = VALUES(x_pct),
           y_pct = VALUES(y_pct),
           label = VALUES(label),
           emoji = VALUES(emoji)`,
          rowParams: markerIds.map((markerId) => {
            const m = markerById.get(markerId);
            return [
              m.id,
              m.map_id,
              m.x_pct,
              m.y_pct,
              m.label,
              '',
              '',
              normalizeMarkerEmoji(m.emoji, { allowEmpty: true, fallback: '' }),
              now,
            ];
          }),
        });
      }
    });
    if (direction !== 'map_to_visit') {
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
  }),
);

/**
 * Réaligne toute la couche visite (zones + repères) sur la carte pour un plan :
 * recrée les lignes `visit_zones` / `visit_markers` à partir de `zones` / `map_markers`,
 * en réinjectant pour chaque id conservé les champs éditoriaux et l’ordre issus de l’ancienne visite.
 * Les cibles visite disparues (ids hors carte) sont retirées avec nettoyage médias / progression.
 * Audience + short_description (liste blanche) viennent de la carte ; restricted_note
 * n’est jamais injecté dans les champs publics.
 */
router.post(
  '/rebuild-from-map',
  requirePermission('visit.manage'),
  asyncHandler(async (req, res) => {
    const mapId = await resolveVisitMapId(req.body.map_id);
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });

    const mapZones = await queryAll(
      `SELECT id, map_id, name, points, description,
              visible_role_slugs, restricted_note, restricted_note_role_slugs
       FROM zones WHERE map_id = ? ORDER BY name ASC, id ASC`,
      [mapId],
    );
    const mapMarkers = await queryAll(
      `SELECT id, map_id, x_pct, y_pct, label, emoji, note,
              visible_role_slugs, restricted_note, restricted_note_role_slugs
       FROM map_markers WHERE map_id = ? ORDER BY label ASC, id ASC`,
      [mapId],
    );

    const newZoneIds = new Set(mapZones.map((z) => String(z.id)));
    const newMarkerIds = new Set(mapMarkers.map((m) => String(m.id)));

    const prevZones = await queryAll('SELECT * FROM visit_zones WHERE map_id = ?', [mapId]);
    const prevMarkers = await queryAll('SELECT * FROM visit_markers WHERE map_id = ?', [mapId]);

    const savedZoneById = new Map(prevZones.map((z) => [String(z.id), z]));
    const savedMarkerById = new Map(prevMarkers.map((m) => [String(m.id), m]));

    const removedZoneIds = prevZones.map((z) => String(z.id)).filter((id) => !newZoneIds.has(id));
    const removedMarkerIds = prevMarkers
      .map((m) => String(m.id))
      .filter((id) => !newMarkerIds.has(id));

    // 1 SELECT IN par type de cible (au lieu d'une requête visit_media par id supprimé).
    const filesToDelete = [];
    for (const [targetType, removedIds] of [
      ['zone', removedZoneIds],
      ['marker', removedMarkerIds],
    ]) {
      if (!removedIds.length) continue;
      const rows = await queryAll(
        `SELECT image_path FROM visit_media WHERE target_type = ? AND target_id IN (${removedIds
          .map(() => '?')
          .join(',')})`,
        [targetType, ...removedIds],
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
        await tx.execute(`DELETE FROM visit_media WHERE target_type = 'zone' AND target_id = ?`, [
          id,
        ]);
        await tx.execute(
          `DELETE FROM visit_seen_students WHERE target_type = 'zone' AND target_id = ?`,
          [id],
        );
        await tx.execute(
          `DELETE FROM visit_seen_anonymous WHERE target_type = 'zone' AND target_id = ?`,
          [id],
        );
      }
      for (const id of removedMarkerIds) {
        await tx.execute(`DELETE FROM visit_media WHERE target_type = 'marker' AND target_id = ?`, [
          id,
        ]);
        await tx.execute(
          `DELETE FROM visit_seen_students WHERE target_type = 'marker' AND target_id = ?`,
          [id],
        );
        await tx.execute(
          `DELETE FROM visit_seen_anonymous WHERE target_type = 'marker' AND target_id = ?`,
          [id],
        );
      }

      await tx.execute('DELETE FROM visit_zones WHERE map_id = ?', [mapId]);
      await tx.execute('DELETE FROM visit_markers WHERE map_id = ?', [mapId]);

      for (const z of mapZones) {
        const w = mapZoneToVisitWhitelistFields(z);
        const saved = savedZoneById.get(String(z.id));
        const subtitle = saved ? String(saved.subtitle ?? '') : '';
        const detailsTitle = saved
          ? String(saved.details_title || 'Détails').trim() || 'Détails'
          : 'Détails';
        const detailsText = saved ? String(saved.details_text ?? '') : '';
        const bodyJson = saved
          ? serializeVisitEditorialBlocks(parseVisitEditorialBlocksStored(saved.body_json))
          : null;
        const isActive = visitContentRowIsPublicActive({ visit_is_active: saved?.is_active })
          ? 1
          : 0;
        const sortOrder =
          saved != null && Number.isFinite(Number(saved.sort_order))
            ? Math.max(0, Number(saved.sort_order))
            : 0;
        // `saved.created_at` est un DATETIME(3) depuis la migration 254 : mysql2 le relit en
        // objet `Date`. Un `String(...)` dessus produisait « Tue Sep 15 2026 19:12:05 GMT+0000
        // (Coordinated Universal Time) », que MySQL refuse en mode strict (ER_TRUNCATED_WRONG_VALUE)
        // — la reconstruction de la visite répondait 500. `toDbTimestamp` accepte l'objet `Date`
        // comme la chaîne d'un export antérieur à la migration.
        const createdAt = (saved && toDbTimestamp(saved.created_at)) || now;

        await tx.execute(
          `INSERT INTO visit_zones
          (id, map_id, name, points, subtitle, short_description, details_title, details_text, body_json,
           visible_role_slugs, restricted_note, restricted_note_role_slugs,
           is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            w.id,
            w.map_id,
            w.name,
            w.points,
            subtitle,
            w.short_description,
            detailsTitle,
            detailsText,
            bodyJson,
            w.visible_role_slugs,
            w.restricted_note,
            w.restricted_note_role_slugs,
            isActive,
            sortOrder,
            createdAt,
            now,
          ],
        );
        importedZones += 1;
      }

      for (const m of mapMarkers) {
        const w = mapMarkerToVisitWhitelistFields(m);
        const saved = savedMarkerById.get(String(m.id));
        const subtitle = saved ? String(saved.subtitle ?? '') : '';
        const detailsTitle = saved
          ? String(saved.details_title || 'Détails').trim() || 'Détails'
          : 'Détails';
        const detailsText = saved ? String(saved.details_text ?? '') : '';
        const bodyJson = saved
          ? serializeVisitEditorialBlocks(parseVisitEditorialBlocksStored(saved.body_json))
          : null;
        const isActive = visitContentRowIsPublicActive({ visit_is_active: saved?.is_active })
          ? 1
          : 0;
        const sortOrder =
          saved != null && Number.isFinite(Number(saved.sort_order))
            ? Math.max(0, Number(saved.sort_order))
            : 0;
        // `saved.created_at` est un DATETIME(3) depuis la migration 254 : mysql2 le relit en
        // objet `Date`. Un `String(...)` dessus produisait « Tue Sep 15 2026 19:12:05 GMT+0000
        // (Coordinated Universal Time) », que MySQL refuse en mode strict (ER_TRUNCATED_WRONG_VALUE)
        // — la reconstruction de la visite répondait 500. `toDbTimestamp` accepte l'objet `Date`
        // comme la chaîne d'un export antérieur à la migration.
        const createdAt = (saved && toDbTimestamp(saved.created_at)) || now;

        await tx.execute(
          `INSERT INTO visit_markers
          (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, body_json,
           visible_role_slugs, restricted_note, restricted_note_role_slugs,
           is_active, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            w.id,
            w.map_id,
            w.x_pct,
            w.y_pct,
            w.label,
            w.emoji,
            subtitle,
            w.short_description,
            detailsTitle,
            detailsText,
            bodyJson,
            w.visible_role_slugs,
            w.restricted_note,
            w.restricted_note_role_slugs,
            isActive,
            sortOrder,
            createdAt,
            now,
          ],
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
  }),
);

module.exports = router;
