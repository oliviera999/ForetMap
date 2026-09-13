const express = require('express');
const { queryAll } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const { getNamedMemoryTtlCache } = require('../lib/memoryTtlCache');
const { normalizeMapImageUrl } = require('../lib/mapImageUrl');
const { withMapGeoref } = require('../lib/mapGeoref');
const { authenticate } = require('../middleware/requireTeacher');
const { getAllowedMapIdsForAuth, filterMapsByAllowedIds } = require('../lib/mapAccess');

const router = express.Router();
// Le cache porte le catalogue COMPLET, jamais une réponse déjà filtrée : le périmètre
// dépend du compte et s'applique après coup, en mémoire. Servir une entrée filtrée sous
// une clé partagée fuiterait le périmètre d'un élève à toute la classe suivante.
const mapsListCache = getNamedMemoryTtlCache('maps:list:v3', { ttlMs: 20000, maxEntries: 5 });

async function loadAllMaps() {
  const cached = mapsListCache.get('all');
  if (cached) return cached;
  let rows = [];
  try {
    rows = await queryAll(
      'SELECT id, label, map_image_url, sort_order, frame_padding_px, is_active, geo_anchors_json, gps_enabled, heading_up_enabled, scale_compass_enabled FROM maps ORDER BY sort_order ASC, label ASC',
    );
  } catch (e) {
    if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
    rows = await queryAll(
      'SELECT id, label, map_image_url, sort_order, NULL AS frame_padding_px, 1 AS is_active, NULL AS geo_anchors_json, 0 AS gps_enabled, 0 AS heading_up_enabled, 1 AS scale_compass_enabled FROM maps ORDER BY sort_order ASC, label ASC',
    );
  }
  const payload = rows.map((row) =>
    withMapGeoref({
      ...row,
      map_image_url: normalizeMapImageUrl(row.id, row.map_image_url),
      is_active: !!row.is_active,
    }),
  );
  mapsListCache.set('all', payload);
  return payload;
}

// `authenticate` : session facultative (lecture publique conservée pour la visite et le
// plan), mais hydratée quand elle existe — c'est elle qui porte le périmètre.
router.get(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const maps = await loadAllMaps();
    const allowedMapIds = await getAllowedMapIdsForAuth(req.auth || null);
    res.json(filterMapsByAllowedIds(maps, allowedMapIds));
  }),
);

function invalidateMapsListCache() {
  mapsListCache.delete('all');
}

module.exports = router;
module.exports.invalidateMapsListCache = invalidateMapsListCache;
