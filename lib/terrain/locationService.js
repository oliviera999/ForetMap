'use strict';

/**
 * Service « lieu » du terrain : zones et repères de carte.
 *
 * Les deux routeurs `routes/zones.js` et `routes/map.js` portaient des handlers jumeaux
 * (≈ 130 + 220 lignes clonées à l'audit du 25/09/2026, § 3.3 ligne 12) : validation des
 * champs communs (surfaces, audience, liens, compléments réservés), espèces rattachées,
 * catégories, éditorial visite, suppression en cascade. Ils passent désormais tous deux par
 * ce module (étape B4 de la piste B) ; seul ce qui distingue réellement une zone d'un repère
 * est décrit dans `LOCATION_KINDS` (colonnes propres, géométrie, ordre des contrôles).
 *
 * Contrat : aucune dépendance à Express. Les fonctions publiques rendent
 * `{ status, body }` (et `entity` pour le routeur, qui notifie le temps réel et le journal).
 * Les réponses HTTP sont celles d'avant l'extraction, au caractère près
 * (`tests/terrain-location-put-characterization.test.js`).
 */

const crypto = require('node:crypto');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { nowDbTimestamp } = require('../shared/isoTimestamp');
const { resolveScopedMapFilter, MAP_OUT_OF_SCOPE } = require('../mapAccess');
const { deleteMapPhotoMainAndThumb } = require('../imageThumb');
const { emitGardenChanged } = require('../realtime');
const {
  parseVisitEditorialBlocksInput,
  serializeVisitEditorialBlocks,
} = require('../visitEditorialBlocks');
const { resolveDefaultMapId } = require('../settings');
const { deleteVisitTargetCascade } = require('../visitTargetCleanup');
const { logAudit } = require('../auditLog');
const {
  loadZoneSpeciesMap,
  loadMarkerSpeciesMap,
  syncZoneSpecies,
  syncMarkerSpecies,
  attachSpeciesToEntity,
} = require('../speciesJunction');
const {
  loadCategoriesMap,
  attachCategoriesToEntity,
  syncEntityCategories,
  categoriesCarryInfrastructure,
} = require('../locationCategories');
const {
  normalizeSurfaceInput,
  normalizeSearchAliases,
  serializeSurfaceSet,
  readSurfaceQuery,
} = require('../locationSurfaces');
const {
  intersectSurfaceMapScope,
  filterRowsForSurface,
  projectRowsForSurface,
} = require('../surfaceAccess');
const {
  readAudienceWriteFields,
  assertAudienceGroupsExist,
  serializeGroupIdList,
  serializeRoleSlugList,
  filterLocationsForViewer,
} = require('../locationAudience');
const {
  assertLocationNotesGroupsExist,
  normalizeLocationNotesInput,
  loadLocationNotesMap,
  attachNotesToEntity,
  replaceLocationNotes,
  deleteLocationNotes,
} = require('../locationNotes');
const {
  assertLocationLinksGroupsExist,
  normalizeLocationLinksInput,
  loadLocationLinksMap,
  attachLinksToEntity,
  replaceLocationLinks,
  deleteLocationLinks,
} = require('../locationLinks');
const { resolveZoneEmojiForWrite } = require('../zoneEmoji');
const { normalizeMarkerEmoji } = require('../markerEmoji');
const {
  mapZoneToVisitWhitelistFields,
  mapMarkerToVisitWhitelistFields,
} = require('../visitMapToVisitFields');
const { mapExists } = require('../mapQueries');
const { mirrorLocationToVisit } = require('../visitMapMirror');
const { normalizeLivingBeings, serializeLocationRow } = require('../locationRowHelpers');
const { normalizeEnovDescription } = require('../enovPlan');

const db = { queryAll, queryOne, execute, withTransaction };

// ── Requêtes de lecture ─────────────────────────────────────────────────────────────────

/** Liste polling : sans `visit_body_json` (LONGTEXT) — drapeau `has_visit_body` pour le détail. */
const ZONES_LIST_SQL = `SELECT z.*,
  vz.subtitle AS visit_subtitle,
  vz.short_description AS visit_short_description,
  vz.details_title AS visit_details_title,
  vz.details_text AS visit_details_text,
  CASE
    WHEN vz.body_json IS NOT NULL AND CHAR_LENGTH(vz.body_json) > 2 THEN 1
    ELSE 0
  END AS has_visit_body
FROM zones z
LEFT JOIN visit_zones vz ON vz.id = z.id`;

/** Détail / mutations : inclut le corps éditorial visite. */
const ZONES_DETAIL_SQL = `SELECT z.*,
  vz.subtitle AS visit_subtitle,
  vz.short_description AS visit_short_description,
  vz.details_title AS visit_details_title,
  vz.details_text AS visit_details_text,
  vz.body_json AS visit_body_json,
  CASE
    WHEN vz.body_json IS NOT NULL AND CHAR_LENGTH(vz.body_json) > 2 THEN 1
    ELSE 0
  END AS has_visit_body
FROM zones z
LEFT JOIN visit_zones vz ON vz.id = z.id`;

const MARKERS_SQL = `SELECT m.*,
  vm.subtitle AS visit_subtitle,
  vm.short_description AS visit_short_description,
  vm.details_title AS visit_details_title,
  vm.details_text AS visit_details_text,
  vm.body_json AS visit_body_json
FROM map_markers m
LEFT JOIN visit_markers vm ON vm.id = m.id`;

/**
 * Colonnes héritées retirées de l'API (piste C de l'audit du 25/09/2026, § 3.5, temps T1 et
 * T2) : le code ne les lit ni ne les écrit plus, et elles ne sortent plus dans les réponses,
 * pour que leur suppression au temps T3 (`DROP COLUMN`) ne change rien pour les clients.
 *   - `zones.current_plant`, `map_markers.plant_name` : ancien nom mono-espèce, remplacé par
 *     les jonctions `zone_species` / `marker_species` (reprise : migration 306) ;
 *   - `zones.stage` : état de culture jamais relu (le caractère « infrastructure » vit dans
 *     les catégories).
 * L'historique de cultures (`zone_history`) suit le même chemin : plus lu, plus écrit.
 */

// ── Description des deux types de lieu ─────────────────────────────────────────────────

/** Polygone valide : tableau d'au moins 3 sommets `{xp, yp}` numériques (en %). */
function isValidPolygon(points) {
  return (
    Array.isArray(points) &&
    points.length >= 3 &&
    !points.some((p) => !p || !Number.isFinite(Number(p.xp)) || !Number.isFinite(Number(p.yp)))
  );
}
const POLYGON_ERROR = 'Au moins 3 sommets {xp, yp} numériques requis';

/**
 * Ce qui distingue une zone d'un repère. Tout le reste (validation commune, espèces,
 * catégories, liens, compléments, audience, visite, suppression) est partagé.
 */
const LOCATION_KINDS = Object.freeze({
  zone: Object.freeze({
    kind: 'zone',
    table: 'zones',
    notFound: 'Zone introuvable',
    nameField: 'name',
    nameRequired: 'Nom requis',
    retiredColumns: ['current_plant', 'stage'],
    permission: 'zones.manage',
    emitKey: 'zoneId',
    photoTable: 'zone_photos',
    photoFk: 'zone_id',
    categoryTable: 'zone_categories',
    categoryFk: 'zone_id',
    visitTable: 'visit_zones',
    loadSpeciesMap: loadZoneSpeciesMap,
    syncSpecies: syncZoneSpecies,
    toVisitFields: mapZoneToVisitWhitelistFields,
    /** Colonnes « identité » recopiées dans `visit_zones`. */
    visitIdentityColumns: (row) => [
      ['name', row.name],
      ['points', row.points],
    ],
    newId: () => 'zone-' + crypto.randomUUID().slice(0, 8),
    /** Contrôle de création propre au type (après les champs communs). */
    validateCreate: (body) => (isValidPolygon(body.points) ? null : POLYGON_ERROR),
    /** Contrôle de modification propre au type (après les champs communs). */
    validateUpdate: (body) =>
      body.points !== undefined && !isValidPolygon(body.points) ? POLYGON_ERROR : null,
    /** La carte est contrôlée APRÈS le nom et les champs communs. */
    createChecksMapFirst: false,
    /** L'éditorial visite n'est pas accepté à la création d'une zone (comportement d'origine). */
    visitEditorialOnCreate: false,
    deleteDependentsSql: ['DELETE FROM zone_photos WHERE zone_id = ?'],
    deleteAuditPayload: (row) => ({ name: row.name || null, map_id: row.map_id || null }),
    deleteAuditLabel: (row, id) => `Suppression zone ${row.name || id}`,
    readAfterCreateSql: 'SELECT * FROM zones WHERE id = ?',
    readAfterUpdateSql: `${ZONES_DETAIL_SQL} WHERE z.id = ?`,
    listSql: (mapIds) =>
      mapIds
        ? `${ZONES_LIST_SQL} WHERE z.map_id IN (${mapIds.map(() => '?').join(',')})`
        : ZONES_LIST_SQL,
    /** Colonnes écrites à la création, avant les quatre colonnes communes. */
    insertColumns: (body, { id, mapId }) => [
      ['id', id],
      ['map_id', mapId],
      ['name', body.name.trim()],
      // Colonne `zones.emoji` (audit C4) : explicite, sinon dérivée du préfixe du nom.
      ['emoji', resolveZoneEmojiForWrite(body.emoji, String(body.name), '')],
      ['x', 0],
      ['y', 0],
      ['width', 0],
      ['height', 0],
      ['points', JSON.stringify(body.points)],
      ['color', body.color || '#86efac80'],
      [
        'description',
        body.description !== undefined && body.description !== null ? String(body.description) : '',
      ],
    ],
    /** Colonnes écrites en modification, avant les quatre colonnes communes. */
    updateColumns: async (entity, body, { nextMapId, categoryIds }) => [
      ['map_id', nextMapId],
      ['name', body.name !== undefined ? String(body.name).trim() : entity.name],
      // Colonne `zones.emoji` (audit C4) : valeur explicite du corps ('' = effacer), sinon
      // dérivée du préfixe du nom soumis, sinon valeur existante conservée.
      [
        'emoji',
        resolveZoneEmojiForWrite(
          body.emoji,
          body.name !== undefined ? String(body.name) : '',
          entity.emoji || '',
        ),
      ],
      // `special` n'est plus piloté par le client : c'est le miroir déprécié des catégories
      // portant `is_infrastructure`.
      ['special', (await categoriesCarryInfrastructure(db, categoryIds)) ? 1 : 0],
      [
        'description',
        body.description !== undefined ? body.description : (entity.description ?? ''),
      ],
      ['points', body.points !== undefined ? JSON.stringify(body.points) : entity.points],
      ['color', body.color ?? entity.color],
    ],
    /** `special` est dérivé des catégories (drapeau `is_infrastructure`), jamais du corps. */
    afterCreateCategories: async (id, categoryIds) => {
      if (await categoriesCarryInfrastructure(db, categoryIds)) {
        await execute('UPDATE zones SET special = 1 WHERE id = ?', [id]);
      }
    },
    /** Décoration des lignes de la liste (drapeau du corps visite, corps lui-même retiré). */
    listRowDecorator: async () => (z) => ({
      ...z,
      has_visit_body: !!Number(z.has_visit_body),
      visit_body_json: undefined,
    }),
    /** Après sérialisation de la liste : la clé `visit_body_json` ne doit pas sortir. */
    listRowCleanup: (row) => {
      delete row.visit_body_json;
    },
  }),
  marker: Object.freeze({
    kind: 'marker',
    table: 'map_markers',
    notFound: 'Repère introuvable',
    nameField: 'label',
    nameRequired: 'Label requis',
    retiredColumns: ['plant_name'],
    permission: 'map.manage_markers',
    emitKey: 'markerId',
    photoTable: 'marker_photos',
    photoFk: 'marker_id',
    categoryTable: 'marker_categories',
    categoryFk: 'marker_id',
    visitTable: 'visit_markers',
    loadSpeciesMap: loadMarkerSpeciesMap,
    syncSpecies: syncMarkerSpecies,
    toVisitFields: mapMarkerToVisitWhitelistFields,
    visitIdentityColumns: (row) => [
      ['x_pct', row.x_pct],
      ['y_pct', row.y_pct],
      ['label', row.label],
      ['emoji', normalizeMarkerEmoji(row.emoji, { allowEmpty: true, fallback: '' })],
    ],
    newId: () => crypto.randomUUID(),
    /**
     * Coordonnées en pourcentage : bornées 0-100 à la création (sinon un repère hors carte,
     * ou NaN, était inséré tel quel).
     */
    validateCreate: (body) => {
      const xPct = Number(body.x_pct);
      const yPct = Number(body.y_pct);
      if (!Number.isFinite(xPct) || xPct < 0 || xPct > 100) {
        return 'x_pct doit être un nombre entre 0 et 100';
      }
      if (!Number.isFinite(yPct) || yPct < 0 || yPct > 100) {
        return 'y_pct doit être un nombre entre 0 et 100';
      }
      return null;
    },
    // Défaut conservé (piste B : aucun changement de comportement) : la modification ne
    // borne pas `x_pct` / `y_pct`, contrairement à la création.
    validateUpdate: () => null,
    /** Le repère contrôle sa carte AVANT le libellé (ordre d'origine du handler). */
    createChecksMapFirst: true,
    visitEditorialOnCreate: true,
    deleteDependentsSql: ['DELETE FROM marker_photos WHERE marker_id = ?'],
    deleteAuditPayload: (row) => ({ label: row.label || null, map_id: row.map_id || null }),
    deleteAuditLabel: (row, id) => `Suppression repère ${row.label || id}`,
    readAfterCreateSql: `${MARKERS_SQL} WHERE m.id = ?`,
    readAfterUpdateSql: `${MARKERS_SQL} WHERE m.id = ?`,
    listSql: (mapIds) =>
      mapIds
        ? `${MARKERS_SQL} WHERE m.map_id IN (${mapIds.map(() => '?').join(',')}) ORDER BY m.created_at`
        : `${MARKERS_SQL} ORDER BY m.created_at`,
    insertColumns: (body, { id, mapId }) => [
      ['id', id],
      ['map_id', mapId],
      ['x_pct', Number(body.x_pct)],
      ['y_pct', Number(body.y_pct)],
      ['label', body.label.trim()],
      ['note', body.note || ''],
      ['emoji', normalizeMarkerEmoji(body.emoji, { allowEmpty: true, fallback: '' })],
      ['created_at', nowDbTimestamp()],
    ],
    updateColumns: async (entity, body, { nextMapId }) => [
      ['map_id', nextMapId],
      ['x_pct', body.x_pct ?? entity.x_pct],
      ['y_pct', body.y_pct ?? entity.y_pct],
      ['label', body.label !== undefined ? String(body.label).trim() : entity.label],
      ['note', body.note ?? entity.note],
      [
        'emoji',
        body.emoji !== undefined
          ? normalizeMarkerEmoji(body.emoji, { allowEmpty: true, fallback: '' })
          : String(entity.emoji ?? ''),
      ],
    ],
    afterCreateCategories: async () => {},
    listRowDecorator: async () => (row) => row,
    listRowCleanup: () => {},
  }),
});

function locationKind(kind) {
  const config = LOCATION_KINDS[kind];
  if (!config) throw new Error(`Type de lieu inconnu : ${kind}`);
  return config;
}

// ── Règles communes ─────────────────────────────────────────────────────────────────────

function fail(status, error) {
  return { status, body: { error } };
}

/**
 * Champs communs d'écriture (création comme modification), dans l'ordre d'origine des
 * contrôles : surfaces masquées, audience (rôles puis existence des groupes), liens
 * documentaires, compléments réservés. Omis = `null` (inchangé en modification).
 */
async function validateLocationWriteBody(body) {
  const hiddenSurfacesInput = normalizeSurfaceInput(body.hidden_surfaces, {
    field: 'hidden_surfaces',
  });
  if (!hiddenSurfacesInput.ok) return { ok: false, error: hiddenSurfacesInput.error };
  const audienceInput = readAudienceWriteFields({
    visible_role_slugs: body.visible_role_slugs,
    visible_group_ids: body.visible_group_ids,
  });
  if (!audienceInput.ok) return { ok: false, error: audienceInput.error };
  // Existence des groupes cités : une coquille d'identifiant produirait un lieu que plus
  // personne ne voit, sans le moindre message.
  const audienceGroupsCheck = await assertAudienceGroupsExist(db, audienceInput);
  if (!audienceGroupsCheck.ok) return { ok: false, error: audienceGroupsCheck.error };
  // Liens documentaires : omis = inchangés, `[]` = tous retirés (c'est ce qu'envoie
  // l'interface quand on supprime la dernière ligne).
  const linksInput = normalizeLocationLinksInput(body.links);
  if (!linksInput.ok) return { ok: false, error: linksInput.error };
  if (linksInput.value !== null) {
    const linksGroupsCheck = await assertLocationLinksGroupsExist(db, linksInput.value);
    if (!linksGroupsCheck.ok) return { ok: false, error: linksGroupsCheck.error };
  }
  const notesInput = normalizeLocationNotesInput(body.notes);
  if (!notesInput.ok) return { ok: false, error: notesInput.error };
  if (notesInput.value !== null) {
    const notesGroupsCheck = await assertLocationNotesGroupsExist(db, notesInput.value);
    if (!notesGroupsCheck.ok) return { ok: false, error: notesGroupsCheck.error };
  }
  return { ok: true, hiddenSurfacesInput, audienceInput, linksInput, notesInput };
}

/**
 * Les colonnes communes, en création (valeurs absentes = vides). La dernière,
 * `enov_description` (migration 315), n'est affichée que sur le plan e-nov.
 */
function sharedColumnsForCreate(body, inputs) {
  return [
    ['hidden_surfaces', serializeSurfaceSet(inputs.hiddenSurfacesInput.value || [])],
    ['search_aliases', normalizeSearchAliases(body.search_aliases) || null],
    ['enov_description', normalizeEnovDescription(body.enov_description)],
    [
      'visible_role_slugs',
      serializeRoleSlugList(inputs.audienceInput.visible_role_slugs || []) || null,
    ],
    [
      'visible_group_ids',
      serializeGroupIdList(inputs.audienceInput.visible_group_ids || []) || null,
    ],
  ];
}

/** Les colonnes communes, en modification (omis = valeur existante). */
function sharedColumnsForUpdate(entity, body, inputs) {
  const { hiddenSurfacesInput, audienceInput } = inputs;
  return [
    [
      'hidden_surfaces',
      hiddenSurfacesInput.value === null
        ? String(entity.hidden_surfaces ?? '')
        : serializeSurfaceSet(hiddenSurfacesInput.value),
    ],
    [
      'search_aliases',
      body.search_aliases === undefined
        ? (entity.search_aliases ?? null)
        : normalizeSearchAliases(body.search_aliases) || null,
    ],
    [
      'enov_description',
      body.enov_description === undefined
        ? (entity.enov_description ?? null)
        : normalizeEnovDescription(body.enov_description),
    ],
    [
      'visible_role_slugs',
      audienceInput.visible_role_slugs === null
        ? (entity.visible_role_slugs ?? null)
        : serializeRoleSlugList(audienceInput.visible_role_slugs) || null,
    ],
    [
      'visible_group_ids',
      audienceInput.visible_group_ids === null
        ? (entity.visible_group_ids ?? null)
        : serializeGroupIdList(audienceInput.visible_group_ids) || null,
    ],
  ];
}

/** Carte d'une création : explicite, sinon carte par défaut des enseignants. */
async function resolveCreateMapId(body) {
  const mapId = String(body.map_id || '').trim() || (await resolveDefaultMapId('teacher'));
  if (!mapId) return { ok: false, error: 'map_id requis' };
  if (!(await mapExists(mapId))) return { ok: false, error: 'Carte introuvable' };
  return { ok: true, mapId };
}

/** Carte d'une modification : `map_id` fourni doit désigner une carte existante. */
async function checkUpdateMapId(body) {
  if (body.map_id == null) return null;
  const nextMapId = String(body.map_id).trim();
  if (!nextMapId) return 'map_id invalide';
  if (!(await mapExists(nextMapId))) return 'Carte introuvable';
  return null;
}

/**
 * Êtres vivants d'un lieu modifié : `living_beings` fourni fait foi ; sinon les noms de la
 * jonction existante (transmis à la synchronisation quand seul `species_ids` est fourni).
 * L'ancien nom mono-espèce n'est plus un repli (piste C, T1).
 */
async function resolveLivingBeingsForUpdate(config, entity, body) {
  if (body.living_beings !== undefined) return normalizeLivingBeings(body.living_beings, '');
  const speciesRowsBefore = await config.loadSpeciesMap(db, [entity.id]);
  return (speciesRowsBefore.get(String(entity.id)) || [])
    .map((row) => String(row.name || '').trim())
    .filter(Boolean);
}

/**
 * Catégories effectives après un patch partiel : `category_ids` absent du corps ⇒
 * affectations courantes conservées (réévaluées si la carte change : une catégorie propre à
 * l'ancienne carte n'est plus assignable).
 */
async function nextCategoryIds(config, entityId, bodyCategoryIds) {
  if (bodyCategoryIds !== undefined) return bodyCategoryIds;
  const rows = await queryAll(
    `SELECT category_id FROM ${config.categoryTable} WHERE ${config.categoryFk} = ?`,
    [entityId],
  );
  return rows.map((row) => String(row.category_id));
}

/** Liens et compléments réservés : remplacés seulement s'ils sont fournis. */
async function replaceLocationTexts(config, entityId, inputs) {
  if (inputs.linksInput.value !== null) {
    await replaceLocationLinks(db, config.kind, entityId, inputs.linksInput.value);
  }
  if (inputs.notesInput.value !== null) {
    await replaceLocationNotes(db, config.kind, entityId, inputs.notesInput.value);
  }
}

// ── Sérialisation ───────────────────────────────────────────────────────────────────────

/** Espèces, catégories, liens et compléments de plusieurs lieux (une requête par table). */
async function loadLocationRelations(config, ids) {
  const [species, categories, links, notes] = await Promise.all([
    config.loadSpeciesMap(db, ids),
    loadCategoriesMap(db, config.kind, ids),
    // Liens documentaires (migration 261) et compléments réservés (migration 263) : posés
    // bruts, puis filtrés par rôle avec le reste de l'audience (`filterLocationsForViewer`).
    loadLocationLinksMap(db, config.kind, ids),
    loadLocationNotesMap(db, config.kind, ids),
  ]);
  return { species, categories, links, notes };
}

/**
 * Ligne SQL d'un lieu (+ relations chargées) → objet API. Les colonnes héritées retirées
 * (`retiredColumns`) ne sortent pas, même quand la requête les lit encore (`SELECT *`).
 */
function serializeLocation(config, row, relations) {
  const key = String(row.id);
  const payload = serializeLocationRow(
    attachNotesToEntity(
      attachLinksToEntity(
        attachCategoriesToEntity(
          attachSpeciesToEntity(row, relations.species.get(key) || []),
          relations.categories.get(key) || [],
        ),
        relations.links.get(key) || [],
      ),
      relations.notes.get(key) || [],
    ),
  );
  for (const column of config.retiredColumns) delete payload[column];
  return payload;
}

async function serializeOneLocation(config, row) {
  return serializeLocation(config, row, await loadLocationRelations(config, [row.id]));
}

// ── Éditorial visite (tables `visit_zones` / `visit_markers`, même `id`) ────────────────

const VISIT_CONTENT_FIELDS = [
  'visit_subtitle',
  'visit_short_description',
  'visit_details_title',
  'visit_details_text',
  'visit_body_json',
  'visit_editorial_blocks',
];

function hasVisitContentPatch(body) {
  if (!body || typeof body !== 'object') return false;
  return VISIT_CONTENT_FIELDS.some((k) => body[k] !== undefined);
}

/** Champs éditoriaux après patch : fournis = normalisés, omis = valeur existante. */
function resolveVisitEditorialFields(reqBody, existing) {
  const patchBlocksInput =
    reqBody.visit_editorial_blocks !== undefined
      ? reqBody.visit_editorial_blocks
      : reqBody.visit_body_json;
  const normalizedBlocks =
    patchBlocksInput !== undefined
      ? parseVisitEditorialBlocksInput(patchBlocksInput)
      : parseVisitEditorialBlocksInput(existing?.body_json);
  return {
    subtitle:
      reqBody.visit_subtitle !== undefined
        ? String(reqBody.visit_subtitle || '').trim()
        : String(existing?.subtitle || ''),
    short_description:
      reqBody.visit_short_description !== undefined
        ? String(reqBody.visit_short_description || '').trim()
        : String(existing?.short_description || ''),
    details_title:
      reqBody.visit_details_title !== undefined
        ? String(reqBody.visit_details_title || 'Détails').trim() || 'Détails'
        : String(existing?.details_title || 'Détails').trim() || 'Détails',
    details_text:
      reqBody.visit_details_text !== undefined
        ? String(reqBody.visit_details_text || '').trim()
        : String(existing?.details_text || ''),
    body_json: serializeVisitEditorialBlocks(normalizedBlocks),
  };
}

async function upsertVisitEditorial(config, reqBody, row) {
  const existing = await queryOne(
    `SELECT subtitle, short_description, details_title, details_text, body_json FROM ${config.visitTable} WHERE id = ? LIMIT 1`,
    [row.id],
  );
  const editorial = resolveVisitEditorialFields(reqBody, existing);
  const audience = config.toVisitFields(row);
  const now = nowDbTimestamp();
  const updatable = [
    ['map_id', row.map_id],
    ...config.visitIdentityColumns(row),
    ['subtitle', editorial.subtitle],
    ['short_description', editorial.short_description],
    ['details_title', editorial.details_title],
    ['details_text', editorial.details_text],
    ['body_json', editorial.body_json],
    ['visible_role_slugs', audience.visible_role_slugs],
    ['visible_group_ids', audience.visible_group_ids],
  ];
  const columns = ['id', ...updatable.map(([c]) => c), 'is_active', 'sort_order'];
  columns.push('created_at', 'updated_at');
  await execute(
    `INSERT INTO ${config.visitTable}
      (${columns.join(', ')})
     VALUES (?, ${updatable.map(() => '?').join(', ')}, 1, 0, ?, ?)
     ON DUPLICATE KEY UPDATE
       ${[...updatable.map(([c]) => `${c} = VALUES(${c})`), 'updated_at = VALUES(updated_at)'].join(',\n       ')}`,
    [row.id, ...updatable.map(([, v]) => v), now, now],
  );
}

/** Miroir audience carte → visite si une ligne visite existe (sans toucher l'éditorial). */
async function mirrorAudienceToVisit(config, row) {
  const audience = config.toVisitFields(row);
  await execute(
    `UPDATE ${config.visitTable}
     SET visible_role_slugs = ?, visible_group_ids = ?, updated_at = ?
     WHERE id = ? AND map_id = ?`,
    [audience.visible_role_slugs, audience.visible_group_ids, nowDbTimestamp(), row.id, row.map_id],
  );
}

// ── Opérations ──────────────────────────────────────────────────────────────────────────

/**
 * Liste des lieux d'une carte (ou de toutes les cartes du périmètre), bornée par le
 * périmètre du compte, la surface servie et l'audience du lecteur.
 *
 * `?surface=` n'élargit plus rien : il s'ajoute à la surface du serveur en intersection
 * (`lib/shared/surfaceCore.js`) ; une valeur inconnue reste rejetée.
 */
async function listLocations(kind, { mapIdParam, surfaceParam, auth, locationSurface }) {
  const config = locationKind(kind);
  const mapId = mapIdParam ? String(mapIdParam).trim() : '';
  if (mapId && !(await mapExists(mapId))) return fail(400, 'Carte introuvable');
  const surfaceQuery = readSurfaceQuery(surfaceParam);
  if (!surfaceQuery.ok) return fail(400, surfaceQuery.error);
  const { publicSurface, viewerAuth, filters } = locationSurface;
  // Périmètre cartes : carte demandée hors périmètre → 403 ; sans `map_id`, la liste
  // complète est ramenée aux cartes autorisées. Se cumule au filtre d'audience appliqué
  // plus bas, qui trie les lieux d'une même carte selon le rôle.
  const scope = await resolveScopedMapFilter(auth || null, mapId);
  if (scope.forbidden) return { status: 403, body: MAP_OUT_OF_SCOPE };
  // …puis au périmètre de la **surface** : une carte non déclarée sur la surface servie
  // n'en sort pas, même si le compte y a droit par ailleurs.
  const surfaceScope = intersectSurfaceMapScope(locationSurface, scope.mapIds, mapId);
  if (surfaceScope.notFound) return fail(400, 'Carte introuvable');
  // Périmètre vide : aucun lieu. Le court-circuit évite surtout un `IN ()` invalide.
  if (surfaceScope.mapIds && surfaceScope.mapIds.length === 0) return { status: 200, body: [] };
  const rows = await queryAll(config.listSql(surfaceScope.mapIds), surfaceScope.mapIds || []);
  const ids = rows.map((row) => row.id);
  const decorate = await config.listRowDecorator(rows);
  const relations = await loadLocationRelations(config, ids);
  const result = rows.map((row) => serializeLocation(config, decorate(row), relations));
  for (const row of result) config.listRowCleanup(row);
  const surfaced = projectRowsForSurface(filterRowsForSurface(result, filters), locationSurface);
  return { status: 200, body: filterLocationsForViewer(surfaced, viewerAuth, { publicSurface }) };
}

/** Création d'une zone ou d'un repère. */
async function createLocation(kind, body = {}) {
  const config = locationKind(kind);
  let mapId = null;
  if (config.createChecksMapFirst) {
    const map = await resolveCreateMapId(body);
    if (!map.ok) return fail(400, map.error);
    mapId = map.mapId;
  }
  if (!body[config.nameField]?.trim()) return fail(400, config.nameRequired);
  const inputs = await validateLocationWriteBody(body);
  if (!inputs.ok) return fail(400, inputs.error);
  const kindError = config.validateCreate(body);
  if (kindError) return fail(400, kindError);
  if (!config.createChecksMapFirst) {
    const map = await resolveCreateMapId(body);
    if (!map.ok) return fail(400, map.error);
    mapId = map.mapId;
  }
  const nextLiving = normalizeLivingBeings(body.living_beings, '');
  const id = config.newId();
  const columns = [
    ...config.insertColumns(body, { id, mapId }),
    ...sharedColumnsForCreate(body, inputs),
  ];
  await execute(
    `INSERT INTO ${config.table} (${columns.map(([c]) => c).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    columns.map(([, v]) => v),
  );
  await config.syncSpecies(db, id, body.species_ids, nextLiving);
  await replaceLocationTexts(config, id, inputs);
  const categoryIds = await syncEntityCategories(db, {
    kind: config.kind,
    entityId: id,
    mapId,
    categoryIds: body.category_ids,
  });
  await config.afterCreateCategories(id, categoryIds);
  let row = await queryOne(config.readAfterCreateSql, [id]);
  if (config.visitEditorialOnCreate && hasVisitContentPatch(body)) {
    await upsertVisitEditorial(config, body, row);
  } else {
    await mirrorLocationToVisit(db, config.kind, row);
  }
  row = await queryOne(config.readAfterCreateSql, [id]);
  const payload = await serializeOneLocation(config, row);
  return {
    status: 201,
    body: payload,
    entity: { id, mapId, label: body[config.nameField].trim() },
  };
}

/** Modification d'une zone ou d'un repère (champs omis = inchangés). */
async function updateLocation(kind, id, body = {}) {
  const config = locationKind(kind);
  const entity = await queryOne(`SELECT * FROM ${config.table} WHERE id = ?`, [id]);
  if (!entity) return fail(404, config.notFound);
  const name = body[config.nameField];
  if (name !== undefined && !String(name).trim()) return fail(400, config.nameRequired);
  const inputs = await validateLocationWriteBody(body);
  if (!inputs.ok) return fail(400, inputs.error);
  const kindError = config.validateUpdate(body);
  if (kindError) return fail(400, kindError);
  const mapError = await checkUpdateMapId(body);
  if (mapError) return fail(400, mapError);
  const nextLiving = await resolveLivingBeingsForUpdate(config, entity, body);
  const nextMapId = body.map_id != null ? String(body.map_id).trim() : entity.map_id;
  const categoryIds = await syncEntityCategories(db, {
    kind: config.kind,
    entityId: entity.id,
    mapId: nextMapId,
    categoryIds: await nextCategoryIds(config, entity.id, body.category_ids),
  });
  const columns = [
    ...(await config.updateColumns(entity, body, { nextMapId, categoryIds })),
    ...sharedColumnsForUpdate(entity, body, inputs),
  ];
  await execute(
    `UPDATE ${config.table} SET ${columns.map(([c]) => `${c}=?`).join(', ')} WHERE id=?`,
    [...columns.map(([, v]) => v), entity.id],
  );
  if (body.living_beings !== undefined || body.species_ids !== undefined) {
    await config.syncSpecies(db, entity.id, body.species_ids, nextLiving);
  }
  await replaceLocationTexts(config, entity.id, inputs);
  const updated = await queryOne(config.readAfterUpdateSql, [entity.id]);
  if (hasVisitContentPatch(body)) {
    await upsertVisitEditorial(config, body, updated);
  } else {
    await mirrorLocationToVisit(db, config.kind, updated);
    if (
      inputs.audienceInput.visible_role_slugs !== null ||
      inputs.audienceInput.visible_group_ids !== null
    ) {
      await mirrorAudienceToVisit(config, updated);
    }
  }
  const row = await queryOne(config.readAfterUpdateSql, [entity.id]);
  const payload = await serializeOneLocation(config, row);
  return {
    status: 200,
    body: payload,
    entity: {
      id: entity.id,
      mapId: row.map_id,
      label: name !== undefined ? String(name).trim() : entity[config.nameField],
    },
  };
}

/**
 * Suppression d'une zone ou d'un repère, avec ses dépendances sans clé étrangère (liens et
 * compléments : cible polymorphe) et la cible visite « fantôme » qui partage son `id`
 * (ligne, médias, progression), dans une seule transaction. Les fichiers photo sont
 * effacés après validation de la transaction.
 */
async function deleteLocation(kind, id) {
  const config = locationKind(kind);
  const row = await queryOne(`SELECT * FROM ${config.table} WHERE id = ?`, [id]);
  if (!row) return fail(404, config.notFound);
  const photos = await queryAll(
    `SELECT image_path FROM ${config.photoTable} WHERE ${config.photoFk} = ?`,
    [id],
  );
  await withTransaction(async (tx) => {
    for (const sql of config.deleteDependentsSql) await tx.execute(sql, [id]);
    await deleteLocationLinks(tx, config.kind, id);
    await deleteLocationNotes(tx, config.kind, id);
    await tx.execute(`DELETE FROM ${config.table} WHERE id = ?`, [id]);
    await deleteVisitTargetCascade(config.kind, id, tx);
  });
  for (const p of photos) {
    if (p && p.image_path) deleteMapPhotoMainAndThumb(p.image_path);
  }
  return {
    status: 200,
    body: { success: true },
    entity: {
      id,
      mapId: row.map_id,
      label: config.deleteAuditLabel(row, id),
      auditPayload: config.deleteAuditPayload(row),
    },
  };
}

/**
 * Notification d'une écriture : temps réel (`garden:changed`) puis journal d'audit.
 * `action` : `create` | `update` | `delete`.
 */
async function notifyLocationChange(kind, action, entity, { req } = {}) {
  const config = locationKind(kind);
  const event = `${action}_${config.kind}`;
  emitGardenChanged({ reason: event, [config.emitKey]: entity.id, mapId: entity.mapId });
  await logAudit(event, config.kind, entity.id, entity.label, {
    req,
    payload: entity.auditPayload || { map_id: entity.mapId },
  });
}

module.exports = {
  LOCATION_KINDS,
  ZONES_DETAIL_SQL,
  locationKind,
  listLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  notifyLocationChange,
  loadLocationRelations,
  serializeLocation,
  hasVisitContentPatch,
  resolveVisitEditorialFields,
  validateLocationWriteBody,
};
