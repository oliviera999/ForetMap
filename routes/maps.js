const express = require('express');
const { queryAll } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const { getNamedMemoryTtlCache } = require('../lib/memoryTtlCache');
const { normalizeMapImageUrl } = require('../lib/mapImageUrl');
const { withMapGeoref } = require('../lib/mapGeoref');

const router = express.Router();
const mapsListCache = getNamedMemoryTtlCache('maps:list:v1', { ttlMs: 20000, maxEntries: 5 });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cached = mapsListCache.get('all');
    if (cached) return res.json(cached);
    let rows = [];
    try {
      rows = await queryAll(
        'SELECT id, label, map_image_url, sort_order, frame_padding_px, is_active, geo_anchors_json, gps_enabled FROM maps ORDER BY sort_order ASC, label ASC',
      );
    } catch (e) {
      if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
      rows = await queryAll(
        'SELECT id, label, map_image_url, sort_order, NULL AS frame_padding_px, 1 AS is_active, NULL AS geo_anchors_json, 0 AS gps_enabled FROM maps ORDER BY sort_order ASC, label ASC',
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
    res.json(payload);
  }),
);

function invalidateMapsListCache() {
  mapsListCache.delete('all');
}

module.exports = router;
module.exports.invalidateMapsListCache = invalidateMapsListCache;
