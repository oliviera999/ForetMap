const express = require('express');
const { queryAll, queryOne, withTransaction } = require('../../../database');
const { requireGlPermission } = require('../../../middleware/requireGlAuth');
const { normalizeEventRow } = require('../../../lib/glGameEvents');
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
 * Refus si `gameplay.player_actions_enabled = false` ou si le joueur n'est pas dans
 * l'equipe active (lorsque les tours sont actives).
 */
router.post('/games/:id/actions', requireGlPermission('gl.action.request'), asyncHandler(async (req, res) => {
  if (req.glAuth.userType !== 'gl_player') return res.status(403).json({ error: 'Réservé aux joueurs' });
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const settings = await getGameplaySettings();
  if (!settings.playerActionsEnabled) {
    return res.status(409).json({ error: 'Actions joueurs desactivées dans les réglages' });
  }
  const actionType = normalizeOptionalString(req.body?.actionType);
  if (!actionType) return res.status(400).json({ error: 'actionType requis' });
  const payload = req.body?.payload ?? {};

  const player = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [req.glAuth.userId]);
  if (!player) {
    return res.status(403).json({ error: 'Aucune équipe associée à ce joueur' });
  }
  const teamMembership = await getPlayerGameMembership(gameId, player.id);
  if (!teamMembership) {
    return res.status(403).json({ error: 'Joueur non rattaché à cette partie' });
  }
  const teamIdForGame = teamMembership.team_id;
  if (settings.turnsEnabled) {
    const game = await queryOne('SELECT current_team_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
    if (game?.current_team_id != null && Number(game.current_team_id) !== Number(teamIdForGame)) {
      return res.status(409).json({ error: 'Ce n’est pas le tour de votre équipe' });
    }
  }

  let actionRequestId = null;
  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO gl_action_requests (game_id, team_id, player_id, action_type, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [gameId, teamIdForGame, player.id, actionType, JSON.stringify(payload)]
    );
    const created = await tx.queryOne(
      'SELECT id FROM gl_action_requests WHERE game_id = ? AND player_id = ? ORDER BY id DESC LIMIT 1',
      [gameId, player.id]
    );
    actionRequestId = created?.id ? Number(created.id) : null;
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, 'team', ?, 'action_request', ?, NOW())`,
      [
        gameId,
        teamIdForGame,
        String(player.id),
        JSON.stringify({ actionRequestId, actionType, playerId: player.id, payload }),
      ]
    );
  });
  const evt = await queryOne(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events
      WHERE game_id = ?
      ORDER BY id DESC LIMIT 1`,
    [gameId]
  );
  const normalized = normalizeEventRow(evt);
  emitGlGameEvent(gameId, normalized);
  return res.status(201).json({ actionRequestId, event: normalized });
}));

router.post('/games/:id/actions/:actionId/resolve', requireGlPermission('gl.game.manage'), asyncHandler(async (req, res) => {
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
    [actionId, gameId]
  );
  if (!action) return res.status(404).json({ error: 'Demande introuvable' });
  if (action.status !== 'pending') {
    return res.status(409).json({ error: 'Demande déjà résolue' });
  }

  const settings = await getGameplaySettings();
  let appliedDelta = 0;

  await withTransaction(async (tx) => {
    await tx.execute(
      `UPDATE gl_action_requests
          SET status = ?, resolved_by = ?, resolved_at = NOW()
        WHERE id = ?`,
      [decision, String(req.glAuth.userId), actionId]
    );
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, 'mj', ?, 'action_resolved', ?, NOW())`,
      [
        gameId,
        action.team_id,
        String(req.glAuth.userId),
        JSON.stringify({ actionRequestId: actionId, decision, scoreDelta: 0, reason }),
      ]
    );
    if (decision === 'accepted' && settings.scoringEnabled && Number.isFinite(scoreDelta) && scoreDelta !== 0 && action.team_id != null) {
      appliedDelta = scoreDelta;
      await tx.execute(
        `INSERT INTO gl_team_scores (game_id, team_id, score, last_reason, updated_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           score = score + VALUES(score),
           last_reason = VALUES(last_reason),
           updated_at = NOW()`,
        [gameId, action.team_id, scoreDelta, reason]
      );
      await tx.execute(
        `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
         VALUES (?, ?, 'mj', ?, 'score', ?, NOW())`,
        [
          gameId,
          action.team_id,
          String(req.glAuth.userId),
          JSON.stringify({ delta: scoreDelta, reason: reason || 'Action validée' }),
        ]
      );
    }
  });

  const evtRows = await queryAll(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events
      WHERE game_id = ?
      ORDER BY id DESC LIMIT 2`,
    [gameId]
  );
  for (const row of evtRows.reverse()) {
    emitGlGameEvent(gameId, normalizeEventRow(row));
  }
  return res.json({ ok: true, decision, scoreDelta: appliedDelta });
}));

module.exports = router;
