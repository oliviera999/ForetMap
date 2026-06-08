const express = require('express');
const { requirePermission } = require('../middleware/requireTeacher');
const { respondInternalError } = require('../lib/routeLog');
const { logAudit } = require('./audit');
const { queryAll } = require('../database');
const {
  saveMediaFromDataUrl,
  listMediaLibraryItems,
  executeMediaLibraryDeleteRequest,
} = require('../lib/mediaLibrary');
const { collectMediaLibraryUsage } = require('../lib/mediaLibraryUsage');

const router = express.Router();

router.get('/', requirePermission('teacher.access'), async (req, res) => {
  try {
    const limitRaw = Number(req.query?.limit);
    const items = listMediaLibraryItems(Number.isFinite(limitRaw) ? limitRaw : 300, { app: 'foretmap' });
    return res.json({ items });
  } catch (e) {
    return respondInternalError(res, req, e);
  }
});

router.get('/usage', requirePermission('teacher.access'), async (req, res) => {
  try {
    const usage = await collectMediaLibraryUsage({ queryAll }, { app: 'foretmap' });
    return res.json({ usage });
  } catch (e) {
    return respondInternalError(res, req, e);
  }
});

router.post('/', requirePermission('teacher.access', { needsElevation: true }), async (req, res) => {
  try {
    const mediaData = String(req.body?.media_data || '').trim();
    if (!mediaData) return res.status(400).json({ error: 'media_data requis' });
    const originalName = String(req.body?.original_name || req.body?.originalName || '').trim() || null;
    const saved = saveMediaFromDataUrl(mediaData, { originalName, app: 'foretmap' });
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
    const payload = executeMediaLibraryDeleteRequest(req.body || {});
    const auditTarget = payload.results?.length === 1
      ? payload.results[0].relativePath
      : 'bulk';
    await logAudit('media_library_delete', 'media', auditTarget, 'Média supprimé depuis ForetMap', {
      req,
      payload: {
        deleted: payload.deleted,
        failed: payload.failed,
        total: payload.total,
      },
    });
    return res.json(payload);
  } catch (e) {
    if (Number.isFinite(e?.status)) {
      return res.status(e.status).json({ error: e.message || 'Suppression média refusée' });
    }
    return respondInternalError(res, req, e);
  }
});

module.exports = router;
