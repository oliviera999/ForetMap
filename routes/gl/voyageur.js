'use strict';

/**
 * Le Seuil — niveau du voyageur et grimoire personnel (joueurs G&L).
 *
 * GET  /api/gl/voyageur/me                       → niveau, regards, expédition, grimoire
 * GET  /api/gl/voyageur/spells/:code/targets     → cibles possibles d'un sortilège
 * POST /api/gl/voyageur/spells/:code/cast        → lance le sortilège sur `{ target }`
 * PUT  /api/gl/voyageur/lettre/:id               → écrit ou réécrit sa Lettre (sans repayer)
 * POST /api/gl/voyageur/mentorat/:id/retenter    → retente son Mentorat (sans repayer)
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
const { ecrireLettreTx, retenterMentoratTx } = require('../../lib/glLettreMentorat');
const { resolveGlPlayerActiveMembership } = require('../../lib/glPlayerMembership');
const { z, validate } = require('../../lib/validate');
const asyncHandler = require('../../lib/asyncHandler');

const router = express.Router();
const db = { queryAll, queryOne };

const spellParamsSchema = z.object({ code: z.string().trim().min(1).max(32) });
// 4096 : la cible de la Loupe est un jeton de présentation (JWT), bien plus long qu'un code.
// « Tenir à deux » : Flair (`{ x, y }`) passe sans `target`.
const castBodySchema = z.object({
  target: z.string().trim().min(1).max(4096).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});
const idParamsSchema = z.object({ id: z.coerce.number().int().positive() });
const lettreBodySchema = z.object({
  amorce: z.string().trim().max(32).optional().nullable(),
  titre: z.string().trim().max(160),
  texte: z.string().max(4000),
});

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
      const code = req.validatedParams.code;
      let target = req.body.target;
      if (code === 'flair' && req.body.x != null && req.body.y != null) {
        target = { x: req.body.x, y: req.body.y };
      }
      if (target == null) return res.status(400).json({ error: 'Cible requise' });
      const out = await castVoyageurSpell(
        { db, withTransaction },
        Number(req.glAuth.userId),
        code,
        target,
      );
      return res.json({ success: true, ...out });
    } catch (err) {
      return sendVoyageurError(err, res);
    }
  }),
);

// ---------------------------------------------------------------------
// Lettre et Mentorat (ensemble unifié, M23) : payés une fois, rejoués sans repayer.
// ---------------------------------------------------------------------

router.put(
  '/lettre/:id',
  validate({ params: idParamsSchema, body: lettreBodySchema }),
  asyncHandler(async (req, res) => {
    try {
      const lettre = await withTransaction((tx) =>
        ecrireLettreTx(tx, {
          playerId: Number(req.glAuth.userId),
          lettreId: req.validatedParams.id,
          amorce: req.body.amorce ?? null,
          titre: req.body.titre,
          texte: req.body.texte,
        }),
      );
      return res.json({ success: true, lettre });
    } catch (err) {
      return sendVoyageurError(err, res);
    }
  }),
);

router.post(
  '/mentorat/:id/retenter',
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    try {
      const playerId = Number(req.glAuth.userId);
      const membership = await resolveGlPlayerActiveMembership(playerId, { queryOne });
      if (!membership?.gameId) {
        return res
          .status(409)
          .json({ error: 'Aucune partie en cours.', code: 'SPELL_HORS_EXPEDITION' });
      }
      const mentorat = await withTransaction((tx) =>
        retenterMentoratTx(tx, {
          gameId: Number(membership.gameId),
          playerId,
          mentoratId: req.validatedParams.id,
        }),
      );
      return res.json({ success: true, mentorat });
    } catch (err) {
      return sendVoyageurError(err, res);
    }
  }),
);

module.exports = router;
