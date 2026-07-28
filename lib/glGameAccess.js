'use strict';

const { queryOne } = require('../database');

function normalizeGameId(value) {
  const gameId = Number(value);
  return Number.isFinite(gameId) && gameId > 0 ? gameId : null;
}

function normalizePlayerId(value) {
  const playerId = Number(value);
  return Number.isFinite(playerId) && playerId > 0 ? playerId : null;
}

async function isGlPlayerMemberOfGame(auth, gameId) {
  const normalizedGameId = normalizeGameId(gameId);
  const playerId = normalizePlayerId(auth?.userId);
  if (!normalizedGameId || !playerId) return false;

  const linked = await queryOne(
    `SELECT 1 AS ok
       FROM gl_team_members tm
       INNER JOIN gl_players p ON p.id = tm.player_id
      WHERE tm.game_id = ? AND tm.player_id = ? AND p.is_active = 1
      LIMIT 1`,
    [normalizedGameId, playerId],
  );
  return !!linked;
}

async function canAccessGlGame(auth, gameId) {
  if (!auth || String(auth.product || '').toLowerCase() !== 'gl') return false;
  const userType = String(auth.userType || '');
  if (userType === 'gl_admin') return true;
  if (userType !== 'gl_player') return false;
  return isGlPlayerMemberOfGame(auth, gameId);
}

module.exports = {
  canAccessGlGame,
  isGlPlayerMemberOfGame,
  normalizeGameId,
};
