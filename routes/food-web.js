'use strict';

const express = require('express');
const { queryAll, queryOne } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');

const router = express.Router();

const interactionIdParamsSchema = z.unknown().superRefine((p, ctx) => {
  const id = Number(p == null ? NaN : p.id);
  if (!Number.isInteger(id) || id <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Identifiant invalide', path: [] });
  }
});

function normalizeZoneId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/** GET /api/food-web?zoneId= */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const zoneId = normalizeZoneId(req.query?.zoneId);

    if (zoneId) {
      const zone = await queryOne('SELECT id FROM zones WHERE id = ? LIMIT 1', [zoneId]);
      if (!zone) return res.status(404).json({ error: 'Zone introuvable' });

      const items = await queryAll(
        `SELECT fw.id, fw.interaction_type, fw.from_id, fw.from_name, fw.from_emoji,
                fw.to_id, fw.to_name, fw.to_emoji, fw.description
           FROM v_food_web fw
          WHERE fw.from_id IN (
                  SELECT plant_id FROM v_zone_inventory WHERE zone_id = ?
                )
            AND (fw.to_id IS NULL OR fw.to_id IN (
                  SELECT plant_id FROM v_zone_inventory WHERE zone_id = ?
                ))
          ORDER BY fw.interaction_type ASC, fw.from_name ASC, fw.to_name ASC`,
        [zoneId, zoneId],
      );
      return res.json({ zoneId, items });
    }

    const items = await queryAll(
      `SELECT id, interaction_type, from_id, from_name, from_emoji,
              to_id, to_name, to_emoji, description
         FROM v_food_web
        ORDER BY interaction_type ASC, from_name ASC, to_name ASC`,
    );
    return res.json({ items });
  }),
);

/** GET /api/food-web/interactions/:id/glossary */
router.get(
  '/interactions/:id/glossary',
  validate({ params: interactionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const interactionId = Number(req.params.id);
    if (!Number.isInteger(interactionId) || interactionId <= 0) {
      return res.status(400).json({ error: 'Identifiant invalide' });
    }

    const interaction = await queryOne('SELECT id FROM species_interactions WHERE id = ? LIMIT 1', [
      interactionId,
    ]);
    if (!interaction) return res.status(404).json({ error: 'Interaction introuvable' });

    const terms = await queryAll(
      `SELECT g.glossary_code, g.terme, g.variantes, g.categorie, g.niveau, g.definition_courte
         FROM glossary_term_interactions gti
         JOIN glossary_terms g ON g.glossary_code = gti.glossary_code
        WHERE gti.interaction_id = ? AND g.statut = 'actif'
        ORDER BY g.terme ASC`,
      [interactionId],
    );

    return res.json({ interactionId, terms });
  }),
);

module.exports = router;
