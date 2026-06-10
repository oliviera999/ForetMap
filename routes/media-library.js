const express = require('express');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { logAudit } = require('./audit');
const { queryAll } = require('../database');
const {
  saveMediaFromDataUrl,
  listMediaLibraryItems,
  executeMediaLibraryDeleteRequest,
} = require('../lib/mediaLibrary');
const { collectMediaLibraryUsage } = require('../lib/mediaLibraryUsage');

const router = express.Router();

// `limit` reste volontairement permissif : coercition douce avec repli sur le defaut si la valeur
// est absente ou non numerique — preserve le comportement historique `Number.isFinite(limit) ? limit : 300`
// (jamais de 400 sur une limite invalide ; l'UI envoie parfois une chaine vide).
const listQuerySchema = z.object({
  limit: z.coerce.number().optional().catch(undefined),
});

const uploadBodySchema = z
  .object({
    media_data: z.string({ error: 'media_data requis' }).trim().min(1, 'media_data requis'),
    original_name: z.string().trim().optional(),
    originalName: z.string().trim().optional(),
  })
  .passthrough();

router.get(
  '/',
  requirePermission('teacher.access'),
  validate({ query: listQuerySchema }),
  asyncHandler(async (req, res) => {
    const limit = req.validatedQuery?.limit;
    const items = listMediaLibraryItems(Number.isFinite(limit) ? limit : 300, { app: 'foretmap' });
    return res.json({ items });
  }),
);

router.get(
  '/usage',
  requirePermission('teacher.access'),
  asyncHandler(async (req, res) => {
    const usage = await collectMediaLibraryUsage({ queryAll }, { app: 'foretmap' });
    return res.json({ usage });
  }),
);

router.post(
  '/',
  requirePermission('teacher.access', { needsElevation: true }),
  validate({ body: uploadBodySchema }),
  asyncHandler(async (req, res) => {
    const mediaData = req.body.media_data;
    const originalName = (req.body.original_name || req.body.originalName || '').trim() || null;
    const saved = saveMediaFromDataUrl(mediaData, { originalName, app: 'foretmap' });
    await logAudit(
      'media_library_upload',
      'media',
      saved.relativePath,
      'Média uploadé depuis ForetMap',
      {
        req,
        payload: {
          media_type: saved.mediaType,
          mime_type: saved.mimeType,
          size: saved.size,
          url: saved.url,
        },
      },
    );
    return res.status(201).json(saved);
  }),
);

router.delete(
  '/',
  requirePermission('teacher.access', { needsElevation: true }),
  asyncHandler(async (req, res) => {
    const payload = executeMediaLibraryDeleteRequest(req.body || {});
    const auditTarget = payload.results?.length === 1 ? payload.results[0].relativePath : 'bulk';
    await logAudit('media_library_delete', 'media', auditTarget, 'Média supprimé depuis ForetMap', {
      req,
      payload: {
        deleted: payload.deleted,
        failed: payload.failed,
        total: payload.total,
      },
    });
    return res.json(payload);
  }),
);

module.exports = router;
// Exportes pour les tests unitaires (sans DB) : verifient le contrat de validation O7.
module.exports.listQuerySchema = listQuerySchema;
module.exports.uploadBodySchema = uploadBodySchema;
