'use strict';

const { queryOne } = require('../database');

function normalizeGlId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function getGlPlayerGameMembership(gameId, playerId, executor = { queryOne }) {
  const normalizedGameId = normalizeGlId(gameId);
  const normalizedPlayerId = normalizeGlId(playerId);
  if (!normalizedGameId || !normalizedPlayerId) return null;
  return executor.queryOne(
    `SELECT tm.game_id, tm.team_id, tm.player_id
       FROM gl_team_members tm
  INNER JOIN gl_games g ON g.id = tm.game_id
  INNER JOIN gl_players p ON p.id = tm.player_id
      WHERE tm.game_id = ?
        AND tm.player_id = ?
        AND p.is_active = 1
        AND p.class_id = g.class_id
      LIMIT 1`,
    [normalizedGameId, normalizedPlayerId]
  );
}

async function requireGlPlayerGameMembership(req, res, gameId) {
  if (req.glAuth?.userType !== 'gl_player') return null;
  const membership = await getGlPlayerGameMembership(gameId, req.glAuth.userId);
  if (!membership) {
    res.status(403).json({ error: 'Accès refusé à cette partie' });
    return null;
  }
  return membership;
}

module.exports = {
  getGlPlayerGameMembership,
  requireGlPlayerGameMembership,
  normalizeGlId,
};
