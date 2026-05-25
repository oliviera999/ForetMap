const express = require('express');
const { requirePermission } = require('../middleware/requireTeacher');
const { respondInternalError } = require('../lib/routeLog');
const { logAudit } = require('./audit');
const {
  saveMediaFromDataUrl,
  listMediaLibraryItems,
  deleteMediaLibraryItem,
} = require('../lib/mediaLibrary');

const router = express.Router();

router.get('/', requirePermission('teacher.access'), async (req, res) => {
  try {
    const limitRaw = Number(req.query?.limit);
    const items = listMediaLibraryItems(Number.isFinite(limitRaw) ? limitRaw : 300);
    return res.json({ items });
  } catch (e) {
    return respondInternalError(res, req, e);
  }
});

router.post('/', requirePermission('teacher.access', { needsElevation: true }), async (req, res) => {
  try {
    const mediaData = String(req.body?.media_data || '').trim();
    if (!mediaData) return res.status(400).json({ error: 'media_data requis' });
    const saved = saveMediaFromDataUrl(mediaData);
    await logAudit('media_library_upload', 'media', saved.relativePath, 'Média uploadé depuis ForetMap', {
      req,
      payload: {
        media_type: saved.mediaType,
        mime_type: saved.mimeType,
        size: saved.size,
        url: saved.url,
      },
    });
    return res.status(201).json(saved);
  } catch (e) {
    if (Number.isFinite(e?.status)) {
      return res.status(e.status).json({ error: e.message || 'Upload média refusé' });
    }
    return respondInternalError(res, req, e);
  }
});

router.delete('/', requirePermission('teacher.access', { needsElevation: true }), async (req, res) => {
  try {
    const relativePath = String(req.body?.relative_path || '').trim();
    if (!relativePath) return res.status(400).json({ error: 'relative_path requis' });
    deleteMediaLibraryItem(relativePath);
    await logAudit('media_library_delete', 'media', relativePath, 'Média supprimé depuis ForetMap', { req });
    return res.json({ ok: true });
  } catch (e) {
    if (Number.isFinite(e?.status)) {
      return res.status(e.status).json({ error: e.message || 'Suppression média refusée' });
    }
    return respondInternalError(res, req, e);
  }
});

module.exports = router;
