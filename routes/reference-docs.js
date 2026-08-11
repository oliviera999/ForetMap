'use strict';

/**
 * `/api/admin/reference-docs` — documentation de référence fonctionnelle ForetMap
 * (`docs/reference/foretmap/*.md`), en **lecture seule**.
 *
 * Pendant du panneau GL « Contenus → Doc de référence », sans l'étage d'édition :
 * les fichiers versionnés dans Git font foi. Amender un document reste un acte de
 * développement — cf. `lib/foretmapReferenceDocs.js`.
 */

const express = require('express');
const { requirePermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const { listReferenceDocs, getReferenceDoc } = require('../lib/foretmapReferenceDocs');

const router = express.Router();

// Documentation destinée aux professeurs et administrateurs : même droit de lecture
// que les réglages d'administration. Non exposée aux élèves.
router.use(requirePermission('admin.settings.read'));

/** GET /api/admin/reference-docs → sommaire (slug, titre, résumé, date de fichier). */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ docs: listReferenceDocs() });
  }),
);

/** GET /api/admin/reference-docs/:slug → document complet (Markdown brut). */
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const doc = getReferenceDoc(req.params.slug);
    if (!doc) return res.status(404).json({ error: 'Document introuvable' });
    res.json({ doc });
  }),
);

module.exports = router;
