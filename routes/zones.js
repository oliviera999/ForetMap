const express = require('express');
const path = require('path');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requireAuth, requirePermission } = require('../middleware/requireTeacher');
const { saveBase64ToDisk, getAbsolutePath } = require('../lib/uploads');
const {
  serializeZonePhotoListRow,
  redirectIfPublicZonePhotoDataUrl,
} = require('../lib/uploadsPublicUrls');
const {
  generateMapPhotoThumbFromMainRelativePath,
  deleteMapPhotoMainAndThumb,
} = require('../lib/imageThumb');
const { sendFilePublicImageOptions } = require('../lib/httpImageCache');
const asyncHandler = require('../lib/asyncHandler');
const { emitGardenChanged } = require('../lib/realtime');
const {
  parseVisitEditorialBlocksInput,
  serializeVisitEditorialBlocks,
} = require('../lib/visitEditorialBlocks');
const { resolveDefaultMapId } = require('../lib/settings');
const { deleteVisitTargetCascade } = require('../lib/visitTargetCleanup');
const {
  loadZoneSpeciesMap,
  syncZoneSpecies,
  attachSpeciesToEntity,
} = require('../lib/speciesJunction');
const { z, validate } = require('../lib/validate');

const db = { queryAll, queryOne, execute, withTransaction };

const router = express.Router();

// O7 — `PUT /:id/photos/reorder` : remplace la garde manuelle
// `const raw = req.body?.photo_ids ?? req.body?.ordered_ids; if (!Array.isArray(raw)) -> 400`.
// Le refine est au niveau racine (path vide) pour que `formatZodError` renvoie exactement le
// message d'origine (sans préfixe de chemin) et tolère un corps null/undefined comme l'opérateur
// `?.` d'origine. Le corps n'est PAS transformé : le handler continue de lire/coercer lui-même
// `req.body?.photo_ids ?? req.body?.ordered_ids` (coercition permissive des éléments inchangée),
// puis applique les vérifications métier restantes (longueur, appartenance, doublons).
const reorderZonePhotosBodySchema = z
  .object({ photo_ids: z.unknown().optional(), ordered_ids: z.unknown().optional() })
  .passthrough()
  .refine((body) => Array.isArray(body && (body.photo_ids ?? body.ordered_ids)), {
    message: 'Liste photo_ids (ou ordered_ids) requise',
  });

// O7 — `POST /:id/photos` : remplace la garde manuelle `if (!image_data) -> 400 'Image requise'`.
// Le refine est au niveau racine pour que `formatZodError` renvoie 'Image requise' tel quel et
// tolère un corps null/undefined (déstructuration `const { image_data } = req.body` exigeait déjà
// un corps objet). Le corps n'est PAS transformé : le handler continue de lire `req.body`
// (image_data + caption) sans changement.
const addZonePhotoBodySchema = z
  .object({ image_data: z.unknown().optional() })
  .passthrough()
  .refine((body) => !!(body && body.image_data), { message: 'Image requise' });

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

function serializeLivingBeings(input, fallback = '') {
  return JSON.stringify(normalizeLivingBeings(input, fallback));
}

/**
 * Normalise le drapeau `special` d'une zone en bit MySQL (0/1).
 * Tolère booléen, nombre et chaîne ('0'/'false'/'' → 0, tout le reste → 1).
 * `fallback` (valeur courante) est renvoyé quand l'entrée est `undefined`
 * (champ non fourni dans un PATCH partiel).
 */
function normalizeSpecialFlag(value, fallback = 0) {
  if (value === undefined) return fallback ? 1 : 0;
  if (value === null) return 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === '' || v === '0' || v === 'false' ? 0 : 1;
  }
  return value ? 1 : 0;
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
  return [
    'visit_subtitle',
    'visit_short_description',
    'visit_details_title',
    'visit_details_text',
    'visit_body_json',
    'visit_editorial_blocks',
  ].some((k) => body[k] !== undefined);
}

async function upsertVisitZoneEditorial(reqBody, zoneRow) {
  const existing = await queryOne(
    'SELECT subtitle, short_description, details_title, details_text, body_json FROM visit_zones WHERE id = ? LIMIT 1',
    [zoneRow.id],
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
    `INSERT INTO visit_zones
      (id, map_id, name, points, subtitle, short_description, details_title, details_text, body_json, is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
     ON DUPLICATE KEY UPDATE
       map_id = VALUES(map_id),
       name = VALUES(name),
       points = VALUES(points),
       subtitle = VALUES(subtitle),
       short_description = VALUES(short_description),
       details_title = VALUES(details_title),
       details_text = VALUES(details_text),
       body_json = VALUES(body_json),
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
      bodyJson,
      now,
      now,
    ],
  );
}

const ZONES_LIST_SQL = `SELECT z.*,
  vz.subtitle AS visit_subtitle,
  vz.short_description AS visit_short_description,
  vz.details_title AS visit_details_title,
  vz.details_text AS visit_details_text,
  vz.body_json AS visit_body_json
FROM zones z
LEFT JOIN visit_zones vz ON vz.id = z.id`;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    const zones = mapId
      ? await queryAll(`${ZONES_LIST_SQL} WHERE z.map_id = ?`, [mapId])
      : await queryAll(ZONES_LIST_SQL);
    // Historique restreint aux zones retournées + regroupement en Map :
    // l'ancien SELECT chargeait toute la table puis filtrait en O(zones × historique).
    const zoneIds = zones.map((z) => z.id);
    const history = zoneIds.length
      ? await queryAll(
          `SELECT * FROM zone_history
            WHERE zone_id IN (${zoneIds.map(() => '?').join(',')})
            ORDER BY harvested_at DESC`,
          zoneIds,
        )
      : [];
    const historyByZoneId = new Map();
    for (const h of history) {
      const key = String(h.zone_id);
      if (!historyByZoneId.has(key)) historyByZoneId.set(key, []);
      historyByZoneId.get(key).push(h);
    }
    const speciesMap = await loadZoneSpeciesMap(db, zoneIds);
    const result = zones.map((z) =>
      attachSpeciesToEntity(
        {
          ...z,
          special: !!z.special,
          history: historyByZoneId.get(String(z.id)) || [],
        },
        speciesMap.get(String(z.id)) || [],
        { legacySingleName: z.current_plant },
      ),
    );
    res.json(result);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const zone = await queryOne(`${ZONES_LIST_SQL} WHERE z.id = ?`, [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const history = await queryAll(
      'SELECT * FROM zone_history WHERE zone_id = ? ORDER BY harvested_at DESC',
      [req.params.id],
    );
    const speciesRows = await loadZoneSpeciesMap(db, [zone.id]);
    res.json(
      attachSpeciesToEntity(
        { ...zone, special: !!zone.special, history },
        speciesRows.get(String(zone.id)) || [],
        { legacySingleName: zone.current_plant },
      ),
    );
  }),
);

router.put(
  '/:id',
  requirePermission('zones.manage', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const {
      name,
      current_plant,
      living_beings,
      stage,
      description,
      points,
      color,
      map_id,
      species_ids,
      special,
    } = req.body;
    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: 'Nom requis' });
    }
    if (map_id != null) {
      const nextMapId = String(map_id).trim();
      if (!nextMapId) return res.status(400).json({ error: 'map_id invalide' });
      if (!(await mapExists(nextMapId)))
        return res.status(400).json({ error: 'Carte introuvable' });
    }
    const speciesRowsBefore = await loadZoneSpeciesMap(db, [zone.id]);
    const junctionNames = (speciesRowsBefore.get(String(zone.id)) || [])
      .map((row) => String(row.name || '').trim())
      .filter(Boolean);
    const existingLiving =
      living_beings !== undefined
        ? normalizeLivingBeings(living_beings, '')
        : junctionNames.length > 0
          ? junctionNames
          : normalizeLivingBeings(undefined, zone.current_plant);
    const nextLiving =
      living_beings !== undefined ? normalizeLivingBeings(living_beings, '') : existingLiving;
    const nextCurrentPlant =
      nextLiving.length > 0
        ? ''
        : current_plant !== undefined
          ? String(current_plant || '').trim()
          : String(zone.current_plant || '').trim();
    if (living_beings !== undefined) {
      const prevCp = String(zone.current_plant || '').trim();
      if (prevCp && !nextLiving.some((n) => String(n).trim() === prevCp)) {
        await execute('INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)', [
          zone.id,
          prevCp,
          new Date().toISOString().split('T')[0],
        ]);
      }
    } else if (
      current_plant !== undefined &&
      zone.current_plant &&
      String(zone.current_plant).trim() !== '' &&
      String(zone.current_plant).trim() !== String(nextCurrentPlant || '').trim()
    ) {
      await execute('INSERT INTO zone_history (zone_id, plant, harvested_at) VALUES (?, ?, ?)', [
        zone.id,
        zone.current_plant,
        new Date().toISOString().split('T')[0],
      ]);
    }
    await execute(
      'UPDATE zones SET map_id=?, name=?, current_plant=?, stage=?, special=?, description=?, points=?, color=? WHERE id=?',
      [
        map_id != null ? String(map_id).trim() : zone.map_id,
        name !== undefined ? String(name).trim() : zone.name,
        nextCurrentPlant,
        stage ?? zone.stage,
        normalizeSpecialFlag(special, zone.special),
        description !== undefined ? description : (zone.description ?? ''),
        points !== undefined ? JSON.stringify(points) : zone.points,
        color ?? zone.color,
        zone.id,
      ],
    );
    if (living_beings !== undefined || species_ids !== undefined) {
      await syncZoneSpecies(db, zone.id, species_ids, nextLiving);
    }
    const updated = await queryOne(`${ZONES_LIST_SQL} WHERE z.id = ?`, [zone.id]);
    const history = await queryAll(
      'SELECT * FROM zone_history WHERE zone_id=? ORDER BY harvested_at DESC',
      [zone.id],
    );
    if (hasVisitZoneContentPatch(req.body)) {
      await upsertVisitZoneEditorial(req.body, updated);
    }
    const updatedWithVisit = await queryOne(`${ZONES_LIST_SQL} WHERE z.id = ?`, [zone.id]);
    const speciesRows = await loadZoneSpeciesMap(db, [zone.id]);
    emitGardenChanged({ reason: 'update_zone', zoneId: zone.id, mapId: updatedWithVisit.map_id });
    res.json(
      attachSpeciesToEntity(
        {
          ...updatedWithVisit,
          special: !!updatedWithVisit.special,
          history,
        },
        speciesRows.get(String(zone.id)) || [],
        { legacySingleName: updatedWithVisit.current_plant },
      ),
    );
  }),
);

router.get(
  '/:id/photos',
  asyncHandler(async (req, res) => {
    const zoneId = req.params.id;
    const photos = await queryAll(
      'SELECT id, zone_id, caption, sort_order, uploaded_at, image_path FROM zone_photos WHERE zone_id=? ORDER BY sort_order ASC, id ASC',
      [zoneId],
    );
    res.json(photos.map((p) => serializeZonePhotoListRow(p, zoneId)));
  }),
);

router.put(
  '/:id/photos/reorder',
  requirePermission('zones.manage', { needsElevation: true }),
  validate({ body: reorderZonePhotosBodySchema }),
  asyncHandler(async (req, res) => {
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
      return res
        .status(400)
        .json({ error: 'La liste doit contenir exactement toutes les photos de la zone' });
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
        await tx.execute('UPDATE zone_photos SET sort_order = ? WHERE id = ? AND zone_id = ?', [
          i,
          photoIds[i],
          zoneId,
        ]);
      }
    });
    emitGardenChanged({ reason: 'reorder_zone_photos', zoneId, mapId: zone.map_id });
    res.json({ ok: true });
  }),
);

router.get(
  '/:id/photos/:pid/data',
  requireAuth,
  asyncHandler(async (req, res) => {
    const p = await queryOne('SELECT image_path FROM zone_photos WHERE id=? AND zone_id=?', [
      req.params.pid,
      req.params.id,
    ]);
    if (!p) return res.status(404).json({ error: 'Photo introuvable' });
    if (p.image_path) {
      const redirectTo = redirectIfPublicZonePhotoDataUrl(
        p.image_path,
        req.params.id,
        req.params.pid,
      );
      if (redirectTo) return res.redirect(302, redirectTo);
      const absolutePath = getAbsolutePath(p.image_path);
      return res.sendFile(absolutePath, sendFilePublicImageOptions(), (err) => {
        if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
      });
    }
    return res.status(404).json({ error: 'Aucune image' });
  }),
);

router.post(
  '/:id/photos',
  requirePermission('zones.manage', { needsElevation: true }),
  validate({ body: addZonePhotoBodySchema }),
  asyncHandler(async (req, res) => {
    let photoId = null;
    const zone = await queryOne('SELECT * FROM zones WHERE id=?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const { image_data, caption } = req.body;
    if (!image_data) return res.status(400).json({ error: 'Image requise' });
    const nextSortRow = await queryOne(
      'SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM zone_photos WHERE zone_id = ?',
      [req.params.id],
    );
    const sortOrder = Number(nextSortRow?.n) >= 0 ? Number(nextSortRow.n) : 0;
    const result = await execute(
      'INSERT INTO zone_photos (zone_id, image_path, caption, sort_order, uploaded_at) VALUES (?, ?, ?, ?, ?)',
      [req.params.id, null, caption || '', sortOrder, new Date().toISOString()],
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
    const photo = await queryOne(
      'SELECT id, zone_id, caption, sort_order, uploaded_at, image_path FROM zone_photos WHERE id=?',
      [photoId],
    );
    emitGardenChanged({ reason: 'add_zone_photo', zoneId: req.params.id, mapId: zone.map_id });
    res.status(201).json(serializeZonePhotoListRow(photo, req.params.id));
  }),
);

router.delete(
  '/:id/photos/:pid',
  requirePermission('zones.manage', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const zone = await queryOne('SELECT map_id FROM zones WHERE id = ?', [req.params.id]);
    const p = await queryOne('SELECT image_path FROM zone_photos WHERE id=? AND zone_id=?', [
      req.params.pid,
      req.params.id,
    ]);
    if (p && p.image_path) deleteMapPhotoMainAndThumb(p.image_path);
    await execute('DELETE FROM zone_photos WHERE id=? AND zone_id=?', [
      req.params.pid,
      req.params.id,
    ]);
    emitGardenChanged({
      reason: 'delete_zone_photo',
      zoneId: req.params.id,
      mapId: zone?.map_id || null,
    });
    res.json({ success: true });
  }),
);

router.post(
  '/',
  requirePermission('zones.manage', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const {
      name,
      points,
      color,
      current_plant,
      living_beings,
      stage,
      map_id,
      description,
      species_ids,
      special,
    } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nom requis' });
    if (!points || points.length < 3)
      return res.status(400).json({ error: 'Au moins 3 points requis' });
    const mapId = String(map_id || '').trim() || (await resolveDefaultMapId('teacher'));
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    const nextLiving = normalizeLivingBeings(living_beings, current_plant);
    const nextCurrentPlant = nextLiving.length > 0 ? '' : String(current_plant || '').trim();
    const desc = description !== undefined && description !== null ? String(description) : '';
    const id = 'zone-' + crypto.randomUUID().slice(0, 8);
    const specialFlag = normalizeSpecialFlag(special, 0);
    await execute(
      'INSERT INTO zones (id, map_id, name, x, y, width, height, current_plant, stage, special, points, color, description) VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?)',
      [
        id,
        mapId,
        name.trim(),
        nextCurrentPlant,
        stage || 'empty',
        specialFlag,
        JSON.stringify(points),
        color || '#86efac80',
        desc,
      ],
    );
    await syncZoneSpecies(db, id, species_ids, nextLiving);
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [id]);
    const speciesRows = await loadZoneSpeciesMap(db, [id]);
    emitGardenChanged({ reason: 'create_zone', zoneId: id, mapId });
    res.status(201).json(
      attachSpeciesToEntity(
        { ...zone, special: !!zone.special, history: [] },
        speciesRows.get(id) || [],
        {
          legacySingleName: zone.current_plant,
        },
      ),
    );
  }),
);

router.delete(
  '/:id',
  requirePermission('zones.manage', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const zone = await queryOne('SELECT * FROM zones WHERE id = ?', [req.params.id]);
    if (!zone) return res.status(404).json({ error: 'Zone introuvable' });
    const photos = await queryAll('SELECT image_path FROM zone_photos WHERE zone_id = ?', [
      req.params.id,
    ]);
    for (const p of photos) {
      if (p && p.image_path) deleteMapPhotoMainAndThumb(p.image_path);
    }
    await execute('DELETE FROM zone_history WHERE zone_id = ?', [req.params.id]);
    await execute('DELETE FROM zone_photos WHERE zone_id = ?', [req.params.id]);
    await execute('DELETE FROM zones WHERE id = ?', [req.params.id]);
    // La couche visite partage le même id : on retire la cible visite « fantôme »
    // (ligne, médias, progression) pour qu'elle ne survive pas à la suppression carte.
    await deleteVisitTargetCascade('zone', req.params.id);
    emitGardenChanged({ reason: 'delete_zone', zoneId: req.params.id, mapId: zone.map_id });
    res.json({ success: true });
  }),
);

module.exports = router;
// Exportés pour le test no-DB du contrat de validation O7.
module.exports.reorderZonePhotosBodySchema = reorderZonePhotosBodySchema;
module.exports.addZonePhotoBodySchema = addZonePhotoBodySchema;
