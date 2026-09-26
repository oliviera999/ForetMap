'use strict';

/**
 * Lieux (zones, repères) d'une carte visibles par un lecteur — pour la route de présence.
 *
 * La présence d'une espèce est la même pour tous (`presenceService`), mais le **nom** d'un
 * lieu réservé ne doit pas sortir du serveur. On rejoue donc, sur les seules colonnes utiles,
 * le filtre de `GET /api/zones` et `GET /api/map/markers` : surfaces (`hidden_surfaces` et
 * catégories), puis audience du lieu (rôles, groupes, héritage par catégorie).
 */

const { loadCategoriesMap, attachCategoriesToEntity } = require('../locationCategories');
const { serializeLocationRow } = require('../locationRowHelpers');
const { filterRowsForSurface } = require('../surfaceAccess');
const { filterLocationsForViewer } = require('../locationAudience');

const AUDIENCE_COLUMNS = 'id, hidden_surfaces, visible_role_slugs, visible_group_ids';

async function visibleIds(db, kind, rows, locationSurface) {
  const list = rows || [];
  if (list.length === 0) return new Set();
  const categories = await loadCategoriesMap(
    db,
    kind,
    list.map((r) => r.id),
  );
  const serialized = list.map((row) =>
    serializeLocationRow(attachCategoriesToEntity(row, categories.get(String(row.id)) || [])),
  );
  const surfaced = filterRowsForSurface(serialized, locationSurface?.filters);
  const visible = filterLocationsForViewer(surfaced, locationSurface?.viewerAuth || null, {
    publicSurface: !!locationSurface?.publicSurface,
  });
  return new Set(visible.map((row) => String(row.id)));
}

/**
 * @param {{ queryAll: Function }} db
 * @param {string} mapId
 * @param {object} locationSurface `req.locationSurface` (posé par `withLocationSurface`)
 * @returns {Promise<{ zoneIds: Set<string>, markerIds: Set<string> }>}
 */
async function loadVisiblePlaceIds(db, mapId, locationSurface) {
  const [zones, markers] = await Promise.all([
    db.queryAll(`SELECT ${AUDIENCE_COLUMNS} FROM zones WHERE map_id = ?`, [mapId]),
    db.queryAll(`SELECT ${AUDIENCE_COLUMNS} FROM map_markers WHERE map_id = ?`, [mapId]),
  ]);
  const [zoneIds, markerIds] = await Promise.all([
    visibleIds(db, 'zone', zones, locationSurface),
    visibleIds(db, 'marker', markers, locationSurface),
  ]);
  return { zoneIds, markerIds };
}

module.exports = { loadVisiblePlaceIds };
