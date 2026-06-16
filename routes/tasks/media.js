const express = require('express');
const { queryOne } = require('../../database');
const { getAbsolutePath } = require('../../lib/uploads');
const asyncHandler = require('../../lib/asyncHandler');

const router = express.Router();

router.get(
  '/:id/image',
  asyncHandler(async (req, res) => {
    const row = await queryOne('SELECT image_path FROM tasks WHERE id = ?', [req.params.id]);
    if (!row?.image_path) return res.status(404).json({ error: 'Aucune image' });
    const absolutePath = getAbsolutePath(row.image_path);
    return res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier introuvable' });
    });
  }),
);

module.exports = router;
