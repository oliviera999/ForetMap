const express = require('express');
const { queryAll } = require('../database');
const { logRouteError } = require('../lib/routeLog');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const rows = await queryAll(
      'SELECT id, label, map_image_url, sort_order FROM maps ORDER BY sort_order ASC, label ASC'
    );
    res.json(rows);
  } catch (e) {
    logRouteError(e, req);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
