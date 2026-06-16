'use strict';

/**
 * O7 — schémas zod de query partagés entre routes GL (coercition permissive : un schéma de
 * query ne produit JAMAIS de 400 lui-même, les 400 historiques restent décidés par les
 * handlers sur leurs conditions inchangées).
 */
const { z } = require('./validate');

/**
 * Reproduit l'ancien `raw != null ? Number(raw) : null` : absent → null, non numérique →
 * NaN replié sur null via catch. Les handlers gardent leur branche
 * `chapterId != null && Number.isFinite(chapterId)` inchangée.
 */
const glChapterIdQueryValue = z.preprocess(
  (v) => (v == null ? null : Number(v)),
  z.number().finite().nullable().catch(null),
);

/**
 * Reproduit l'ancien `parseDifficulteQuery` (copie identique dans routes/gl/qcm.js et
 * routes/gl/lore.js) : null/'' → null, Number non fini → null, Math.floor, hors [1;5] → null.
 */
const glDifficulteQueryValue = z.preprocess(
  (v) => (v == null || v === '' ? null : Math.floor(Number(v))),
  z.number().int().min(1).max(5).nullable().catch(null),
);

/**
 * Query commune de GET /api/gl/qcm/pool-preview et GET /api/gl/lore/qcm/pool-preview
 * (les nombreux filtres texte/CSV restent lus manuellement sur req.query, inchangés).
 */
const glQcmPoolPreviewQuerySchema = z.object({
  chapterId: glChapterIdQueryValue,
  difficulteMin: glDifficulteQueryValue,
  difficulteMax: glDifficulteQueryValue,
});

module.exports = {
  glChapterIdQueryValue,
  glDifficulteQueryValue,
  glQcmPoolPreviewQuerySchema,
};
