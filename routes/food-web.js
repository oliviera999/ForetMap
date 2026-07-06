'use strict';

const express = require('express');
const { queryAll, queryOne, execute } = require('../database');
const asyncHandler = require('../lib/asyncHandler');
const { z, validate } = require('../lib/validate');
const { requirePermission } = require('../middleware/requireTeacher');
const { INTERACTION_TYPES, makeFoodWebStore } = require('../lib/shared/foodWebCore');

const router = express.Router();

/** Magasin CRUD ForetMap (plantes) bâti sur le noyau partagé. */
const foodWebStore = makeFoodWebStore(
  { queryOne, execute },
  {
    table: 'species_interactions',
    fromCol: 'from_plant_id',
    toCol: 'to_plant_id',
    refTable: 'plants',
  },
);

/** Recharge une interaction enrichie (noms/emoji) via la vue de lecture. */
async function loadEnrichedInteraction(id) {
  return queryOne(
    `SELECT id, interaction_type, from_id, from_name, from_emoji,
            to_id, to_name, to_emoji, description
       FROM v_food_web WHERE id = ? LIMIT 1`,
    [id],
  );
}

/** Mappe un résultat du noyau ({ ok, status, error }) vers une réponse HTTP. */
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

function normalizeZoneId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeMapId(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

const FOOD_WEB_SELECT = `fw.id, fw.interaction_type, fw.from_id, fw.from_name, fw.from_emoji,
                fw.from_role, fw.to_id, fw.to_name, fw.to_emoji, fw.to_role, fw.description`;

/** GET /api/food-web?mapId=&zoneId= */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const zoneId = normalizeZoneId(req.query?.zoneId);
    const mapId = normalizeMapId(req.query?.mapId);

    if (zoneId) {
      const zone = await queryOne('SELECT id FROM zones WHERE id = ? LIMIT 1', [zoneId]);
      if (!zone) return res.status(404).json({ error: 'Zone introuvable' });

      const items = await queryAll(
        `SELECT ${FOOD_WEB_SELECT}
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

    if (mapId) {
      const map = await queryOne('SELECT id FROM maps WHERE id = ? LIMIT 1', [mapId]);
      if (!map) return res.status(404).json({ error: 'Carte introuvable' });

      const items = await queryAll(
        `SELECT ${FOOD_WEB_SELECT}
           FROM v_food_web fw
          WHERE fw.from_id IN (
                  SELECT plant_id FROM v_zone_inventory WHERE map_id = ?
                )
            AND (fw.to_id IS NULL OR fw.to_id IN (
                  SELECT plant_id FROM v_zone_inventory WHERE map_id = ?
                ))
          ORDER BY fw.interaction_type ASC, fw.from_name ASC, fw.to_name ASC`,
        [mapId, mapId],
      );
      return res.json({ mapId, items });
    }

    const items = await queryAll(
      `SELECT id, interaction_type, from_id, from_name, from_emoji, from_role,
              to_id, to_name, to_emoji, to_role, description
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

/** GET /api/food-web/interaction-types — catalogue des types (pour l'éditeur). */
router.get('/interaction-types', (req, res) => {
  res.json({ types: INTERACTION_TYPES });
});

/** POST /api/food-web/interactions — créer une interaction (admin biodiversité). */
router.post(
  '/interactions',
  requirePermission('plants.manage'),
  asyncHandler(async (req, res) => {
    const result = await foodWebStore.create(req.body || {});
    return respondFromStoreResult(res, result, 201);
  }),
);

/** PUT /api/food-web/interactions/:id — modifier une interaction. */
router.put(
  '/interactions/:id',
  requirePermission('plants.manage'),
  validate({ params: interactionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await foodWebStore.update(Number(req.params.id), req.body || {});
    return respondFromStoreResult(res, result, 200);
  }),
);

/** DELETE /api/food-web/interactions/:id — supprimer une interaction. */
router.delete(
  '/interactions/:id',
  requirePermission('plants.manage'),
  validate({ params: interactionIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await foodWebStore.remove(Number(req.params.id));
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.json({ success: true });
  }),
);

module.exports = router;
