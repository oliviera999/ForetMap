const express = require('express');
const { queryAll, queryOne, withTransaction } = require('../../../database');
const { requireGlPermission } = require('../../../middleware/requireGlAuth');
const { insertGameEvent } = require('../../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../../lib/realtime');
const { getGameplaySettings } = require('../../../lib/glSettings');
const { normalizeOptionalString } = require('../../../lib/shared/httpHelpers');
const asyncHandler = require('../../../lib/asyncHandler');
const { getPlayerGameMembership } = require('../../../lib/gl/gamesRuntime');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Demande d'action emise par un joueur. Le MJ resout via /actions/:actionId/resolve.
 * Refus si `gameplay.player_actions_enabled = false`. Mode classique : pas de blocage
 * « tour de l'équipe » (toutes les équipes jouent simultanément).
 */
router.post(
  '/games/:id/actions',
  requireGlPermission('gl.action.request'),
  asyncHandler(async (req, res) => {
    if (req.glAuth.userType !== 'gl_player')
      return res.status(403).json({ error: 'Réservé aux joueurs' });
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const settings = await getGameplaySettings();
    if (!settings.playerActionsEnabled) {
      return res.status(409).json({ error: 'Actions joueurs desactivées dans les réglages' });
    }
    const actionType = normalizeOptionalString(req.body?.actionType);
    if (!actionType) return res.status(400).json({ error: 'actionType requis' });
    const payload = req.body?.payload ?? {};

    const player = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [
      req.glAuth.userId,
    ]);
    if (!player) {
      return res.status(403).json({ error: 'Aucune équipe associée à ce joueur' });
    }
    const teamMembership = await getPlayerGameMembership(gameId, player.id);
    if (!teamMembership) {
      return res.status(403).json({ error: 'Joueur non rattaché à cette partie' });
    }
    const teamIdForGame = teamMembership.team_id;
    // Mode classique : toutes les équipes jouent simultanément, plus de blocage « pas votre tour ».

    let actionRequestId = null;
    let requestEvent = null;
    await withTransaction(async (tx) => {
      const requestInsert = await tx.execute(
        `INSERT INTO gl_action_requests (game_id, team_id, player_id, action_type, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
        [gameId, teamIdForGame, player.id, actionType, JSON.stringify(payload)],
      );
      actionRequestId = requestInsert.insertId ? Number(requestInsert.insertId) : null;
      requestEvent = await insertGameEvent(tx, {
        gameId,
        teamId: teamIdForGame,
        actorType: 'team',
        actorId: String(player.id),
        eventType: 'action_request',
        payload: { actionRequestId, actionType, playerId: player.id, payload },
      });
    });
    emitGlGameEvent(gameId, requestEvent);
    return res.status(201).json({ actionRequestId, event: requestEvent });
  }),
);

router.post(
  '/games/:id/actions/:actionId/resolve',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const actionId = parseId(req.params.actionId);
    if (!gameId || !actionId) return res.status(400).json({ error: 'Identifiants invalides' });
    const decision = String(req.body?.decision || '').toLowerCase();
    if (!['accepted', 'refused'].includes(decision)) {
      return res.status(400).json({ error: 'Décision invalide (accepted|refused)' });
    }
    const scoreDeltaRaw = req.body?.scoreDelta;
    const scoreDelta = scoreDeltaRaw == null ? 0 : Number(scoreDeltaRaw);
    const reason = normalizeOptionalString(req.body?.reason);

    const action = await queryOne(
      'SELECT id, team_id, status FROM gl_action_requests WHERE id = ? AND game_id = ? LIMIT 1',
      [actionId, gameId],
    );
    if (!action) return res.status(404).json({ error: 'Demande introuvable' });
    if (action.status !== 'pending') {
      return res.status(409).json({ error: 'Demande déjà résolue' });
    }

    const settings = await getGameplaySettings();
    let appliedDelta = 0;
    const resolvedEvents = [];

    await withTransaction(async (tx) => {
      await tx.execute(
        `UPDATE gl_action_requests
          SET status = ?, resolved_by = ?, resolved_at = NOW()
        WHERE id = ?`,
        [decision, String(req.glAuth.userId), actionId],
      );
      resolvedEvents.push(
        await insertGameEvent(tx, {
          gameId,
          teamId: action.team_id,
          actorType: 'mj',
          actorId: String(req.glAuth.userId),
          eventType: 'action_resolved',
          payload: { actionRequestId: actionId, decision, scoreDelta: 0, reason },
        }),
      );
      if (
        decision === 'accepted' &&
        settings.scoringEnabled &&
        Number.isFinite(scoreDelta) &&
        scoreDelta !== 0 &&
        action.team_id != null
      ) {
        appliedDelta = scoreDelta;
        await tx.execute(
          `INSERT INTO gl_team_scores (game_id, team_id, score, last_reason, updated_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           score = score + VALUES(score),
           last_reason = VALUES(last_reason),
           updated_at = NOW()`,
          [gameId, action.team_id, scoreDelta, reason],
        );
        resolvedEvents.push(
          await insertGameEvent(tx, {
            gameId,
            teamId: action.team_id,
            actorType: 'mj',
            actorId: String(req.glAuth.userId),
            eventType: 'score',
            payload: { delta: scoreDelta, reason: reason || 'Action validée' },
          }),
        );
      }
    });

    // Événements de CETTE requête, dans l'ordre d'insertion. Corrige aussi la
    // ré-émission d'un vieil événement quand un seul venait d'être inséré
    // (l'ancien re-SELECT LIMIT 2 en reprenait toujours deux).
    for (const evt of resolvedEvents) {
      emitGlGameEvent(gameId, evt);
    }
    return res.json({ ok: true, decision, scoreDelta: appliedDelta });
  }),
);

module.exports = router;
