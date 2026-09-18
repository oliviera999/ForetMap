const express = require('express');
const crypto = require('node:crypto');
const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { requirePermission, authenticate } = require('../middleware/requireTeacher');
const { resolveScopedMapFilter, MAP_OUT_OF_SCOPE } = require('../lib/mapAccess');
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
  loadCategoriesMap,
  attachCategoriesToEntity,
  syncEntityCategories,
} = require('../lib/locationCategories');
const {
  normalizeSurfaceInput,
  normalizeSearchAliases,
  serializeSurfaceSet,
  readSurfaceQuery,
  isVisibleOnSurface,
} = require('../lib/locationSurfaces');
const {
  readAudienceWriteFields,
  assertAudienceGroupsExist,
  serializeGroupIdList,
  serializeRoleSlugList,
  filterLocationsForViewer,
} = require('../lib/locationAudience');
const {
  assertLocationNotesGroupsExist,
  normalizeLocationNotesInput,
  loadLocationNotesMap,
  attachNotesToEntity,
  replaceLocationNotes,
  deleteLocationNotes,
} = require('../lib/locationNotes');
const {
  assertLocationLinksGroupsExist,
  normalizeLocationLinksInput,
  loadLocationLinksMap,
  attachLinksToEntity,
  replaceLocationLinks,
  deleteLocationLinks,
} = require('../lib/locationLinks');
const { nowDbTimestamp } = require('../lib/shared/isoTimestamp');
const { logAudit } = require('../lib/auditLog');
const { mapMarkerToVisitWhitelistFields } = require('../lib/visitMapToVisitFields');
const {
  registerEntityPhotoRoutes,
  reorderPhotosBodySchema,
  addPhotoBodySchema,
} = require('../lib/entityPhotoRoutes');
const { mapExists } = require('../lib/mapQueries');
const { normalizeLivingBeings, serializeLocationRow } = require('../lib/locationRowHelpers');

const db = { queryAll, queryOne, execute, withTransaction };

const router = express.Router();

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
  const audience = mapMarkerToVisitWhitelistFields(markerRow);
  const now = nowDbTimestamp();
  await execute(
    `INSERT INTO visit_markers
      (id, map_id, x_pct, y_pct, label, emoji, subtitle, short_description, details_title, details_text, body_json,
       visible_role_slugs, visible_group_ids,
       is_active, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
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
       visible_role_slugs = VALUES(visible_role_slugs),
       visible_group_ids = VALUES(visible_group_ids),
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
      audience.visible_role_slugs,
      audience.visible_group_ids,
      now,
      now,
    ],
  );
}

async function mirrorMarkerAudienceToVisit(markerRow) {
  const audience = mapMarkerToVisitWhitelistFields(markerRow);
  await execute(
    `UPDATE visit_markers
     SET visible_role_slugs = ?, visible_group_ids = ?, updated_at = ?
     WHERE id = ? AND map_id = ?`,
    [
      audience.visible_role_slugs,
      audience.visible_group_ids,
      nowDbTimestamp(),
      markerRow.id,
      markerRow.map_id,
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

// `authenticate` : session facultative (lecture publique conservée), mais hydratée quand
// elle existe — c'est elle qui porte le périmètre cartes.
router.get(
  '/markers',
  authenticate,
  asyncHandler(async (req, res) => {
    const mapId = req.query.map_id ? String(req.query.map_id).trim() : '';
    if (mapId && !(await mapExists(mapId))) {
      return res.status(400).json({ error: 'Carte introuvable' });
    }
    // `?surface=map|visit|plan` (lot 4) : ne renvoie que les repères visibles sur cette surface.
    const surfaceQuery = readSurfaceQuery(req.query.surface);
    if (!surfaceQuery.ok) return res.status(400).json({ error: surfaceQuery.error });
    const publicSurface = surfaceQuery.value === 'visit' || surfaceQuery.value === 'plan';
    // Périmètre cartes : sans `map_id`, la liste est ramenée aux cartes autorisées. Se cumule
    // au filtre d'audience appliqué plus bas, qui trie les lieux d'une même carte par rôle.
    const scope = await resolveScopedMapFilter(req.auth || null, mapId);
    if (scope.forbidden) return res.status(403).json(MAP_OUT_OF_SCOPE);
    const rows = scope.mapIds
      ? await queryAll(
          `${MARKERS_LIST_SQL} WHERE m.map_id IN (${scope.mapIds.map(() => '?').join(',')}) ORDER BY m.created_at`,
          scope.mapIds,
        )
      : await queryAll(`${MARKERS_LIST_SQL} ORDER BY m.created_at`);
    const markerIds = rows.map((row) => row.id);
    const speciesMap = await loadMarkerSpeciesMap(db, markerIds);
    const categoriesMap = await loadCategoriesMap(db, 'marker', markerIds);
    // Liens documentaires (migration 261) : posés bruts, filtrés par rôle en même temps que
    // le complément réservé (`filterLocationsForViewer` plus bas).
    const linksMap = await loadLocationLinksMap(db, 'marker', markerIds);
    // Compléments réservés (migration 263) : mêmes lignes pour la carte et la visite.
    const notesMap = await loadLocationNotesMap(db, 'marker', markerIds);
    const result = rows.map((row) =>
      serializeLocationRow(
        attachNotesToEntity(
          attachLinksToEntity(
            attachCategoriesToEntity(
              attachSpeciesToEntity(row, speciesMap.get(String(row.id)) || [], {
                legacySingleName: row.plant_name,
              }),
              categoriesMap.get(String(row.id)) || [],
            ),
            linksMap.get(String(row.id)) || [],
          ),
          notesMap.get(String(row.id)) || [],
        ),
      ),
    );
    const surfaced = surfaceQuery.value
      ? result.filter((row) => isVisibleOnSurface(row, surfaceQuery.value))
      : result;
    res.json(filterLocationsForViewer(surfaced, req.auth, { publicSurface }));
  }),
);

router.post(
  '/markers',
  requirePermission('map.manage_markers'),
  asyncHandler(async (req, res) => {
    const {
      x_pct,
      y_pct,
      label,
      plant_name,
      living_beings,
      note,
      emoji,
      map_id,
      species_ids,
      category_ids,
      hidden_surfaces,
      search_aliases,
      visible_role_slugs,
      visible_group_ids,
      links,
      notes,
    } = req.body;
    const mapId = String(map_id || '').trim() || (await resolveDefaultMapId('teacher'));
    if (!mapId) return res.status(400).json({ error: 'map_id requis' });
    if (!(await mapExists(mapId))) return res.status(400).json({ error: 'Carte introuvable' });
    if (!label?.trim()) return res.status(400).json({ error: 'Label requis' });
    const hiddenSurfacesInput = normalizeSurfaceInput(hidden_surfaces, {
      field: 'hidden_surfaces',
    });
    if (!hiddenSurfacesInput.ok) return res.status(400).json({ error: hiddenSurfacesInput.error });
    const audienceInput = readAudienceWriteFields({
      visible_role_slugs,
      visible_group_ids,
    });
    if (!audienceInput.ok) return res.status(400).json({ error: audienceInput.error });
    const audienceGroupsCheck = await assertAudienceGroupsExist(db, audienceInput);
    if (!audienceGroupsCheck.ok) return res.status(400).json({ error: audienceGroupsCheck.error });
    const linksInput = normalizeLocationLinksInput(links);
    if (!linksInput.ok) return res.status(400).json({ error: linksInput.error });
    if (linksInput.value !== null) {
      const linksGroupsCheck = await assertLocationLinksGroupsExist(db, linksInput.value);
      if (!linksGroupsCheck.ok) return res.status(400).json({ error: linksGroupsCheck.error });
    }
    const notesInput = normalizeLocationNotesInput(notes);
    if (!notesInput.ok) return res.status(400).json({ error: notesInput.error });
    if (notesInput.value !== null) {
      const notesGroupsCheck = await assertLocationNotesGroupsExist(db, notesInput.value);
      if (!notesGroupsCheck.ok) return res.status(400).json({ error: notesGroupsCheck.error });
    }
    // Coordonnées en pourcentage : bornées 0-100 (sinon un repère hors carte, ou NaN, était
    // inséré tel quel — paramétré donc sans injection, mais qualité de données non garantie).
    const xPct = Number(x_pct);
    const yPct = Number(y_pct);
    if (!Number.isFinite(xPct) || xPct < 0 || xPct > 100) {
      return res.status(400).json({ error: 'x_pct doit être un nombre entre 0 et 100' });
    }
    if (!Number.isFinite(yPct) || yPct < 0 || yPct > 100) {
      return res.status(400).json({ error: 'y_pct doit être un nombre entre 0 et 100' });
    }
    const nextLiving = normalizeLivingBeings(living_beings, plant_name);
    const nextPlantName = nextLiving.length > 0 ? '' : String(plant_name || '').trim();
    const id = crypto.randomUUID();
    await execute(
      'INSERT INTO map_markers (id, map_id, x_pct, y_pct, label, plant_name, note, emoji, created_at, hidden_surfaces, search_aliases, visible_role_slugs, visible_group_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        mapId,
        xPct,
        yPct,
        label.trim(),
        nextPlantName,
        note || '',
        normalizeMarkerEmoji(emoji, { allowEmpty: true, fallback: '' }),
        nowDbTimestamp(),
        serializeSurfaceSet(hiddenSurfacesInput.value || []),
        normalizeSearchAliases(search_aliases) || null,
        serializeRoleSlugList(audienceInput.visible_role_slugs || []) || null,
        serializeGroupIdList(audienceInput.visible_group_ids || []) || null,
      ],
    );
    await syncMarkerSpecies(db, id, species_ids, nextLiving);
    if (linksInput.value !== null) {
      await replaceLocationLinks(db, 'marker', id, linksInput.value);
    }
    if (notesInput.value !== null) {
      await replaceLocationNotes(db, 'marker', id, notesInput.value);
    }
    await syncEntityCategories(db, {
      kind: 'marker',
      entityId: id,
      mapId,
      categoryIds: category_ids,
    });
    let row = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [id]);
    if (hasVisitMarkerContentPatch(req.body)) {
      await upsertVisitMarkerEditorial(req.body, row);
      row = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [id]);
    }
    const speciesRows = await loadMarkerSpeciesMap(db, [id]);
    const categoriesRows = await loadCategoriesMap(db, 'marker', [id]);
    const linksRows = await loadLocationLinksMap(db, 'marker', [id]);
    const notesRows = await loadLocationNotesMap(db, 'marker', [id]);
    emitGardenChanged({ reason: 'create_marker', markerId: id, mapId });
    res.status(201).json(
      serializeLocationRow(
        attachNotesToEntity(
          attachLinksToEntity(
            attachCategoriesToEntity(
              attachSpeciesToEntity(row, speciesRows.get(String(id)) || [], {
                legacySingleName: row.plant_name,
              }),
              categoriesRows.get(String(id)) || [],
            ),
            linksRows.get(String(id)) || [],
          ),
          notesRows.get(String(id)) || [],
        ),
      ),
    );
  }),
);

router.put(
  '/markers/:id',
  requirePermission('map.manage_markers'),
  asyncHandler(async (req, res) => {
    const m = await queryOne('SELECT * FROM map_markers WHERE id = ?', [req.params.id]);
    if (!m) return res.status(404).json({ error: 'Repère introuvable' });
    const {
      x_pct,
      y_pct,
      label,
      plant_name,
      living_beings,
      note,
      emoji,
      map_id,
      species_ids,
      category_ids,
      hidden_surfaces,
      search_aliases,
      visible_role_slugs,
      visible_group_ids,
      links,
      notes,
    } = req.body;
    if (label !== undefined && !String(label).trim()) {
      return res.status(400).json({ error: 'Label requis' });
    }
    // Surfaces masquées et alias de recherche (lot 4) : omis = inchangés.
    const hiddenSurfacesInput = normalizeSurfaceInput(hidden_surfaces, {
      field: 'hidden_surfaces',
    });
    if (!hiddenSurfacesInput.ok) return res.status(400).json({ error: hiddenSurfacesInput.error });
    const audienceInput = readAudienceWriteFields({
      visible_role_slugs,
      visible_group_ids,
    });
    if (!audienceInput.ok) return res.status(400).json({ error: audienceInput.error });
    const audienceGroupsCheck = await assertAudienceGroupsExist(db, audienceInput);
    if (!audienceGroupsCheck.ok) return res.status(400).json({ error: audienceGroupsCheck.error });
    // Liens documentaires : omis = inchangés, `[]` = tous retirés.
    const linksInput = normalizeLocationLinksInput(links);
    if (!linksInput.ok) return res.status(400).json({ error: linksInput.error });
    if (linksInput.value !== null) {
      const linksGroupsCheck = await assertLocationLinksGroupsExist(db, linksInput.value);
      if (!linksGroupsCheck.ok) return res.status(400).json({ error: linksGroupsCheck.error });
    }
    const notesInput = normalizeLocationNotesInput(notes);
    if (!notesInput.ok) return res.status(400).json({ error: notesInput.error });
    if (notesInput.value !== null) {
      const notesGroupsCheck = await assertLocationNotesGroupsExist(db, notesInput.value);
      if (!notesGroupsCheck.ok) return res.status(400).json({ error: notesGroupsCheck.error });
    }
    const nextHiddenSurfaces =
      hiddenSurfacesInput.value === null
        ? String(m.hidden_surfaces ?? '')
        : serializeSurfaceSet(hiddenSurfacesInput.value);
    const nextSearchAliases =
      search_aliases === undefined
        ? (m.search_aliases ?? null)
        : normalizeSearchAliases(search_aliases) || null;
    const nextVisibleRoleSlugs =
      audienceInput.visible_role_slugs === null
        ? (m.visible_role_slugs ?? null)
        : serializeRoleSlugList(audienceInput.visible_role_slugs) || null;
    const nextVisibleGroupIds =
      audienceInput.visible_group_ids === null
        ? (m.visible_group_ids ?? null)
        : serializeGroupIdList(audienceInput.visible_group_ids) || null;
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
    const nextMapIdForMarker = map_id != null ? String(map_id).trim() : m.map_id;
    await execute(
      'UPDATE map_markers SET map_id=?, x_pct=?, y_pct=?, label=?, plant_name=?, note=?, emoji=?, hidden_surfaces=?, search_aliases=?, visible_role_slugs=?, visible_group_ids=? WHERE id=?',
      [
        nextMapIdForMarker,
        x_pct ?? m.x_pct,
        y_pct ?? m.y_pct,
        label !== undefined ? String(label).trim() : m.label,
        nextPlantName,
        note ?? m.note,
        emoji !== undefined
          ? normalizeMarkerEmoji(emoji, { allowEmpty: true, fallback: '' })
          : String(m.emoji ?? ''),
        nextHiddenSurfaces,
        nextSearchAliases,
        nextVisibleRoleSlugs,
        nextVisibleGroupIds,
        m.id,
      ],
    );
    if (living_beings !== undefined || species_ids !== undefined) {
      await syncMarkerSpecies(db, m.id, species_ids, nextLiving);
    }
    if (linksInput.value !== null) {
      await replaceLocationLinks(db, 'marker', m.id, linksInput.value);
    }
    if (notesInput.value !== null) {
      await replaceLocationNotes(db, 'marker', m.id, notesInput.value);
    }
    // `category_ids` absent ⇒ affectations conservées, mais réévaluées si la carte change
    // (une catégorie propre à l'ancienne carte n'est plus assignable).
    const currentCategoryIds =
      category_ids !== undefined
        ? category_ids
        : (
            await queryAll('SELECT category_id FROM marker_categories WHERE marker_id = ?', [m.id])
          ).map((row) => String(row.category_id));
    await syncEntityCategories(db, {
      kind: 'marker',
      entityId: m.id,
      mapId: nextMapIdForMarker,
      categoryIds: currentCategoryIds,
    });
    let updated = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [m.id]);
    if (hasVisitMarkerContentPatch(req.body)) {
      await upsertVisitMarkerEditorial(req.body, updated);
      updated = await queryOne(`${MARKERS_LIST_SQL} WHERE m.id = ?`, [m.id]);
    } else if (
      audienceInput.visible_role_slugs !== null ||
      audienceInput.visible_group_ids !== null
    ) {
      await mirrorMarkerAudienceToVisit(updated);
    }
    const speciesRows = await loadMarkerSpeciesMap(db, [m.id]);
    const categoriesRows = await loadCategoriesMap(db, 'marker', [m.id]);
    const linksRows = await loadLocationLinksMap(db, 'marker', [m.id]);
    const notesRows = await loadLocationNotesMap(db, 'marker', [m.id]);
    emitGardenChanged({ reason: 'update_marker', markerId: m.id, mapId: updated.map_id });
    res.json(
      serializeLocationRow(
        attachNotesToEntity(
          attachLinksToEntity(
            attachCategoriesToEntity(
              attachSpeciesToEntity(updated, speciesRows.get(String(m.id)) || [], {
                legacySingleName: updated.plant_name,
              }),
              categoriesRows.get(String(m.id)) || [],
            ),
            linksRows.get(String(m.id)) || [],
          ),
          notesRows.get(String(m.id)) || [],
        ),
      ),
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
      // Cible polymorphe : aucune clé étrangère ne peut nettoyer ces lignes.
      await deleteLocationLinks(tx, 'marker', req.params.id);
      await deleteLocationNotes(tx, 'marker', req.params.id);
      await tx.execute('DELETE FROM map_markers WHERE id = ?', [req.params.id]);
      // La couche visite partage le même id : on retire la cible visite « fantôme »
      // (ligne, médias, progression) dans la même transaction que la suppression carte.
      await deleteVisitTargetCascade('marker', req.params.id, tx);
    });
    for (const p of photos) {
      if (p && p.image_path) deleteMapPhotoMainAndThumb(p.image_path);
    }
    emitGardenChanged({ reason: 'delete_marker', markerId: req.params.id, mapId: m.map_id });
    await logAudit(
      'delete_marker',
      'marker',
      req.params.id,
      `Suppression repère ${m.label || req.params.id}`,
      {
        req,
        payload: { label: m.label || null, map_id: m.map_id || null },
      },
    );
    res.json({ success: true });
  }),
);

module.exports = router;
// Exportés pour le test no-DB du contrat de validation O7 (schémas partagés
// zones/repères — voir lib/entityPhotoRoutes.js).
module.exports.reorderMarkerPhotosBodySchema = reorderPhotosBodySchema;
module.exports.addMarkerPhotoBodySchema = addPhotoBodySchema;
