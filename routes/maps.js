const express = require('express');
const { queryAll } = require('../database');
const { logRouteError, respondInternalError } = require('../lib/routeLog');
const { getNamedMemoryTtlCache } = require('../lib/memoryTtlCache');
const { normalizeMapImageUrl } = require('../lib/mapImageUrl');

const router = express.Router();
const mapsListCache = getNamedMemoryTtlCache('maps:list:v1', { ttlMs: 20000, maxEntries: 5 });

router.get('/', async (req, res) => {
  try {
    const cached = mapsListCache.get('all');
    if (cached) return res.json(cached);
    let rows = [];
    try {
      rows = await queryAll(
        'SELECT id, label, map_image_url, sort_order, frame_padding_px, is_active FROM maps ORDER BY sort_order ASC, label ASC'
      );
    } catch (e) {
      if (!(e && (e.errno === 1054 || e.code === 'ER_BAD_FIELD_ERROR'))) throw e;
      rows = await queryAll(
        'SELECT id, label, map_image_url, sort_order, NULL AS frame_padding_px, 1 AS is_active FROM maps ORDER BY sort_order ASC, label ASC'
      );
    }
    const payload = rows.map((row) => ({
      ...row,
      map_image_url: normalizeMapImageUrl(row.id, row.map_image_url),
      is_active: !!row.is_active,
    }));
    mapsListCache.set('all', payload);
    res.json(payload);
  } catch (e) {
    respondInternalError(res, req, e);
  }
});

function invalidateMapsListCache() {
  mapsListCache.delete('all');
}

module.exports = router;
module.exports.invalidateMapsListCache = invalidateMapsListCache;
