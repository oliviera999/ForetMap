const express = require('express');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { emitGardenChanged } = require('../lib/realtime');
const {
  serializeMarkerPhotoListRow,
  redirectIfPublicMarkerPhotoDataUrl,
} = require('../lib/uploadsPublicUrls');
const { deleteMapPhotoMainAndThumb } = require('../lib/imageThumb');
const {
  parseVisitEditorialBlocksInput,
  serializeVisitEditorialBlocks,
} = require('../lib/visitEditorialBlocks');
const { resolveDefaultMapId } = require('../lib/settings');
const { deleteVisitTargetCascade } = require('../lib/visitTargetCleanup');
const {
  loadMarkerSpeciesMap,
  syncMarkerSpecies,
  attachSpeciesToEntity,
} = require('../lib/speciesJunction');
const { normalizeMarkerEmoji } = require('../lib/markerEmoji');
const {
  registerEntityPhotoRoutes,
  reorderPhotosBodySchema,
  addPhotoBodySchema,
} = require('../lib/entityPhotoRoutes');

const db = { queryAll, queryOne, execute, withTransaction };

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
  const cleaned = [...new Set(base.map((v) => String(v || '').trim()).filter(Boolean))];
  if (cleaned.length === 0 && fallback && String(fallback).trim()) return [String(fallback).trim()];
  return cleaned;
}

function hasVisitMarkerContentPatch(body) {
  if (!body || typeof body !== 'object') return false;
  return [
    'visit_subtitle',
    'visit_short_description',
    'visit_details_title',
    'visit_details_text',
    'visit_body_json',
    'visit_editorial_blocks',
  ].some((k) => body[k] !== undefined);
}

async function upsertVisitMarkerEditorial(reqBody, markerRow) {
  const existing = await queryOne(
    'SELECT subtitle, short_description, details_title, details_text, body_json FROM visit_markers WHERE id = ? LIMIT 1',
    [markerRow.id],
  );
  const subtitle =
    reqBody.visit_subtitle !== undefined
      ? String(reqBody.visit_subtitle || '').trim()
      : String(existing?.subtitle || '');
  const shortDescription =
    reqBody.visit_short_description !== undefined
      ? String(reqBody.visit_short_description || '').trim()
      : String(existing?.short_description || '');
  const detailsTitle =
    reqBody.visit_details_title !== undefined
      ? String(reqBody.visit_details_title || 'Détails').trim() || 'Détails'
      : String(existing?.details_title || 'Détails').trim() || 'Détails';
  const detailsText =
    reqBody.visit_details_text !== undefined
      ? String(reqBody.visit_details_text || '').trim()
      : String(existing?.details_text || '');
  const patchBlocksInput =
    reqBody.visit_editorial_blocks !== undefined
      ? reqBody.visit_editorial_blocks
      : reqBody.visit_body_json;
  const normalizedBlocks =
    patchBlocksInput !== undefined
      ? parseVisitEditorialBlocksInput(patchBlocksInput)
      : parseVisitEditorialBlocksInput(existing?.body_json);
  const bodyJson = serializeVisitEditorialBlocks(normalizedBlocks);
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO visit_markers
      (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, body_json, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
     ON DUPLICATE KEY UPDATE
       map_id = VALUES(map_id),
       x_pct = VALUES(x_pct),
       y_pct = VALUES(y_pct),
       label = VALUES(label),
       emoji = VALUES(emoji),
       subtitle = VALUES(subtitle),
       short_description = VALUES(short_description),
       details_title = VALUES(details_title),
       details_text = VALUES(details_text),
       body_json = VALUES(body_json),
       updated_at = VALUES(updated_at)`,
    [
      markerRow.id,
      markerRow.map_id,
      markerRow.x_pct,
      markerRow.y_pct,
      markerRow.label,
      normalizeMarkerEmoji(markerRow.emoji, { allowEmpty: true, fallback: '' }),
      subtitle,
      shortDescription,
      detailsTitle,
      detailsText,
      bodyJson,
      now,
      now,
    ],
  );
}

const MARKERS_LIST_SQL = `SELECT m.*,
  vm.subtitle AS visit_subtitle,
  vm.short_description AS visit_short_description,
  vm.details_title AS visit_details_title,
  vm.details_text AS visit_details_text,
  vm.body_json AS visit_body_json
FROM map_markers m
LEFT JOIN visit_markers vm ON vm.id = m.id`;

// Routes photos (data / liste / reorder / ajout / suppression) : fabrique partagée
// avec routes/zones.js — comportement et contrats inchangés (audit : déduplication ~250 lignes).
registerEntityPhotoRoutes(router, {
  basePath: '/markers',
  permission: 'map.manage_markers',
  entityTable: 'map_markers',
  entityNotFound: 'Repère introuvable',
  photoTable: 'marker_photos',
  fkColumn: 'marker_id',
  reorderAllMessage: 'La liste doit contenir exactement toutes les photos du repère',
  uploadDirPrefix: 'markers',
  serializeRow: serializeMarkerPhotoListRow,
  redirectPublicDataUrl: redirectIfPublicMarkerPhotoDataUrl,
  emitKey: 'markerId',
  emitReasons: {
    reorder: 'reorder_marker_photos',
    add: 'add_marker_photo',
    delete: 'delete_marker_photo',
  },
});

router.get(
  '/markers',
  asyncHandler(async (req, res) => {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    const rows = mapId
      ? await queryAll(`${MARKERS_LIST_SQL} WHERE m.map_id = ? ORDER BY m.created_at`, [mapId])
      : await queryAll(`${MARKERS_LIST_SQL} ORDER BY m.created_at`);
    const speciesMap = await loadMarkerSpeciesMap(
      db,
      rows.map((row) => row.id),
    );
    res.json(
      rows.map((row) =>
        attachSpeciesToEntity(row, speciesMap.get(String(row.id)) || [], {
          legacySingleName: row.plant_name,
        }),
      ),
    );
  }),
);

router.post(
  '/markers',
  requirePermission('map.manage_markers'),
  asyncHandler(async (req, res) => {
    const { x_pct, y_pct, label, plant_name, living_beings, note, emoji, map_id, species_ids } =
      req.body;
    const mapId = String(map_id || '').trim() || (await resolveDefaultMapId('teacher'));
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    if (!label?.trim()) return res.status(400).json({ error: 'Label requis' });
    const nextLiving = normalizeLivingBeings(living_beings, plant_name);
    const nextPlantName = nextLiving.length > 0 ? '' : String(plant_name || '').trim();
    const id = crypto.randomUUID();
    await execute(
      'INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        mapId,
        x_pct,
        y_pct,
        label.trim(),
        nextPlantName,
        note || '',
        normalizeMarkerEmoji(emoji, { allowEmpty: true, fallback: '' }),
        new Date().toISOString(),
      ],
    );
    await syncMarkerSpecies(db, id, species_ids, nextLiving);
    let row = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [id]);
    if (hasVisitMarkerContentPatch(req.body)) {
      await upsertVisitMarkerEditorial(req.body, row);
      row = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [id]);
    }
    const speciesRows = await loadMarkerSpeciesMap(db, [id]);
    emitGardenChanged({ reason: 'create_marker', markerId: id, mapId });
    res.status(201).json(
      attachSpeciesToEntity(row, speciesRows.get(String(id)) || [], {
        legacySingleName: row.plant_name,
      }),
    );
  }),
);

router.put(
  '/markers/:id',
  requirePermission('map.manage_markers'),
  asyncHandler(async (req, res) => {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    const { x_pct, y_pct, label, plant_name, living_beings, note, emoji, map_id, species_ids } =
      req.body;
    if (label !== undefined && !String(label).trim()) {
      return res.status(400).json({ error: 'Label requis' });
    }
    if (map_id != null) {
      const mapId = String(map_id).trim();
      if (!mapId) return res.status(400).json({ error: 'map_id invalide' });
      if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    }
    const speciesRowsBefore = await loadMarkerSpeciesMap(db, [m.id]);
    const junctionNames = (speciesRowsBefore.get(String(m.id)) || [])
      .map((row) => String(row.name || '').trim())
      .filter(Boolean);
    const existingLiving =
      living_beings !== undefined
        ? normalizeLivingBeings(living_beings, '')
        : junctionNames.length > 0
          ? junctionNames
          : normalizeLivingBeings(undefined, m.plant_name);
    const nextLiving =
      living_beings !== undefined ? normalizeLivingBeings(living_beings, '') : existingLiving;
    const nextPlantName =
      nextLiving.length > 0
        ? ''
        : plant_name !== undefined
          ? String(plant_name || '').trim()
          : String(m.plant_name || '').trim();
    await execute(
      'UPDATE map_markers SET map_id=?, x_pct=?, y_pct=?, label=?, plant_name=?, note=?, emoji=? WHERE id=?',
      [
        map_id != null ? String(map_id).trim() : m.map_id,
        x_pct ?? m.x_pct,
        y_pct ?? m.y_pct,
        label !== undefined ? String(label).trim() : m.label,
        nextPlantName,
        note ?? m.note,
        emoji !== undefined
          ? normalizeMarkerEmoji(emoji, { allowEmpty: true, fallback: '' })
          : String(m.emoji ?? ''),
        m.id,
      ],
    );
    if (living_beings !== undefined || species_ids !== undefined) {
      await syncMarkerSpecies(db, m.id, species_ids, nextLiving);
    }
    let updated = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [m.id]);
    if (hasVisitMarkerContentPatch(req.body)) {
      await upsertVisitMarkerEditorial(req.body, updated);
      updated = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [m.id]);
    }
    const speciesRows = await loadMarkerSpeciesMap(db, [m.id]);
    emitGardenChanged({ reason: 'update_marker', markerId: m.id, mapId: updated.map_id });
    res.json(
      attachSpeciesToEntity(updated, speciesRows.get(String(m.id)) || [], {
        legacySingleName: updated.plant_name,
      }),
    );
  }),
);

router.delete(
  '/markers/:id',
  requirePermission('map.manage_markers'),
  asyncHandler(async (req, res) => {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    const photos = await queryAll('SELECT image_path FROM marker_photos WHERE marker_id = ?', [
      req.params.id,
    ]);
    await withTransaction(async (tx) => {
      await tx.execute('DELETE FROM marker_photos WHERE marker_id = ?', [req.params.id]);
      await tx.execute('DELETE FROM map_markers WHERE id = ?', [req.params.id]);
      // La couche visite partage le même id : on retire la cible visite « fantôme »
      // (ligne, médias, progression) dans la même transaction que la suppression carte.
      await deleteVisitTargetCascade('marker', req.params.id, tx);
    });
    for (const p of photos) {
      if (p && p.image_path) deleteMapPhotoMainAndThumb(p.image_path);
    }
    emitGardenChanged({ reason: 'delete_marker', markerId: req.params.id, mapId: m.map_id });
    res.json({ success: true });
  }),
);

module.exports = router;
// Exportés pour le test no-DB du contrat de validation O7 (schémas partagés
// zones/repères — voir lib/entityPhotoRoutes.js).
module.exports.reorderMarkerPhotosBodySchema = reorderPhotosBodySchema;
module.exports.addMarkerPhotoBodySchema = addPhotoBodySchema;
