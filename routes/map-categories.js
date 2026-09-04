const express = require('express');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { emitGardenChanged } = require('../lib/realtime');
const { normalizeMarkerEmoji } = require('../lib/markerEmoji');
const { logAudit } = require('../lib/auditLog');
const {
  APPLIES_TO_VALUES,
  normalizeAppliesTo,
  normalizeBooleanFlag,
  slugifyCategoryLabel,
  listCategories,
  getCategoryById,
  resyncZonesInfrastructureMirror,
} = require('../lib/locationCategories');
const {
  SURFACES,
  normalizeSurfaceInput,
  serializeSurfaceSet,
  readSurfaceQuery,
} = require('../lib/locationSurfaces');

const db = { queryAll, queryOne, execute, withTransaction };

const router = express.Router();

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const DEFAULT_COLOR = '#86efac90';
const LABEL_MAX = 120;
const DESCRIPTION_MAX = 512;

async function mapExists(mapId) {
  const row = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
  return !!row;
}

/**
 * `map_id` d'une catégorie : `null` = globale (toutes cartes). Retourne `{ error }`
 * quand la carte fournie n'existe pas.
 */
async function resolveCategoryMapId(raw) {
  if (raw === undefined) return { value: undefined };
  const mapId = String(raw ?? '').trim();
  if (!mapId) return { value: null };
  if (!(await mapExists(mapId))) return { error: 'Carte introuvable' };
  return { value: mapId };
}

/** Unicité du slug dans la portée (une carte donnée, ou l'ensemble des catégories globales). */
async function slugTaken(slug, mapId, exceptId = '') {
  const params = [slug];
  let sql = 'SELECT id FROM location_categories WHERE slug = ?';
  if (mapId == null) sql += ' AND map_id IS NULL';
  else {
    sql += ' AND map_id = ?';
    params.push(mapId);
  }
  if (exceptId) {
    sql += ' AND id <> ?';
    params.push(exceptId);
  }
  const row = await queryOne(`${sql} LIMIT 1`, params);
  return !!row;
}

function readColor(raw, fallback) {
  if (raw === undefined) return fallback;
  const color = String(raw ?? '').trim();
  if (!color) return fallback;
  return COLOR_RE.test(color) ? color : null;
}

/**
 * Retire les affectations qui ne respectent plus la portée (carte) ou le type
 * d'application (`applies_to`) de la catégorie.
 */
async function pruneInvalidAssignments(categoryId) {
  await execute(
    `DELETE zc FROM zone_categories zc
       JOIN location_categories c ON c.id = zc.category_id
       JOIN zones z ON z.id = zc.zone_id
      WHERE c.id = ?
        AND (c.applies_to = 'marker' OR (c.map_id IS NOT NULL AND c.map_id <> z.map_id))`,
    [categoryId],
  );
  await execute(
    `DELETE mc FROM marker_categories mc
       JOIN location_categories c ON c.id = mc.category_id
       JOIN map_markers m ON m.id = mc.marker_id
      WHERE c.id = ?
        AND (c.applies_to = 'zone' OR (c.map_id IS NOT NULL AND c.map_id <> m.map_id))`,
    [categoryId],
  );
}

/** Catalogue public : catégories actives, filtrables par carte et par type de lieu. */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    const kind = String(req.query.kind || '').trim();
    if (kind && kind !== 'zone' && kind !== 'marker') {
      return res.status(400).json({ error: 'kind doit valoir zone ou marker' });
    }
    // `?surface=map|visit|plan` (lot 4) : catégories qui apparaissent sur cette surface.
    const surfaceQuery = readSurfaceQuery(req.query.surface);
    if (!surfaceQuery.ok) return res.status(400).json({ error: surfaceQuery.error });
    res.json(await listCategories(db, { mapId, kind, surface: surfaceQuery.value }));
  }),
);

/** Console de gestion : inclut les catégories désactivées. */
router.get(
  '/manage',
  requirePermission('zones.manage'),
  asyncHandler(async (req, res) => {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    res.json(await listCategories(db, { mapId, includeInactive: true }));
  }),
);

router.post(
  '/',
  requirePermission('zones.manage'),
  asyncHandler(async (req, res) => {
    const label = String(req.body?.label || '').trim();
    if (!label) return res.status(400).json({ error: 'Label requis' });
    if (label.length > LABEL_MAX) {
      return res.status(400).json({ error: `Label trop long (${LABEL_MAX} caractères maximum)` });
    }
    const mapResolved = await resolveCategoryMapId(req.body?.map_id);
    if (mapResolved.error) return res.status(400).json({ error: mapResolved.error });
    const mapId = mapResolved.value ?? null;
    const appliesTo =
      req.body?.applies_to !== undefined ? normalizeAppliesTo(req.body.applies_to, '') : 'both';
    if (!APPLIES_TO_VALUES.includes(appliesTo)) {
      return res.status(400).json({ error: 'applies_to doit valoir zone, marker ou both' });
    }
    const color = readColor(req.body?.color, DEFAULT_COLOR);
    if (color === null) return res.status(400).json({ error: 'Couleur invalide (format #rrggbb)' });
    const slug = slugifyCategoryLabel(req.body?.slug || label);
    if (!slug) return res.status(400).json({ error: 'Slug invalide (lettres ou chiffres requis)' });
    if (await slugTaken(slug, mapId)) {
      return res
        .status(409)
        .json({ error: 'Une catégorie avec ce slug existe déjà sur ce périmètre' });
    }
    const sortOrderRaw = parseInt(req.body?.sort_order, 10);
    // Surfaces où la catégorie apparaît (lot 4) : omis = toutes.
    const surfacesInput = normalizeSurfaceInput(req.body?.surfaces);
    if (!surfacesInput.ok) return res.status(400).json({ error: surfacesInput.error });
    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO location_categories
        (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure, sort_order, is_active, surfaces, zoom_only)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        mapId,
        slug,
        label,
        normalizeMarkerEmoji(req.body?.emoji, { allowEmpty: true, fallback: '' }),
        color,
        String(req.body?.description || '')
          .trim()
          .slice(0, DESCRIPTION_MAX),
        appliesTo,
        normalizeBooleanFlag(req.body?.is_infrastructure, 0),
        Number.isFinite(sortOrderRaw) ? sortOrderRaw : 100,
        normalizeBooleanFlag(req.body?.is_active, 1),
        serializeSurfaceSet(surfacesInput.value === null ? SURFACES : surfacesInput.value),
        normalizeBooleanFlag(req.body?.zoom_only, 0),
      ],
    );
    const created = await getCategoryById(db, id);
    await logAudit('map_category_create', 'location_category', id, 'Catégorie de lieu créée', {
      req,
      payload: { label, slug, map_id: mapId, applies_to: appliesTo },
    });
    emitGardenChanged({ reason: 'create_map_category', mapId: mapId || undefined });
    res.status(201).json(created);
  }),
);

router.put(
  '/:id',
  requirePermission('zones.manage'),
  asyncHandler(async (req, res) => {
    const current = await getCategoryById(db, req.params.id);
    if (!current) return res.status(404).json({ error: 'Catégorie introuvable' });

    const label = req.body?.label !== undefined ? String(req.body.label).trim() : current.label;
    if (!label) return res.status(400).json({ error: 'Label requis' });
    if (label.length > LABEL_MAX) {
      return res.status(400).json({ error: `Label trop long (${LABEL_MAX} caractères maximum)` });
    }
    const mapResolved = await resolveCategoryMapId(req.body?.map_id);
    if (mapResolved.error) return res.status(400).json({ error: mapResolved.error });
    const mapId = mapResolved.value === undefined ? current.map_id : mapResolved.value;
    const slug = req.body?.slug !== undefined ? slugifyCategoryLabel(req.body.slug) : current.slug;
    if (!slug) return res.status(400).json({ error: 'Slug invalide (lettres ou chiffres requis)' });
    if (await slugTaken(slug, mapId, current.id)) {
      return res
        .status(409)
        .json({ error: 'Une catégorie avec ce slug existe déjà sur ce périmètre' });
    }
    const color = readColor(req.body?.color, current.color);
    if (color === null) return res.status(400).json({ error: 'Couleur invalide (format #rrggbb)' });
    const appliesTo =
      req.body?.applies_to !== undefined
        ? normalizeAppliesTo(req.body.applies_to, '')
        : current.applies_to;
    if (!APPLIES_TO_VALUES.includes(appliesTo)) {
      return res.status(400).json({ error: 'applies_to doit valoir zone, marker ou both' });
    }
    const sortOrderRaw = parseInt(req.body?.sort_order, 10);
    const isInfrastructure = normalizeBooleanFlag(
      req.body?.is_infrastructure,
      current.is_infrastructure ? 1 : 0,
    );
    const surfacesInput = normalizeSurfaceInput(req.body?.surfaces);
    if (!surfacesInput.ok) return res.status(400).json({ error: surfacesInput.error });
    const nextSurfaces = surfacesInput.value === null ? current.surfaces : surfacesInput.value;
    await execute(
      `UPDATE location_categories
          SET map_id = ?, slug = ?, label = ?, emoji = ?, color = ?, description = ?,
              applies_to = ?, is_infrastructure = ?, sort_order = ?, is_active = ?, surfaces = ?,
              zoom_only = ?
        WHERE id = ?`,
      [
        mapId,
        slug,
        label,
        req.body?.emoji !== undefined
          ? normalizeMarkerEmoji(req.body.emoji, { allowEmpty: true, fallback: '' })
          : current.emoji,
        color,
        req.body?.description !== undefined
          ? String(req.body.description).trim().slice(0, DESCRIPTION_MAX)
          : current.description,
        appliesTo,
        isInfrastructure,
        Number.isFinite(sortOrderRaw) ? sortOrderRaw : current.sort_order,
        normalizeBooleanFlag(req.body?.is_active, current.is_active ? 1 : 0),
        serializeSurfaceSet(nextSurfaces),
        normalizeBooleanFlag(req.body?.zoom_only, current.zoom_only ? 1 : 0),
        current.id,
      ],
    );
    // La portée ou le type d'application a pu se restreindre : on retire les affectations
    // devenues invalides (catégorie « repères seuls » encore posée sur des zones, ou
    // catégorie rendue propre à une carte alors qu'elle était globale).
    await pruneInvalidAssignments(current.id);
    if (isInfrastructure !== (current.is_infrastructure ? 1 : 0)) {
      await resyncZonesInfrastructureMirror(db);
    }
    const updated = await getCategoryById(db, current.id);
    await logAudit(
      'map_category_update',
      'location_category',
      current.id,
      'Catégorie de lieu modifiée',
      {
        req,
        payload: { label, slug, map_id: mapId, applies_to: appliesTo },
      },
    );
    emitGardenChanged({ reason: 'update_map_category', mapId: mapId || undefined });
    res.json(updated);
  }),
);

router.delete(
  '/:id',
  requirePermission('zones.manage'),
  asyncHandler(async (req, res) => {
    const current = await getCategoryById(db, req.params.id);
    if (!current) return res.status(404).json({ error: 'Catégorie introuvable' });
    // Les jonctions partent en cascade (FK ON DELETE CASCADE).
    await execute('DELETE FROM location_categories WHERE id = ?', [current.id]);
    if (current.is_infrastructure) await resyncZonesInfrastructureMirror(db);
    await logAudit(
      'map_category_delete',
      'location_category',
      current.id,
      'Catégorie de lieu supprimée',
      {
        req,
        payload: { label: current.label, slug: current.slug },
      },
    );
    emitGardenChanged({ reason: 'delete_map_category', mapId: current.map_id || undefined });
    res.json({ ok: true });
  }),
);

module.exports = router;
