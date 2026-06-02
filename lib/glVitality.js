const VITALITY_MAX = 99;

function clampVitality(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(VITALITY_MAX, Math.floor(n)));
}

function getDefaultVitalityFromSettings(settings = {}) {
  return {
    health: clampVitality(settings.defaultHealthPoints ?? 3),
    power: clampVitality(settings.defaultPowerPoints ?? 3),
  };
}

function parseVitalityDelta(value) {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.trunc(n);
}

async function applyPlayerVitalityDelta(tx, { playerId, healthDelta = 0, powerDelta = 0 }) {
  const row = await tx.queryOne(
    'SELECT id, health_points, power_points FROM gl_players WHERE id = ? LIMIT 1',
    [playerId]
  );
  if (!row) {
    const err = new Error('PLAYER_NOT_FOUND');
    err.status = 404;
    throw err;
  }
  const health = clampVitality((Number(row.health_points) || 0) + parseVitalityDelta(healthDelta));
  const power = clampVitality((Number(row.power_points) || 0) + parseVitalityDelta(powerDelta));
  await tx.execute(
    'UPDATE gl_players SET health_points = ?, power_points = ?, updated_at = NOW() WHERE id = ?',
    [health, power, playerId]
  );
  return {
    playerId: Number(playerId),
    health,
    power,
  };
}

async function applyTeamVitalityDelta(tx, { gameId, teamId, healthDelta = 0, powerDelta = 0 }) {
  const members = await tx.queryAll(
    `SELECT tm.player_id
       FROM gl_team_members tm
      WHERE tm.game_id = ? AND tm.team_id = ?
      ORDER BY tm.player_id ASC`,
    [gameId, teamId]
  );
  if (!members.length) {
    const err = new Error('TEAM_EMPTY');
    err.status = 400;
    throw err;
  }
  const results = [];
  for (const member of members) {
    const updated = await applyPlayerVitalityDelta(tx, {
      playerId: member.player_id,
      healthDelta,
      powerDelta,
    });
    results.push(updated);
  }
  return results;
}

async function loadVitalityForGame(queryAllFn, queryOneFn, gameId, vitalityEnabled) {
  if (!vitalityEnabled) return null;
  const game = await queryOneFn(
    'SELECT class_id FROM gl_games WHERE id = ? LIMIT 1',
    [gameId]
  );
  if (!game?.class_id) return { enabled: true, byPlayerId: {} };
  const rows = await queryAllFn(
    `SELECT id, health_points, power_points
       FROM gl_players
      WHERE class_id = ?`,
    [game.class_id]
  );
  const byPlayerId = {};
  for (const row of rows) {
    byPlayerId[Number(row.id)] = {
      health: clampVitality(row.health_points),
      power: clampVitality(row.power_points),
    };
  }
  return { enabled: true, byPlayerId };
}

function resolveVitalityError(err) {
  if (err?.status === 404 && err?.message === 'PLAYER_NOT_FOUND') {
    return { status: 404, error: 'Joueur introuvable' };
  }
  if (err?.status === 400 && err?.message === 'TEAM_EMPTY') {
    return { status: 400, error: 'Aucun joueur dans cette équipe pour cette partie' };
  }
  if (err?.message === 'PLAYER_CLASS_MISMATCH') {
    return { status: 409, error: 'Le joueur n’appartient pas à la classe de cette partie' };
  }
  return null;
}

module.exports = {
  VITALITY_MAX,
  clampVitality,
  getDefaultVitalityFromSettings,
  parseVitalityDelta,
  applyPlayerVitalityDelta,
  applyTeamVitalityDelta,
  loadVitalityForGame,
  resolveVitalityError,
};
