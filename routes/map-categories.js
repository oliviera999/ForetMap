const express = require('express');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requirePermission, authenticate } = require('../middleware/requireTeacher');
const { requireMapAccess } = require('../lib/mapAccess');
const { withLocationSurface, intersectSurfaceMapScope } = require('../lib/surfaceAccess');
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
const {
  assertKnownGroupIds,
  normalizeGroupIdInput,
  normalizeRoleSlugInput,
  serializeGroupIdList,
  serializeRoleSlugList,
} = require('../lib/locationAudience');

/**
 * Audience héritée d'une catégorie (migration 262) : les lieux de la catégorie qui ne
 * déclarent aucune audience propre prennent celle-ci. Omis = inchangé, `[]` = catégorie
 * rendue neutre. L'existence des groupes est vérifiée ici : une coquille produirait une
 * catégorie qui masque silencieusement tous ses lieux.
 */
async function readCategoryAudienceInput(body) {
  const roles = normalizeRoleSlugInput(body?.visible_role_slugs, { field: 'visible_role_slugs' });
  if (!roles.ok) return roles;
  const groups = normalizeGroupIdInput(body?.visible_group_ids, { field: 'visible_group_ids' });
  if (!groups.ok) return groups;
  if (groups.value != null) {
    const known = await assertKnownGroupIds({ queryAll }, groups.value, {
      field: 'visible_group_ids',
    });
    if (!known.ok) return known;
  }
  return { ok: true, roles: roles.value, groups: groups.value };
}
const { mapExists } = require('../lib/mapQueries');

const db = { queryAll, queryOne, execute, withTransaction };

const router = express.Router();

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const DEFAULT_COLOR = '#86efac90';
const LABEL_MAX = 120;
const DESCRIPTION_MAX = 512;

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

/**
 * Catalogue public : catégories actives, filtrables par carte et par type de lieu.
 *
 * `requireMapAccess` refuse un `?map_id=` hors périmètre du compte, `withLocationSurface`
 * hors périmètre de la **surface** — et exige le laissez-passer que la surface réclame. La
 * liste sans `map_id` n'est pas bornée par carte : elle ne porte que des libellés, emojis et
 * couleurs — des métadonnées d'habillage, pas du contenu de carte — et les catégories
 * globales (`map_id IS NULL`) s'appliquent partout. Elle l'est en revanche par surface :
 * une catégorie sensible qui n'apparaît pas sur le plan n'a pas à en sortir le nom
 * (`docs/AUDIT_SECURITE_2026-09-22.md`, lots C et D).
 */
router.get(
  '/',
  authenticate,
  withLocationSurface,
  requireMapAccess(),
  asyncHandler(async (req, res) => {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    const kind = String(req.query.kind || '').trim();
    if (kind && kind !== 'zone' && kind !== 'marker') {
      return res.status(400).json({ error: 'kind doit valoir zone ou marker' });
    }
    // `?surface=` n'élargit plus rien : il s'ajoute à la surface du serveur en intersection.
    const surfaceQuery = readSurfaceQuery(req.query.surface);
    if (!surfaceQuery.ok) return res.status(400).json({ error: surfaceQuery.error });
    const surfaceScope = intersectSurfaceMapScope(req.locationSurface, null, mapId);
    if (surfaceScope.notFound) return res.status(400).json({ error: 'Carte introuvable' });
    res.json(await listCategories(db, { mapId, kind, surface: req.locationSurface.filters }));
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
    // Écran de gestion (`zones.manage`) : seul endroit qui expose l'audience héritée.
    res.json(await listCategories(db, { mapId, includeInactive: true, includeAudience: true }));
  }),
);

/**
 * Réordonne toutes les catégories : `sort_order` = index dans `category_ids`.
 * La liste doit contenir chaque catégorie existante exactement une fois.
 */
router.put(
  '/reorder',
  requirePermission('zones.manage'),
  asyncHandler(async (req, res) => {
    const rawIds = Array.isArray(req.body?.category_ids) ? req.body.category_ids : [];
    const seen = new Set();
    const normalized = [];
    for (const v of rawIds) {
      const id = String(v ?? '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Identifiants de catégories invalides' });
      }
      if (seen.has(id)) {
        return res.status(400).json({ error: 'Chaque catégorie ne doit apparaître qu’une fois' });
      }
      seen.add(id);
      normalized.push(id);
    }

    const allRows = await queryAll('SELECT id FROM location_categories');
    const allIds = new Set(allRows.map((r) => String(r.id)));
    if (normalized.length !== allIds.size) {
      return res.status(400).json({
        error: 'La liste doit contenir toutes les catégories exactement une fois',
      });
    }
    for (const id of normalized) {
      if (!allIds.has(id)) {
        return res.status(400).json({ error: 'Catégorie inconnue' });
      }
    }

    await withTransaction(async (tx) => {
      for (let i = 0; i < normalized.length; i += 1) {
        await tx.execute('UPDATE location_categories SET sort_order = ? WHERE id = ?', [
          i,
          normalized[i],
        ]);
      }
    });

    await logAudit(
      'map_category_reorder',
      'location_category',
      null,
      'Ordre des catégories de lieux modifié',
      { req, payload: { count: normalized.length } },
    );
    emitGardenChanged({ reason: 'reorder_map_categories' });
    res.json({ ok: true, category_ids: normalized });
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
    const audienceInput = await readCategoryAudienceInput(req.body);
    if (!audienceInput.ok) return res.status(400).json({ error: audienceInput.error });
    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO location_categories
        (id, map_id, slug, label, emoji, color, description, applies_to, is_infrastructure, sort_order, is_active, surfaces, zoom_only, visible_role_slugs, visible_group_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        serializeRoleSlugList(audienceInput.roles || []),
        serializeGroupIdList(audienceInput.groups || []),
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
    const audienceInput = await readCategoryAudienceInput(req.body);
    if (!audienceInput.ok) return res.status(400).json({ error: audienceInput.error });
    await execute(
      `UPDATE location_categories
          SET map_id = ?, slug = ?, label = ?, emoji = ?, color = ?, description = ?,
              applies_to = ?, is_infrastructure = ?, sort_order = ?, is_active = ?, surfaces = ?,
              zoom_only = ?, visible_role_slugs = ?, visible_group_ids = ?
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
        serializeRoleSlugList(
          audienceInput.roles === null ? current.visible_role_slugs : audienceInput.roles,
        ),
        serializeGroupIdList(
          audienceInput.groups === null ? current.visible_group_ids : audienceInput.groups,
        ),
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
