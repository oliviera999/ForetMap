'use strict';

/**
 * `/api/gl/admin/reference-docs` — documentation de référence fonctionnelle GL
 * (`docs/reference/gl/*.md`) exposée à l'onglet Contenus → Doc de référence.
 *
 * Modèle de stockage (fichier Git = base, table `gl_reference_docs` = surcouche) :
 * cf. `lib/glReferenceDocs.js`.
 */

const express = require('express');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const asyncHandler = require('../../lib/asyncHandler');
const {
  MAX_TITLE_LENGTH,
  MAX_BODY_LENGTH,
  isValidReferenceSlug,
  getReferenceDoc,
  listReferenceDocs,
  saveReferenceDocOverride,
  deleteReferenceDocOverride,
} = require('../../lib/glReferenceDocs');

const router = express.Router();

// Même droit que le reste de l'onglet Contenus : ces documents valent demande de
// changement fonctionnel, ils ne sont ni lisibles ni éditables par les joueurs.
router.use(requireGlPermission('gl.content.manage'));

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    return res.json(await listReferenceDocs());
  }),
);

router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || '')
      .trim()
      .toLowerCase();
    if (!isValidReferenceSlug(slug)) return res.status(400).json({ error: 'Slug invalide' });
    const doc = await getReferenceDoc(slug);
    if (!doc) return res.status(404).json({ error: 'Document introuvable' });
    return res.json(doc);
  }),
);

router.put(
  '/:slug',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || '')
      .trim()
      .toLowerCase();
    if (!isValidReferenceSlug(slug)) return res.status(400).json({ error: 'Slug invalide' });
    // Création interdite : on n'édite que des documents qui existent déjà (fichier ou surcouche).
    const current = await getReferenceDoc(slug);
    if (!current) return res.status(404).json({ error: 'Document introuvable' });

    const title = String(req.body?.title ?? '').trim();
    if (!title) return res.status(400).json({ error: 'Titre requis' });
    if (title.length > MAX_TITLE_LENGTH) {
      return res
        .status(400)
        .json({ error: `Titre trop long (max ${MAX_TITLE_LENGTH} caractères)` });
    }
    const bodyMarkdown = String(req.body?.bodyMarkdown ?? '');
    if (bodyMarkdown.length > MAX_BODY_LENGTH) {
      return res
        .status(400)
        .json({ error: `Document trop long (max ${MAX_BODY_LENGTH} caractères)` });
    }

    const saved = await saveReferenceDocOverride(
      slug,
      { title, bodyMarkdown },
      req.glAuth?.userId ?? null,
    );
    return res.json(saved);
  }),
);

router.post(
  '/:slug/reset',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || '')
      .trim()
      .toLowerCase();
    if (!isValidReferenceSlug(slug)) return res.status(400).json({ error: 'Slug invalide' });
    const restored = await deleteReferenceDocOverride(slug);
    // Surcouche supprimée alors que le fichier n'est pas déployé : plus rien à servir.
    if (!restored) return res.status(404).json({ error: 'Document introuvable' });
    return res.json(restored);
  }),
);

module.exports = router;
