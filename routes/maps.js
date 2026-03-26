const express = require('express');
const { queryAll } = require('../database');
const { logRouteError } = require('../lib/routeLog');

const router = express.Router();

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
    res.json(rows.map((row) => ({
      ...row,
      map_image_url: normalizeMapImageUrl(row.id, row.map_image_url),
      is_active: !!row.is_active,
    })));
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
