'use strict';

const { clampVitality } = require('./glVitality');

const GAME_ROSTER_SELECT = `SELECT p.id, tm.team_id, t.name AS team_name,
            p.pseudo, p.first_name, p.last_name, p.health_points, p.power_points`;

function mapGameRosterRow(row, { vitalityEnabled = false } = {}) {
  const out = {
    playerId: Number(row.id),
    teamId: row.team_id != null ? Number(row.team_id) : null,
    teamName: row.team_name != null ? String(row.team_name) : null,
    pseudo: row.pseudo || null,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
  };
  if (vitalityEnabled) {
    out.healthPoints = clampVitality(row.health_points);
    out.powerPoints = clampVitality(row.power_points);
  }
  return out;
}

async function loadGameRosterForState(queryAllFn, gameId, { vitalityEnabled = false } = {}) {
  const rows = await queryAllFn(
    `${GAME_ROSTER_SELECT}
       FROM gl_team_members tm
 INNER JOIN gl_players p ON p.id = tm.player_id
 INNER JOIN gl_teams t ON t.id = tm.team_id
      WHERE tm.game_id = ?
      ORDER BY t.name ASC, p.last_name ASC, p.first_name ASC, p.id ASC`,
    [gameId],
  );
  return rows.map((row) => mapGameRosterRow(row, { vitalityEnabled }));
}

async function loadTeamRosterForGame(
  queryAllFn,
  gameId,
  teamId,
  { vitalityEnabled = true } = {},
) {
  const rows = await queryAllFn(
    `${GAME_ROSTER_SELECT}
       FROM gl_team_members tm
 INNER JOIN gl_players p ON p.id = tm.player_id
 INNER JOIN gl_teams t ON t.id = tm.team_id
      WHERE tm.game_id = ? AND tm.team_id = ?
      ORDER BY t.name ASC, p.last_name ASC, p.first_name ASC, p.id ASC`,
    [gameId, teamId],
  );
  return rows.map((row) => mapGameRosterRow(row, { vitalityEnabled }));
}

async function assignPlayerToTeamTx(tx, { gameId, teamId, playerId }) {
  const team = await tx.queryOne(
    'SELECT id, game_id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
    [teamId, gameId],
  );
  if (!team) throw Object.assign(new Error('TEAM_NOT_FOUND'), { status: 404 });

  const game = await tx.queryOne('SELECT id, class_id FROM gl_games WHERE id = ? LIMIT 1', [
    gameId,
  ]);
  if (!game) throw Object.assign(new Error('GAME_NOT_FOUND'), { status: 404 });

  const player = await tx.queryOne('SELECT id, class_id FROM gl_players WHERE id = ? LIMIT 1', [
    playerId,
  ]);
  if (!player) throw Object.assign(new Error('PLAYER_NOT_FOUND'), { status: 404 });
  if (Number(player.class_id) !== Number(game.class_id)) {
    throw Object.assign(new Error('PLAYER_CLASS_MISMATCH'), { status: 409 });
  }

  await tx.execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE team_id = VALUES(team_id), joined_at = NOW()`,
    [gameId, teamId, playerId],
  );
  await tx.execute('UPDATE gl_players SET team_id = ?, updated_at = NOW() WHERE id = ?', [
    teamId,
    playerId,
  ]);
}

async function unassignPlayerFromGameTx(tx, { gameId, playerId }) {
  const membership = await tx.queryOne(
    'SELECT game_id, team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
    [gameId, playerId],
  );
  if (!membership) {
    return { removed: false };
  }
  await tx.execute('DELETE FROM gl_team_members WHERE game_id = ? AND player_id = ?', [
    gameId,
    playerId,
  ]);
  await tx.execute(
    'UPDATE gl_players SET team_id = NULL, updated_at = NOW() WHERE id = ? AND team_id = ?',
    [playerId, membership.team_id],
  );
  return { removed: true };
}

module.exports = {
  mapGameRosterRow,
  loadGameRosterForState,
  loadTeamRosterForGame,
  assignPlayerToTeamTx,
  unassignPlayerFromGameTx,
};
