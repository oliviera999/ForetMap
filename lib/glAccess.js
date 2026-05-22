'use strict';

const { queryOne } = require('../database');

function parsePositiveId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function isGlPlayerAuth(auth) {
  return String(auth?.product || '').toLowerCase() === 'gl'
    && String(auth?.userType || '') === 'gl_player'
    && parsePositiveId(auth?.userId) != null;
}

function isGlStaffAuth(auth) {
  return String(auth?.product || '').toLowerCase() === 'gl'
    && String(auth?.userType || '') !== 'gl_player'
    && String(auth?.userId || '').trim() !== '';
}

async function getPlayerGameMembership(auth, gameId) {
  const parsedGameId = parsePositiveId(gameId);
  const playerId = parsePositiveId(auth?.userId);
  if (!parsedGameId || !playerId || !isGlPlayerAuth(auth)) return null;

  const row = await queryOne(
    `SELECT tm.game_id, tm.team_id, tm.player_id
       FROM gl_team_members tm
 INNER JOIN gl_teams t ON t.id = tm.team_id AND t.game_id = tm.game_id
      WHERE tm.game_id = ?
        AND tm.player_id = ?
      LIMIT 1`,
    [parsedGameId, playerId]
  );
  if (!row) return null;
  return {
    gameId: Number(row.game_id),
    teamId: Number(row.team_id),
    playerId: Number(row.player_id),
  };
}

async function canAccessGlGame(auth, gameId) {
  if (isGlStaffAuth(auth)) return true;
  if (auth?.passwordMustReset) return false;
  if (!isGlPlayerAuth(auth)) return false;
  return !!(await getPlayerGameMembership(auth, gameId));
}

async function requireGlGameAccess(req, res, next) {
  try {
    const gameId = parsePositiveId(req.params?.id || req.params?.gameId);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès refusé à cette partie' });
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  parsePositiveId,
  isGlPlayerAuth,
  isGlStaffAuth,
  getPlayerGameMembership,
  canAccessGlGame,
  requireGlGameAccess,
};
