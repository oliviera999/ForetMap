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
const { requireAuth, hasPermission } = require('../middleware/requireTeacher');
const asyncHandler = require('../lib/asyncHandler');
const {
  listReferenceDocs,
  getReferenceDoc,
  referenceDocsScopeFor,
} = require('../lib/foretmapReferenceDocs');

const router = express.Router();

// Tout le sommaire pour `admin.settings.read` ; le seul guide du prof pour
// `reference_docs.teacher_guide.read`. Non exposée aux élèves.
router.use(requireAuth, (req, res, next) => {
  const scope = referenceDocsScopeFor((key) => hasPermission(req.auth, key));
  if (!scope) return res.status(403).json({ error: 'Permission insuffisante' });
  req.referenceDocsScope = scope;
  return next();
});

/** GET /api/admin/reference-docs → sommaire (slug, titre, résumé, date de fichier). */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ docs: listReferenceDocs({ scope: req.referenceDocsScope }) });
  }),
);

/** GET /api/admin/reference-docs/:slug → document complet (Markdown brut). */
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const doc = getReferenceDoc(req.params.slug, { scope: req.referenceDocsScope });
    if (!doc) return res.status(404).json({ error: 'Document introuvable' });
    res.json({ doc });
  }),
);

module.exports = router;
