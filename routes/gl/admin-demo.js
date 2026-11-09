'use strict';

/**
 * Partie de **démonstration** G&L — monté sous `/api/gl/admin` (server.js), `gl.game.manage`.
 *
 * - `GET  /demo`        : résumé (classe fictive, partie, nombre de joueurs) ou `null`.
 * - `POST /demo/reset`  : prépare ou remet à zéro la partie de démonstration
 *                         (`lib/gl/demoGame.js`), répond `201` avec les identifiants.
 *
 * Un joueur ou un invité est refusé (403) comme sur toute route MJ.
 */

const express = require('express');
const asyncHandler = require('../../lib/asyncHandler');
const { requireGlPermission } = require('../../middleware/requireGlAuth');
const { describeGlDemoGame, ensureGlDemoGame } = require('../../lib/gl/demoGame');
const { logRouteError } = require('../../lib/routeLog');

const router = express.Router();

router.get(
  '/demo',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (_req, res) => {
    const summary = await describeGlDemoGame();
    return res.json({ demo: summary });
  }),
);

router.post(
  '/demo/reset',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    try {
      const result = await ensureGlDemoGame({ actorId: req.glAuth.userId, reset: true });
      return res.status(201).json({ ok: true, ...result });
    } catch (err) {
      logRouteError(req, err, 'gl.admin.demo.reset');
      return res
        .status(409)
        .json({ error: err?.message || 'Préparation de la démonstration impossible' });
    }
  }),
);

module.exports = router;
