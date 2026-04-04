const express = require('express');
const { queryAll } = require('../database');
const { logRouteError } = require('../lib/routeLog');
const { getNamedMemoryTtlCache } = require('../lib/memoryTtlCache');

const router = express.Router();
const mapsListCache = getNamedMemoryTtlCache('maps:list:v1', { ttlMs: 20000, maxEntries: 5 });

function normalizeMapImageUrl(mapId, mapImageUrl) {
  const raw = (mapImageUrl || '').trim();
  if (mapId === 'foret') {
    if (!raw || raw === '/maps/map-foret.png' || raw === '/maps/map-foret.svg' || raw === '/map.png') {
      return '/map.png';
    }
  }
  if (mapId === 'n3') {
    if (!raw || raw === '/maps/map-n3.png' || raw === '/maps/map-n3.svg' || raw === '/maps/plan n3.jpg') {
      return '/maps/plan%20n3.jpg';
    }
  }
  return raw || (mapId === 'n3' ? '/maps/plan%20n3.jpg' : '/map.png');
}

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
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

function invalidateMapsListCache() {
  mapsListCache.delete('all');
}

module.exports = router;
module.exports.invalidateMapsListCache = invalidateMapsListCache;
