'use strict';

const { queryOne } = require('../database');

function parseGlId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

async function getPlayerGameMembership(gameId, playerId) {
  return queryOne(
    `SELECT tm.team_id, tm.game_id
       FROM gl_team_members tm
      WHERE tm.game_id = ? AND tm.player_id = ?
      LIMIT 1`,
    [gameId, playerId],
  );
}

async function resolveTeamContext(req, gameId, bodyTeamId) {
  if (req.glAuth.userType === 'gl_player') {
    const membership = await getPlayerGameMembership(gameId, req.glAuth.userId);
    if (!membership?.team_id) {
      return { error: { status: 403, message: 'Joueur non rattaché à une équipe' } };
    }
    return { teamId: Number(membership.team_id) };
  }
  const teamId = parseGlId(bodyTeamId);
  if (!teamId) return { error: { status: 400, message: 'teamId requis pour le MJ' } };
  const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
    teamId,
    gameId,
  ]);
  if (!team) return { error: { status: 404, message: 'Équipe introuvable' } };
  return { teamId };
}

module.exports = {
  parseGlId,
  getPlayerGameMembership,
  resolveTeamContext,
};
