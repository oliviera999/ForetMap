'use strict';

/**
 * Catégories de lieux (zones et repères) — chargement, sérialisation et
 * synchronisation des tables de jonction `zone_categories` / `marker_categories`.
 *
 * Une catégorie est soit **globale** (`map_id = NULL`, valable sur toutes les cartes),
 * soit **propre à une carte**. `applies_to` restreint son usage aux zones, aux repères
 * ou aux deux. `is_infrastructure` reprend l'ancien drapeau `zones.special` : c'est le
 * seul champ qui porte du comportement (pas de section Biodiversité en visite, lieu non
 * proposé comme cible de tâche, contour en pointillés sur la carte).
 */

const APPLIES_TO_VALUES = ['zone', 'marker', 'both'];

/** Normalise une liste d'identifiants de catégories (chaînes non vides, dédoublonnées). */
const { SURFACES, parseSurfaceSet, withLocationSurfaceFields } = require('./locationSurfaces');

function normalizeCategoryIds(input) {
  const base = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(input);
            if (Array.isArray(parsed)) return parsed;
          } catch (_) {
            /* liste CSV tolérée */
          }
          return input.split(',');
        })()
      : [];
  return [...new Set(base.map((v) => String(v ?? '').trim()).filter(Boolean))];
}

/** Slug ASCII minuscule (sert de clé lisible et d'unicité par carte). */
function slugifyCategoryLabel(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function normalizeAppliesTo(value, fallback = 'both') {
  const v = String(value ?? '')
    .trim()
    .toLowerCase();
  return APPLIES_TO_VALUES.includes(v) ? v : fallback;
}

/** Tolère booléen, nombre et chaîne ('0'/'false'/'' → 0). `undefined` → `fallback`. */
function normalizeBooleanFlag(value, fallback = 0) {
  if (value === undefined) return fallback ? 1 : 0;
  if (value === null) return 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === '' || v === '0' || v === 'false' ? 0 : 1;
  }
  return value ? 1 : 0;
}

/** Ligne SQL → objet API. */
function serializeCategoryRow(row) {
  return {
    id: String(row.id),
    map_id: row.map_id == null ? null : String(row.map_id),
    slug: String(row.slug || ''),
    label: String(row.label || ''),
    emoji: String(row.emoji || ''),
    color: String(row.color || ''),
    description: String(row.description || ''),
    applies_to: normalizeAppliesTo(row.applies_to),
    is_infrastructure: !!row.is_infrastructure,
    sort_order: Number(row.sort_order) || 0,
    is_active: !!row.is_active,
    // Surfaces où la catégorie apparaît (lot 4) ; une ligne sans colonne (ancien schéma en
    // cours de migration) vaut « toutes ».
    surfaces: row.surfaces === undefined ? [...SURFACES] : parseSurfaceSet(row.surfaces),
  };
}

const CATEGORY_SELECT = `SELECT id, map_id, slug, label, emoji, color, description,
  applies_to, is_infrastructure, sort_order, is_active, surfaces
  FROM location_categories`;

const CATEGORY_ORDER = ' ORDER BY sort_order ASC, label ASC';

/**
 * Catégories utilisables sur une carte : globales (`map_id IS NULL`) + celles de la carte.
 * @param {object} db
 * @param {{ mapId?: string, kind?: 'zone'|'marker', includeInactive?: boolean, surface?: string }} [options]
 *   `surface` : ne garde que les catégories qui apparaissent sur cette surface (lot 4).
 */
async function listCategories(db, options = {}) {
  const { mapId = '', kind = '', includeInactive = false, surface = '' } = options;
  const where = [];
  const params = [];
  if (surface) {
    where.push('FIND_IN_SET(?, surfaces) > 0');
    params.push(String(surface));
  }
  if (mapId) {
    where.push('(map_id IS NULL OR map_id = ?)');
    params.push(String(mapId));
  }
  if (kind === 'zone' || kind === 'marker') {
    where.push("(applies_to = 'both' OR applies_to = ?)");
    params.push(kind);
  }
  if (!includeInactive) where.push('is_active = 1');
  const sql = `${CATEGORY_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}${CATEGORY_ORDER}`;
  const rows = await db.queryAll(sql, params);
  return rows.map(serializeCategoryRow);
}

async function getCategoryById(db, id) {
  const row = await db.queryOne(`${CATEGORY_SELECT} WHERE id = ? LIMIT 1`, [String(id || '')]);
  return row ? serializeCategoryRow(row) : null;
}

function junctionConfig(kind) {
  return kind === 'marker'
    ? { table: 'marker_categories', column: 'marker_id' }
    : { table: 'zone_categories', column: 'zone_id' };
}

/**
 * Catégories par entité : `Map<entityId, category[]>` (ordre `sort_order`, `label`).
 * @param {'zone'|'marker'} kind
 */
async function loadCategoriesMap(db, kind, entityIds) {
  const ids = [...new Set((entityIds || []).map((id) => String(id ?? '').trim()).filter(Boolean))];
  const map = new Map();
  if (ids.length === 0) return map;
  const { table, column } = junctionConfig(kind);
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `SELECT j.${column} AS entity_id, c.id, c.map_id, c.slug, c.label, c.emoji, c.color,
            c.description, c.applies_to, c.is_infrastructure, c.sort_order, c.is_active,
            c.surfaces
       FROM ${table} j
       JOIN location_categories c ON c.id = j.category_id
      WHERE j.${column} IN (${placeholders})
      ORDER BY c.sort_order ASC, c.label ASC`,
    ids,
  );
  for (const row of rows) {
    const key = String(row.entity_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(serializeCategoryRow(row));
  }
  return map;
}

/**
 * Ajoute `categories`, `category_ids` et `is_infrastructure` à une entité sérialisée, et
 * normalise ses champs de surface (`hidden_surfaces` en tableau, `search_aliases` en chaîne —
 * lot 4, `lib/locationSurfaces.js`) : c'est le point de passage de toute réponse zone / repère.
 * Pour les zones (seule table à porter la colonne), `special` reste exposé — déprécié,
 * comme simple miroir de `is_infrastructure` ; il n'est pas inventé pour les repères.
 */
function attachCategoriesToEntity(entity, categories) {
  const list = categories || [];
  const isInfrastructure = list.some((c) => c.is_infrastructure);
  const next = {
    ...withLocationSurfaceFields(entity),
    categories: list,
    category_ids: list.map((c) => c.id),
    is_infrastructure: isInfrastructure,
  };
  if (entity && Object.prototype.hasOwnProperty.call(entity, 'special')) {
    next.special = isInfrastructure;
  }
  return next;
}

/**
 * Ne retient que les catégories réellement utilisables pour l'entité :
 * actives, applicables au type, et globales ou rattachées à la carte de l'entité.
 * @returns {Promise<string[]>} identifiants valides, dans l'ordre `sort_order`
 */
async function resolveAssignableCategoryIds(db, { kind, mapId, categoryIds }) {
  const ids = normalizeCategoryIds(categoryIds);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.queryAll(
    `${CATEGORY_SELECT} WHERE id IN (${placeholders})
        AND is_active = 1
        AND (map_id IS NULL OR map_id = ?)
        AND (applies_to = 'both' OR applies_to = ?)
      ${CATEGORY_ORDER.trim()}`,
    [...ids, String(mapId || ''), kind === 'marker' ? 'marker' : 'zone'],
  );
  return rows.map((row) => String(row.id));
}

/**
 * Remplace les catégories d'une entité par `categoryIds` (celles qui sont assignables).
 * @returns {Promise<string[]>} identifiants effectivement enregistrés
 */
async function syncEntityCategories(db, { kind, entityId, mapId, categoryIds }) {
  const valid = await resolveAssignableCategoryIds(db, { kind, mapId, categoryIds });
  const { table, column } = junctionConfig(kind);
  const run = async (tx) => {
    await tx.execute(`DELETE FROM ${table} WHERE ${column} = ?`, [entityId]);
    for (const categoryId of valid) {
      await tx.execute(`INSERT INTO ${table} (${column}, category_id) VALUES (?, ?)`, [
        entityId,
        categoryId,
      ]);
    }
  };
  if (typeof db.withTransaction === 'function') await db.withTransaction(run);
  else await run(db);
  return valid;
}

/**
 * Réaligne la colonne dépréciée `zones.special` sur les catégories effectivement
 * affectées. Nécessaire après toute opération qui touche `is_infrastructure` en masse
 * (suppression d'une catégorie, bascule du drapeau) : la jonction reste la source de
 * vérité, `special` n'en est qu'un miroir conservé pour la synchronisation carte → visite
 * et pour l'export SQL.
 */
async function resyncZonesInfrastructureMirror(db) {
  await db.execute(
    `UPDATE zones z
        SET z.special = (
          SELECT COUNT(*) > 0
            FROM zone_categories zc
            JOIN location_categories c ON c.id = zc.category_id
           WHERE zc.zone_id = z.id AND c.is_infrastructure = 1
        )`,
  );
}

/** Une des catégories affectées porte-t-elle `is_infrastructure` ? (miroir `zones.special`) */
async function categoriesCarryInfrastructure(db, categoryIds) {
  const ids = normalizeCategoryIds(categoryIds);
  if (ids.length === 0) return false;
  const placeholders = ids.map(() => '?').join(', ');
  const row = await db.queryOne(
    `SELECT 1 AS found FROM location_categories
      WHERE id IN (${placeholders}) AND is_infrastructure = 1 LIMIT 1`,
    ids,
  );
  return !!row;
}

module.exports = {
  APPLIES_TO_VALUES,
  normalizeCategoryIds,
  normalizeAppliesTo,
  normalizeBooleanFlag,
  slugifyCategoryLabel,
  serializeCategoryRow,
  listCategories,
  getCategoryById,
  loadCategoriesMap,
  attachCategoriesToEntity,
  resolveAssignableCategoryIds,
  syncEntityCategories,
  categoriesCarryInfrastructure,
  resyncZonesInfrastructureMirror,
};
