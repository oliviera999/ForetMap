'use strict';

/**
 * « Tenir à deux », lot 2, § 7 — défi de case. Préfixe réel `/api/gl/games/:id/defis-case`
 * (monté par routes/gl/games.js).
 *
 * - `GET  /games/:id/defis-case` : le prof voit tous les défis, avec le critère ; une équipe
 *   (élève, tablette) voit les siens ; la projection voit ceux à préparer. **Le critère n'est
 *   jamais servi à un élève ni à la projection.**
 * - `POST /games/:id/defis-case/:defiId/decider { releve }` : prof seul, une seule décision.
 */

const express = require('express');
const db = require('../../../database');
const { withTransaction } = db;
const {
  requireGlAuthOrProjection,
  requireGlPermission,
  isMj,
} = require('../../../middleware/requireGlAuth');
const { canAccessGlGame } = require('../../../lib/glGameAccess');
const { parseId } = require('../../../lib/shared/httpHelpers');
const asyncHandler = require('../../../lib/asyncHandler');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { resolveTenirSettings } = require('../../../lib/glTenir');
const { requireTenirGame } = require('./tenir');
const defis = require('../../../lib/glDefisCase');

const router = express.Router();

const MESSAGES = Object.freeze({
  DEFI_INTROUVABLE: 'Défi introuvable dans cette partie',
  DEFI_DEJA_JUGE: 'Ce défi a déjà reçu sa décision',
});

router.get(
  '/games/:id/defis-case',
  requireGlAuthOrProjection,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const actor = req.glAuth.actor || {};
    let viewer = 'projection';
    let teamId = null;
    if (isMj(req)) viewer = 'mj';
    else if (actor.kind === 'team') {
      viewer = 'team';
      teamId = Number(actor.teamId);
    } else if (actor.kind === 'player') {
      const row = await db.queryOne(
        'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
        [gameId, actor.playerId],
      );
      viewer = 'team';
      teamId = row?.team_id != null ? Number(row.team_id) : null;
    }
    const resolved = resolveTenirSettings(ctx.settings, ctx.game);
    return res.json({
      actifs: defis.defisActifs(resolved),
      recul: Number(resolved.defi_recul ?? 2) || 0,
      defis: await defis.listDefis(db, { gameId, viewer, teamId }),
    });
  }),
);

router.post(
  '/games/:id/defis-case/:defiId/decider',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const defiId = parseId(req.params.defiId);
    if (!gameId || !defiId) return res.status(400).json({ error: 'Identifiant invalide' });
    if (typeof req.body?.releve !== 'boolean') {
      return res.status(400).json({ error: 'releve (true ou false) requis' });
    }
    const ctx = await requireTenirGame(req, res, gameId);
    if (!ctx) return undefined;
    const resolved = resolveTenirSettings(ctx.settings, ctx.game);
    let result;
    try {
      result = await withTransaction((tx) =>
        defis.deciderDefiTx(tx, {
          gameId,
          defiId,
          releve: req.body.releve,
          actorId: req.glAuth.userId,
          resolved,
        }),
      );
    } catch (err) {
      const message = MESSAGES[err?.message];
      if (message && err.status) {
        return res.status(err.status).json({ error: message, code: err.message });
      }
      throw err;
    }
    for (const evt of result.events) emitGlGameEvent(gameId, evt);
    return res.json({
      ok: true,
      defiId: result.defiId,
      teamId: result.teamId,
      statut: result.statut,
      recul: result.recul,
    });
  }),
);

module.exports = router;
