'use strict';

/**
 * Le Seuil — niveau du voyageur et grimoire personnel (joueurs G&L).
 *
 * GET  /api/gl/voyageur/me                       → niveau, regards, expédition, grimoire
 * GET  /api/gl/voyageur/spells/:code/targets     → cibles possibles d'un sortilège
 * POST /api/gl/voyageur/spells/:code/cast        → lance le sortilège sur `{ target }`
 *
 * Réservé aux joueurs (`gl_player`), module `modules.voyageur_enabled`. Aucun geste du MJ :
 * chaque effet est borné et appliqué par le serveur (`lib/glVoyageur.js`).
 */

const express = require('express');
const { queryAll, queryOne, withTransaction } = require('../../database');
const { requireGlAuth } = require('../../middleware/requireGlAuth');
const { requireGlPlayer } = require('../../middleware/requireGlMarket');
const { getGlModulesSettings } = require('../../lib/glSettings');
const { buildVoyageurView, listSpellTargets, castVoyageurSpell } = require('../../lib/glVoyageur');
const { z, validate } = require('../../lib/validate');
const asyncHandler = require('../../lib/asyncHandler');

const router = express.Router();
const db = { queryAll, queryOne };

const spellParamsSchema = z.object({ code: z.string().trim().min(1).max(32) });
const castBodySchema = z.object({ target: z.string().trim().min(1).max(160) });

function requireVoyageurModule(req, res, next) {
  getGlModulesSettings()
    .then((modules) => {
      if (!modules.voyageurEnabled) {
        return res.status(503).json({ error: 'Le Seuil est désactivé' });
      }
      return next();
    })
    .catch(next);
}

function sendVoyageurError(err, res) {
  if (err && err.status && err.code) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  throw err;
}

router.use(requireGlAuth);
router.use(requireVoyageurModule);
router.use(requireGlPlayer);

router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const view = await buildVoyageurView(db, Number(req.glAuth.userId));
    return res.json(view);
  }),
);

router.get(
  '/spells/:code/targets',
  validate({ params: spellParamsSchema }),
  asyncHandler(async (req, res) => {
    try {
      const out = await listSpellTargets(db, Number(req.glAuth.userId), req.validatedParams.code);
      return res.json(out);
    } catch (err) {
      return sendVoyageurError(err, res);
    }
  }),
);

router.post(
  '/spells/:code/cast',
  validate({ params: spellParamsSchema, body: castBodySchema }),
  asyncHandler(async (req, res) => {
    try {
      const out = await castVoyageurSpell(
        { db, withTransaction },
        Number(req.glAuth.userId),
        req.validatedParams.code,
        req.body.target,
      );
      return res.json({ success: true, ...out });
    } catch (err) {
      return sendVoyageurError(err, res);
    }
  }),
);

module.exports = router;
