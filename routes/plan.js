'use strict';

/**
 * API publique du Plan Lyautey (`/api/plan/*`, lot 4 du plan de convergence —
 * `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8, `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §6).
 *
 * Le plan est un produit **sans session** : une seule carte, des lieux à trouver, aucune
 * validation de visite. Il lit les **mêmes tables** que la carte de travail ForetMap et la
 * Visite (`zones`, `map_markers`, `location_categories`, textes `visit_*`, photos de carte)
 * — pas de copie des lieux — et ne renvoie que ce qui est visible sur la surface `plan`
 * (`lib/locationSurfaces.js`). Ni tâches, ni élèves, ni progression ne sortent d'ici.
 *
 * Charge utile agrégée et mise en cache par carte (`lib/shared/writeVersionCache.js`) :
 * périmée à la première écriture, avec TTL garde-fou, plus `Cache-Control` court pour le
 * navigateur et le service worker.
 */

const express = require('express');

const { queryAll, queryOne, getDataWriteVersion } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const { createWriteVersionCache } = require('../lib/shared/writeVersionCache');
const { getSettingValue, SETTINGS_REGISTRY } = require('../lib/settings');
const { loadCategoriesMap, attachCategoriesToEntity } = require('../lib/locationCategories');
const { isVisibleOnSurface, searchAliasesToList } = require('../lib/locationSurfaces');
const { pickNewestMapPhotoByTarget, serializeMapLeadPhoto } = require('../lib/visitContentHelpers');

const router = express.Router();

/** Surface servie par ce routeur (`lib/locationSurfaces.js`). */
const PLAN_SURFACE = 'plan';

/** Fraîcheur navigateur / service worker de la charge publique (secondes). */
const PLAN_CONTENT_MAX_AGE_S = 60;

const planContentCache = createWriteVersionCache({
  writeVersion: getDataWriteVersion,
  name: 'planContentCache',
});

/** Clés `ui.plan.*` exposées telles quelles (toutes de portée `public`). */
const PLAN_SETTING_KEYS = Object.freeze([
  'ui.plan.map_id',
  'ui.plan.title',
  'ui.plan.welcome_hint',
  'ui.plan.access_mode',
  'ui.plan.attribution',
  'ui.plan.default_category_ids',
  'ui.plan.hidden_category_ids',
]);

function settingDefault(key) {
  return SETTINGS_REGISTRY[key]?.default ?? '';
}

/** Liste d'identifiants séparés par `;` (réglages `ui.plan.*_category_ids`). */
function idListFromSetting(value) {
  return String(value ?? '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Réglages publics du plan, valeurs par défaut du registre comprises. */
async function loadPlanSettings() {
  const out = {};
  for (const key of PLAN_SETTING_KEYS) {
    const short = key.slice('ui.plan.'.length);
    const value = await getSettingValue(key, settingDefault(key));
    out[short] = value == null ? settingDefault(key) : value;
  }
  return {
    map_id: String(out.map_id || ''),
    title: String(out.title || ''),
    welcome_hint: String(out.welcome_hint || ''),
    access_mode: out.access_mode === 'code' ? 'code' : 'public',
    attribution: String(out.attribution || ''),
    default_category_ids: idListFromSetting(out.default_category_ids),
    hidden_category_ids: idListFromSetting(out.hidden_category_ids),
  };
}

const MAP_SELECT =
  'SELECT id, label, map_image_url, sort_order, frame_padding_px, is_active, geo_anchors_json, gps_enabled FROM maps';

/**
 * Carte du plan : `?map_id=` si fournie (400 si inconnue), sinon `ui.plan.map_id` si
 * active, sinon la première carte active (le plan doit toujours pouvoir s'afficher).
 * @returns {Promise<{ map: object|null, error?: string }>}
 */
async function resolvePlanMap(rawMapId, settings) {
  const requested = String(rawMapId || '').trim();
  if (requested) {
    const row = await queryOne(`${MAP_SELECT} WHERE id = ? LIMIT 1`, [requested]);
    return row ? { map: row } : { map: null, error: 'Carte introuvable' };
  }
  const preferred = String(settings.map_id || '').trim();
  if (preferred) {
    const row = await queryOne(`${MAP_SELECT} WHERE id = ? AND is_active = 1 LIMIT 1`, [preferred]);
    if (row) return { map: row };
  }
  const first = await queryOne(
    `${MAP_SELECT} WHERE is_active = 1 ORDER BY sort_order ASC, label ASC LIMIT 1`,
  );
  return first ? { map: first } : { map: null, error: 'Aucune carte active' };
}

function parseGeoAnchors(raw) {
  if (raw == null || raw === '') return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function serializePlanMap(row) {
  return {
    id: String(row.id),
    label: String(row.label || ''),
    map_image_url: row.map_image_url == null ? null : String(row.map_image_url),
    frame_padding_px: row.frame_padding_px == null ? null : Number(row.frame_padding_px),
    gps_enabled: !!Number(row.gps_enabled),
    geo_anchors: parseGeoAnchors(row.geo_anchors_json),
  };
}

const ZONES_SQL = `SELECT z.id, z.map_id, z.name, z.emoji, z.points, z.color, z.description,
  z.hidden_surfaces, z.search_aliases,
  vz.subtitle AS visit_subtitle,
  vz.short_description AS visit_short_description,
  vz.details_title AS visit_details_title,
  vz.details_text AS visit_details_text
FROM zones z
LEFT JOIN visit_zones vz ON vz.id = z.id
WHERE z.map_id = ?
ORDER BY z.name ASC`;

const MARKERS_SQL = `SELECT m.id, m.map_id, m.x_pct, m.y_pct, m.label, m.emoji, m.note,
  m.hidden_surfaces, m.search_aliases,
  vm.subtitle AS visit_subtitle,
  vm.short_description AS visit_short_description,
  vm.details_title AS visit_details_title,
  vm.details_text AS visit_details_text
FROM map_markers m
LEFT JOIN visit_markers vm ON vm.id = m.id
WHERE m.map_id = ?
ORDER BY m.label ASC`;

const ZONE_PHOTOS_SQL = `SELECT zp.zone_id AS target_id, zp.id, zp.caption, zp.uploaded_at, zp.sort_order, zp.image_path
  FROM zone_photos zp
  INNER JOIN zones z ON z.id = zp.zone_id AND z.map_id = ?
  ORDER BY zp.zone_id ASC, zp.sort_order ASC, zp.id ASC`;

const MARKER_PHOTOS_SQL = `SELECT mp.marker_id AS target_id, mp.id, mp.caption, mp.uploaded_at, mp.sort_order, mp.image_path
  FROM marker_photos mp
  INNER JOIN map_markers m ON m.id = mp.marker_id AND m.map_id = ?
  ORDER BY mp.marker_id ASC, mp.sort_order ASC, mp.id ASC`;

const CATEGORIES_SQL = `SELECT id, map_id, slug, label, emoji, color, description, applies_to,
  is_infrastructure, sort_order, is_active, surfaces, zoom_only
  FROM location_categories
  WHERE is_active = 1 AND (map_id IS NULL OR map_id = ?) AND FIND_IN_SET('plan', surfaces) > 0
  ORDER BY sort_order ASC, label ASC`;

function textOrEmpty(value) {
  return value == null ? '' : String(value);
}

/** Champs publics communs d'un lieu du plan (jamais de donnée pédagogique ou nominative). */
function publicPlaceFields(row, hiddenCategoryIds) {
  const categoryIds = (row.category_ids || []).filter((id) => !hiddenCategoryIds.has(id));
  return {
    id: String(row.id),
    emoji: textOrEmpty(row.emoji).trim(),
    category_ids: categoryIds,
    search_aliases: searchAliasesToList(row.search_aliases),
    visit_subtitle: textOrEmpty(row.visit_subtitle),
    visit_short_description: textOrEmpty(row.visit_short_description),
    visit_details_title: textOrEmpty(row.visit_details_title),
    visit_details_text: textOrEmpty(row.visit_details_text),
  };
}

async function buildPlanContent(map, settings) {
  const mapId = String(map.id);
  const [zoneRows, markerRows, categoryRows, zonePhotoRows, markerPhotoRows] = await Promise.all([
    queryAll(ZONES_SQL, [mapId]),
    queryAll(MARKERS_SQL, [mapId]),
    queryAll(CATEGORIES_SQL, [mapId]),
    queryAll(ZONE_PHOTOS_SQL, [mapId]),
    queryAll(MARKER_PHOTOS_SQL, [mapId]),
  ]);
  const db = { queryAll, queryOne };
  const [zoneCategories, markerCategories] = await Promise.all([
    loadCategoriesMap(
      db,
      'zone',
      zoneRows.map((z) => z.id),
    ),
    loadCategoriesMap(
      db,
      'marker',
      markerRows.map((m) => m.id),
    ),
  ]);
  const hiddenCategoryIds = new Set(settings.hidden_category_ids);
  const zoneLead = pickNewestMapPhotoByTarget(zonePhotoRows);
  const markerLead = pickNewestMapPhotoByTarget(markerPhotoRows);

  const zones = zoneRows
    .map((row) => attachCategoriesToEntity(row, zoneCategories.get(String(row.id)) || []))
    .filter((row) => isVisibleOnSurface(row, PLAN_SURFACE))
    .map((row) => ({
      ...publicPlaceFields(row, hiddenCategoryIds),
      name: textOrEmpty(row.name),
      points: textOrEmpty(row.points),
      color: textOrEmpty(row.color),
      description: textOrEmpty(row.description),
      map_lead_photo: serializeMapLeadPhoto('zone', row.id, zoneLead.get(String(row.id))),
    }));

  const markers = markerRows
    .map((row) => attachCategoriesToEntity(row, markerCategories.get(String(row.id)) || []))
    .filter((row) => isVisibleOnSurface(row, PLAN_SURFACE))
    .map((row) => ({
      ...publicPlaceFields(row, hiddenCategoryIds),
      label: textOrEmpty(row.label),
      x_pct: Number(row.x_pct),
      y_pct: Number(row.y_pct),
      note: textOrEmpty(row.note),
      map_lead_photo: serializeMapLeadPhoto('marker', row.id, markerLead.get(String(row.id))),
    }));

  const categories = categoryRows
    .filter((row) => !hiddenCategoryIds.has(String(row.id)))
    .map((row) => ({
      id: String(row.id),
      slug: textOrEmpty(row.slug),
      label: textOrEmpty(row.label),
      emoji: textOrEmpty(row.emoji),
      color: textOrEmpty(row.color),
      description: textOrEmpty(row.description),
      is_infrastructure: !!Number(row.is_infrastructure),
      sort_order: Number(row.sort_order) || 0,
      // Désencombrement (lot 5) : le front n'affiche ces lieux qu'une fois la carte zoomée.
      zoom_only: !!Number(row.zoom_only),
    }));

  const knownCategoryIds = new Set(categories.map((c) => c.id));
  const { map_id: _mapIdSetting, ...publicSettings } = settings;
  return {
    map: serializePlanMap(map),
    settings: {
      ...publicSettings,
      default_category_ids: settings.default_category_ids.filter((id) => knownCategoryIds.has(id)),
      hidden_category_ids: settings.hidden_category_ids,
    },
    categories,
    zones,
    markers,
  };
}

/** Réglages publics seuls (coquille : titre, message d'accueil, mode d'accès). */
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const settings = await loadPlanSettings();
    res.set('Cache-Control', `public, max-age=${PLAN_CONTENT_MAX_AGE_S}`);
    res.json(settings);
  }),
);

/** Charge publique agrégée : carte, réglages, catégories, lieux visibles sur le plan. */
router.get(
  '/content',
  asyncHandler(async (req, res) => {
    const settings = await loadPlanSettings();
    const resolved = await resolvePlanMap(req.query.map_id, settings);
    if (!resolved.map) {
      const status = resolved.error === 'Carte introuvable' ? 400 : 404;
      return res.status(status).json({ error: resolved.error });
    }
    const mapId = String(resolved.map.id);
    res.set('Cache-Control', `public, max-age=${PLAN_CONTENT_MAX_AGE_S}`);
    const cached = planContentCache.get(mapId);
    if (cached) return res.json(cached);
    const payload = await buildPlanContent(resolved.map, settings);
    planContentCache.set(mapId, payload);
    res.json(payload);
  }),
);

module.exports = router;
module.exports.planContentCache = planContentCache;
module.exports.PLAN_CONTENT_MAX_AGE_S = PLAN_CONTENT_MAX_AGE_S;
