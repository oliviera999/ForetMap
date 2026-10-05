'use strict';

/**
 * Service « cartes » du terrain : catalogue, création, modification, image de fond et
 * calage GPS des cartes (`maps`).
 *
 * Le CRUD des cartes vivait dans `routes/settings.js` (l. 406-551 à l'audit du 25/09/2026,
 * § 3.1 : « le CRUD des cartes vit dans `routes/settings.js`, qui regroupe 26 endpoints
 * hétérogènes »). Il est sorti ici à l'étape B4 de la piste B ; les routes gardent leurs URL
 * (`/api/settings/admin/maps…`, montées par `routes/maps.js`) et leurs réponses au caractère
 * près (`tests/terrain-maps-admin-snapshot.test.js`).
 *
 * Contrat : aucune dépendance à Express. Les opérations rendent `{ status, body }` et, en
 * cas d'écriture, `audit` (action, cible, libellé, charge) que le routeur journalise.
 */

const path = require('path');
const { queryAll, queryOne, execute } = require('../../database');
const { getNamedMemoryTtlCache } = require('../memoryTtlCache');
const { normalizeMapImageUrl } = require('../mapImageUrl');
const {
  withMapGeoref,
  isValidAnchors,
  sanitizeAnchors,
  parseAnchors,
  assessAnchorsGeoPlausibility,
} = require('../mapGeoref');
const { saveBase64ToDisk, deleteFile } = require('../uploads');
const { normalizePedagoLevel } = require('../biodivPedagoLevel');
const {
  CATEGORY_IDS_SETTING_MAX_LENGTH,
  parseCategoryIdsSetting,
} = require('../categoryIdsSetting');

/** Identifiant de carte : lettres minuscules, chiffres, `_` et `-` (VARCHAR(32) de `maps`). */
const MAP_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,30}$/;

const MAP_SELECT_FULL =
  'id, label, map_image_url, sort_order, frame_padding_px, is_active, geo_anchors_json, gps_enabled, heading_up_enabled, scale_compass_enabled, pedago_level, default_category_ids, hidden_category_ids';
const MAP_SELECT_LEGACY =
  'id, label, map_image_url, sort_order, NULL AS frame_padding_px, 1 AS is_active, NULL AS geo_anchors_json, 0 AS gps_enabled, 0 AS heading_up_enabled, 1 AS scale_compass_enabled, NULL AS pedago_level, NULL AS default_category_ids, NULL AS hidden_category_ids';

/** Colonne absente d'un schéma ancien (repli sur la sélection « legacy »). */
function isMissingColumnError(e) {
  return !!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'));
}

// ── Catégories par carte (migration 318) ────────────────────────────────────────────────

/**
 * Portée des catégories actives visibles sur la carte de travail : id → `map_id` (`null` =
 * globale). Sert à écarter, à la lecture, les ids d'une catégorie supprimée, désactivée,
 * absente de la surface `map` ou propre à une autre carte — le réglage repris du réglage
 * global en contient forcément.
 * @returns {Promise<Map<string, string|null>>}
 */
async function loadMapCategoryScopes() {
  const rows = await queryAll(
    "SELECT id, map_id FROM location_categories WHERE is_active = 1 AND FIND_IN_SET('map', surfaces) > 0",
  );
  return new Map(rows.map((r) => [String(r.id), r.map_id == null ? null : String(r.map_id)]));
}

function idsForMap(raw, mapId, scopes) {
  const seen = new Set();
  for (const id of parseCategoryIdsSetting(raw)) {
    if (!scopes.has(id)) continue;
    const scope = scopes.get(id);
    if (scope === null || scope === String(mapId)) seen.add(id);
  }
  return [...seen];
}

/**
 * Pose `default_category_ids` / `hidden_category_ids` (tableaux) sur des cartes sérialisées.
 * Une catégorie cachée n'est jamais cochée d'office.
 */
function withMapCategoryIds(map, scopes) {
  const hidden = idsForMap(map.hidden_category_ids, map.id, scopes);
  const hiddenSet = new Set(hidden);
  return {
    ...map,
    default_category_ids: idsForMap(map.default_category_ids, map.id, scopes).filter(
      (id) => !hiddenSet.has(id),
    ),
    hidden_category_ids: hidden,
  };
}

/**
 * Entrée d'écriture (chaîne `;`-séparée ou tableau) → chaîne normalisée, `undefined` si le
 * champ est absent, `{ error }` si la liste dépasse la longueur admise.
 */
function readCategoryIdsInput(raw) {
  if (raw === undefined) return { value: undefined };
  const list = Array.isArray(raw) ? raw.map((v) => String(v ?? '')) : parseCategoryIdsSetting(raw);
  const value = [...new Set(list.map((s) => s.trim()).filter(Boolean))].join(';');
  if (value.length > CATEGORY_IDS_SETTING_MAX_LENGTH) {
    return { error: 'Liste de catégories trop longue' };
  }
  return { value };
}

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

// ── Catalogue public (`GET /api/maps`) ──────────────────────────────────────────────────

// Le cache porte le catalogue COMPLET, jamais une réponse déjà filtrée : le périmètre
// dépend du compte et s'applique après coup, en mémoire. Servir une entrée filtrée sous
// une clé partagée fuiterait le périmètre d'un élève à toute la classe suivante.
const mapsListCache = getNamedMemoryTtlCache('maps:list:v4', { ttlMs: 20000, maxEntries: 5 });

async function loadAllMaps() {
  const cached = mapsListCache.get('all');
  if (cached) return cached;
  let rows = [];
  try {
    rows = await queryAll(`SELECT ${MAP_SELECT_FULL} FROM maps ORDER BY sort_order ASC, label ASC`);
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    rows = await queryAll(
      `SELECT ${MAP_SELECT_LEGACY} FROM maps ORDER BY sort_order ASC, label ASC`,
    );
  }
  const scopes = await loadMapCategoryScopes();
  const payload = rows.map((row) =>
    withMapGeoref(
      withMapCategoryIds(
        {
          ...row,
          map_image_url: normalizeMapImageUrl(row.id, row.map_image_url),
          is_active: !!row.is_active,
          pedago_level: row.pedago_level || null,
        },
        scopes,
      ),
    ),
  );
  mapsListCache.set('all', payload);
  return payload;
}

function invalidateMapsListCache() {
  mapsListCache.delete('all');
}

// ── Lecture côté administration ─────────────────────────────────────────────────────────

async function getMapById(id) {
  try {
    return await queryOne(`SELECT ${MAP_SELECT_FULL} FROM maps WHERE id = ? LIMIT 1`, [id]);
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    return queryOne(`SELECT ${MAP_SELECT_LEGACY} FROM maps WHERE id = ? LIMIT 1`, [id]);
  }
}

async function listMaps() {
  try {
    return await queryAll(`SELECT ${MAP_SELECT_FULL} FROM maps ORDER BY sort_order ASC, label ASC`);
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    return queryAll(`SELECT ${MAP_SELECT_LEGACY} FROM maps ORDER BY sort_order ASC, label ASC`);
  }
}

/**
 * Sérialise une ligne `maps` pour l'API (URL image normalisée, booléens, géoréférencement,
 * catégories par carte ramenées à celles qui la concernent).
 * @param {object} row
 * @param {Map<string, string|null>} scopes `loadMapCategoryScopes()`
 */
function serializeMap(row, scopes) {
  return withMapGeoref(
    withMapCategoryIds(
      {
        ...row,
        map_image_url: normalizeMapImageUrl(row.id, row.map_image_url),
        is_active: !!row.is_active,
        pedago_level: normalizePedagoLevel(row.pedago_level),
      },
      scopes,
    ),
  );
}

async function serializeOneMap(row) {
  return serializeMap(row, await loadMapCategoryScopes());
}

/** Cartes sérialisées pour l'écran des réglages (`GET /api/settings/admin`). */
async function listMapsForAdmin() {
  const [rows, scopes] = await Promise.all([listMaps(), loadMapCategoryScopes()]);
  return rows.map((row) => serializeMap(row, scopes));
}

// ── Écritures ───────────────────────────────────────────────────────────────────────────

function fail(status, error) {
  return { status, body: { error } };
}

async function createMap(body = {}) {
  const id = String(body.id || '')
    .trim()
    .toLowerCase();
  const label = String(body.label || '').trim();
  if (!id || !MAP_SLUG_RE.test(id)) {
    return fail(
      400,
      'Identifiant carte invalide (minuscules, chiffres, tirets ; 1 à 31 caractères)',
    );
  }
  if (id === 'both') return fail(400, 'Identifiant réservé (both)');
  const dup = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [id]);
  if (dup) return fail(409, 'Une carte avec cet identifiant existe déjà');
  if (!label) return fail(400, 'Label requis');
  const sortOrderRaw = parseInt(body.sort_order, 10);
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.max(0, sortOrderRaw) : 999;
  const mapImageUrl = normalizeMapImageUrl(id, String(body.map_image_url || '').trim());
  const isActive = parseBoolean(body.is_active, true);
  try {
    await execute(
      `INSERT INTO maps (id, label, map_image_url, sort_order, frame_padding_px, is_active)
       VALUES (?, ?, ?, ?, NULL, ?)`,
      [id, label, mapImageUrl, sortOrder, isActive ? 1 : 0],
    );
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    await execute('INSERT INTO maps (id, label, map_image_url, sort_order) VALUES (?, ?, ?, ?)', [
      id,
      label,
      mapImageUrl,
      sortOrder,
    ]);
  }
  invalidateMapsListCache();
  const created = await getMapById(id);
  return {
    status: 201,
    body: await serializeOneMap(created),
    audit: {
      action: 'settings_map_create',
      targetId: id,
      label: 'Carte créée',
      payload: { id, label, map_image_url: mapImageUrl, sort_order: sortOrder },
    },
  };
}

async function updateMap(mapId, body = {}) {
  const map = await getMapById(mapId);
  if (!map) return fail(404, 'Carte introuvable');
  const label = String(body.label ?? map.label).trim();
  const mapImageUrl = normalizeMapImageUrl(
    map.id,
    String(body.map_image_url ?? map.map_image_url).trim(),
  );
  const sortOrderRaw = parseInt(body.sort_order, 10);
  const sortOrder = Number.isFinite(sortOrderRaw) ? Math.max(0, sortOrderRaw) : map.sort_order;
  const framePaddingRaw = body.frame_padding_px;
  const framePadding =
    framePaddingRaw === null || framePaddingRaw === ''
      ? null
      : (() => {
          const n = parseInt(framePaddingRaw, 10);
          if (!Number.isFinite(n)) return map.frame_padding_px;
          return Math.min(Math.max(n, 0), 32);
        })();
  const isActive = parseBoolean(body.is_active, !!map.is_active);
  const pedagoLevel =
    body.pedago_level !== undefined
      ? normalizePedagoLevel(body.pedago_level)
      : normalizePedagoLevel(map.pedago_level);
  if (
    body.pedago_level !== undefined &&
    body.pedago_level != null &&
    String(body.pedago_level).trim() !== '' &&
    pedagoLevel == null
  ) {
    return fail(400, 'pedago_level invalide (college|lycee|universite)');
  }
  if (!label) return fail(400, 'Label requis');
  const defaultIdsInput = readCategoryIdsInput(body.default_category_ids);
  if (defaultIdsInput.error) return fail(400, defaultIdsInput.error);
  const hiddenIdsInput = readCategoryIdsInput(body.hidden_category_ids);
  if (hiddenIdsInput.error) return fail(400, hiddenIdsInput.error);
  const defaultCategoryIds =
    defaultIdsInput.value === undefined ? map.default_category_ids : defaultIdsInput.value;
  const hiddenCategoryIds =
    hiddenIdsInput.value === undefined ? map.hidden_category_ids : hiddenIdsInput.value;
  try {
    await execute(
      `UPDATE maps
          SET label = ?, map_image_url = ?, sort_order = ?, frame_padding_px = ?, is_active = ?,
              pedago_level = ?, default_category_ids = ?, hidden_category_ids = ?
        WHERE id = ?`,
      [
        label,
        mapImageUrl,
        sortOrder,
        framePadding,
        isActive ? 1 : 0,
        pedagoLevel,
        defaultCategoryIds,
        hiddenCategoryIds,
        map.id,
      ],
    );
  } catch (e) {
    if (!isMissingColumnError(e)) throw e;
    await execute('UPDATE maps SET label = ?, map_image_url = ?, sort_order = ? WHERE id = ?', [
      label,
      mapImageUrl,
      sortOrder,
      map.id,
    ]);
  }
  const updated = await getMapById(map.id);
  invalidateMapsListCache();
  return {
    status: 200,
    body: await serializeOneMap(updated),
    audit: {
      action: 'settings_map_update',
      targetId: map.id,
      label: 'Carte mise à jour',
      payload: {
        label: updated.label,
        map_image_url: updated.map_image_url,
        sort_order: updated.sort_order,
        frame_padding_px: updated.frame_padding_px,
        is_active: !!updated.is_active,
        pedago_level: normalizePedagoLevel(updated.pedago_level),
        default_category_ids: updated.default_category_ids || '',
        hidden_category_ids: updated.hidden_category_ids || '',
      },
    },
  };
}

/** Image de fond : fichier écrit sous `uploads/maps/`, l'ancien téléversement effacé. */
async function updateMapImage(mapId, body = {}) {
  const map = await getMapById(mapId);
  if (!map) return fail(404, 'Carte introuvable');
  const imageData = String(body.image_data || '').trim();
  if (!imageData) return fail(400, 'image_data requis');
  const filename = `${map.id}-${Date.now()}.jpg`;
  const relativePath = path.join('maps', filename).replace(/\\/g, '/');
  await saveBase64ToDisk(relativePath, imageData);
  const nextUrl = `/uploads/${relativePath}`;
  const oldUrl = String(map.map_image_url || '').trim();
  await execute('UPDATE maps SET map_image_url = ? WHERE id = ?', [nextUrl, map.id]);
  if (oldUrl.startsWith('/uploads/maps/')) {
    deleteFile(oldUrl.replace('/uploads/', ''));
  }
  invalidateMapsListCache();
  const updated = await getMapById(map.id);
  return {
    status: 200,
    body: await serializeOneMap(updated),
    audit: {
      action: 'settings_map_image_update',
      targetId: map.id,
      label: 'Image de plan changée',
      payload: { map_id: map.id, map_image_url: nextUrl },
    },
  };
}

/**
 * Calage GPS : trois ancres (xp/yp en %, lat/lng) cohérentes avec le plan. `anchors` omis
 * conserve le calage ; `[]` ou `null` l'efface. Le suivi GPS et l'orientation boussole
 * exigent un calage valide.
 */
async function updateMapGeoref(mapId, body = {}) {
  const map = await getMapById(mapId);
  if (!map) return fail(404, 'Carte introuvable');

  const hasAnchorsField = Object.prototype.hasOwnProperty.call(body, 'anchors');
  const rawAnchors = body.anchors;
  let anchorsJson = map.geo_anchors_json || null;
  let hasValidAnchors = !!parseAnchors(anchorsJson);

  if (hasAnchorsField) {
    const hasAnchors =
      rawAnchors != null && !(Array.isArray(rawAnchors) && rawAnchors.length === 0);
    anchorsJson = null;
    hasValidAnchors = false;
    if (hasAnchors) {
      if (!isValidAnchors(rawAnchors)) {
        return fail(
          400,
          'Calage GPS invalide : 3 points distincts requis (xp/yp en %, lat/lng valides).',
        );
      }
      const sanitized = sanitizeAnchors(rawAnchors);
      const plausibility = assessAnchorsGeoPlausibility(sanitized);
      if (!plausibility.ok) {
        return fail(
          400,
          plausibility.reason === 'geo_collinear'
            ? 'Calage GPS incohérent : les trois points GPS sont alignés ou confondus — choisissez des repères formant un vrai triangle sur le terrain.'
            : `Calage GPS incohérent : les distances GPS ne correspondent pas aux distances sur le plan (échelles incompatibles, facteur ${Math.round(plausibility.scaleRatio)}). Vérifiez les coordonnées de chaque point.`,
        );
      }
      anchorsJson = JSON.stringify(sanitized);
      hasValidAnchors = true;
    }
  }
  const gpsEnabled = parseBoolean(body.gps_enabled, !!map.gps_enabled) && hasValidAnchors;
  const headingUpEnabled =
    gpsEnabled && parseBoolean(body.heading_up_enabled, !!map.heading_up_enabled);
  const scaleCompassDefault =
    map.scale_compass_enabled == null ? true : !!Number(map.scale_compass_enabled);
  const scaleCompassEnabled =
    hasValidAnchors && parseBoolean(body.scale_compass_enabled, scaleCompassDefault);

  await execute(
    'UPDATE maps SET geo_anchors_json = ?, gps_enabled = ?, heading_up_enabled = ?, scale_compass_enabled = ? WHERE id = ?',
    [
      anchorsJson,
      gpsEnabled ? 1 : 0,
      headingUpEnabled ? 1 : 0,
      scaleCompassEnabled ? 1 : 0,
      map.id,
    ],
  );
  invalidateMapsListCache();
  const updated = await getMapById(map.id);
  return {
    status: 200,
    body: await serializeOneMap(updated),
    audit: {
      action: 'settings_map_georef',
      targetId: map.id,
      label: 'Calage GPS du plan mis à jour',
      payload: {
        map_id: map.id,
        gps_enabled: gpsEnabled,
        heading_up_enabled: headingUpEnabled,
        scale_compass_enabled: scaleCompassEnabled,
        has_anchors: !!anchorsJson,
      },
    },
  };
}

module.exports = {
  MAP_SLUG_RE,
  parseBoolean,
  loadAllMaps,
  invalidateMapsListCache,
  getMapById,
  listMaps,
  listMapsForAdmin,
  serializeMap,
  createMap,
  updateMap,
  updateMapImage,
  updateMapGeoref,
};
