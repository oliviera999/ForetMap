'use strict';

const express = require('express');
const { queryAll, queryOne, execute } = require('../../database');
const asyncHandler = require('../../lib/asyncHandler');
const { z, validate } = require('../../lib/validate');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const { INTERACTION_TYPES, makeFoodWebStore } = require('../../lib/shared/foodWebCore');

const router = express.Router();

const foodWebStore = makeFoodWebStore(
  { queryOne, execute },
  {
    table: 'gl_species_interactions',
    fromCol: 'from_species_id',
    toCol: 'to_species_id',
    refTable: 'gl_species',
  },
);

function trophicRoleSql(alias) {
  return `CASE
    WHEN LOWER(COALESCE(${alias}.role_ecologique, '')) LIKE '%décompos%'
      OR LOWER(COALESCE(${alias}.role_ecologique, '')) LIKE '%decompos%' THEN 'decomposeur'
    WHEN ${alias}.type = 'flore' THEN 'producteur'
    ELSE 'consommateur'
  END`;
}

const FOOD_WEB_SELECT = `si.id, si.interaction_type,
                sf.id AS from_id, sf.nom_commun AS from_name, NULL AS from_emoji,
                ${trophicRoleSql('sf')} AS from_role,
                st.id AS to_id, st.nom_commun AS to_name, NULL AS to_emoji,
                ${trophicRoleSql('st')} AS to_role,
                si.description`;

function normalizeBiomeSlug(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

async function loadEnrichedInteraction(id) {
  return queryOne(
    `SELECT ${FOOD_WEB_SELECT}
       FROM gl_species_interactions si
       JOIN gl_species sf ON sf.id = si.from_species_id
       LEFT JOIN gl_species st ON st.id = si.to_species_id
      WHERE si.id = ?
      LIMIT 1`,
    [id],
  );
}

async function respondFromStoreResult(res, result, successStatus) {
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  const enriched = result.row ? await loadEnrichedInteraction(result.row.id) : null;
  return res.status(successStatus).json({ interaction: enriched || result.row });
}

const interactionIdParamsSchema = z.unknown().superRefine((p, ctx) => {
  const id = Number(p == null ? NaN : p.id);
  if (!Number.isInteger(id) || id <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Identifiant invalide', path: [] });
  }
});

/** GET /api/gl/food-web?biomeSlug= — lecture par jointure (pas de vue v_gl_food_web). */
router.get(
  '/food-web',
  requireGlPermission('gl.read'),
  asyncHandler(async (req, res) => {
    const biomeSlug = normalizeBiomeSlug(req.query?.biomeSlug);
    if (biomeSlug) {
      const biome = await queryOne('SELECT slug FROM gl_biomes WHERE slug = ? LIMIT 1', [
        biomeSlug,
      ]);
      if (!biome) return res.status(404).json({ error: 'Biome introuvable' });
      const items = await queryAll(
        `SELECT ${FOOD_WEB_SELECT}
           FROM gl_species_interactions si
           JOIN gl_species sf ON sf.id = si.from_species_id
           LEFT JOIN gl_species st ON st.id = si.to_species_id
          WHERE sf.biome_slug = ? OR st.biome_slug = ?
          ORDER BY si.interaction_type ASC, sf.nom_commun ASC, st.nom_commun ASC`,
        [biomeSlug, biomeSlug],
      );
      return res.json({ biomeSlug, items });
    }

    const items = await queryAll(
      `SELECT ${FOOD_WEB_SELECT}
         FROM gl_species_interactions si
         JOIN gl_species sf ON sf.id = si.from_species_id
         LEFT JOIN gl_species st ON st.id = si.to_species_id
        ORDER BY si.interaction_type ASC, sf.nom_commun ASC, st.nom_commun ASC`,
    );
    return res.json({ items });
  }),
);

router.get('/food-web/interaction-types', requireGlPermission('gl.read'), (_req, res) => {
  res.json({ types: INTERACTION_TYPES });
});

router.post(
  '/food-web/interactions',
  requireGlPermission('gl.content.manage'),
  asyncHandler(async (req, res) => {
    const result = await foodWebStore.create(req.body || {});
    return respondFromStoreResult(res, result, 201);
  }),
);

router.put(
  '/food-web/interactions/:id',
  requireGlPermission('gl.content.manage'),
  validate({ params: interactionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await foodWebStore.update(Number(req.params.id), req.body || {});
    return respondFromStoreResult(res, result, 200);
  }),
);

router.delete(
  '/food-web/interactions/:id',
  requireGlPermission('gl.content.manage'),
  validate({ params: interactionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await foodWebStore.remove(Number(req.params.id));
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ success: true });
  }),
);

module.exports = router;
