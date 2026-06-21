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

async function loadTeamRosterForGame(queryAllFn, gameId, teamId, { vitalityEnabled = true } = {}) {
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

// Mélange en place (Fisher–Yates). `rng` injectable pour tests déterministes.
function shuffleInPlace(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Répartit aléatoirement `pool` (ids de joueurs) entre `teamIds` en équilibrant
// les effectifs : chaque joueur va dans l'équipe la moins remplie (en tenant
// compte des effectifs déjà présents via `currentCounts`). Joueurs et équipes
// sont mélangés pour casser tout biais d'ordre. Fonction pure (testable).
function computeBalancedAssignments({ pool, teamIds, currentCounts = null, rng = Math.random }) {
  const teams = teamIds.map(Number).filter((id) => Number.isFinite(id));
  if (teams.length === 0) return [];
  const counts = new Map(teams.map((id) => [id, 0]));
  if (currentCounts) {
    for (const [teamId, count] of currentCounts.entries()) {
      const id = Number(teamId);
      if (counts.has(id)) counts.set(id, Number(count) || 0);
    }
  }
  const shuffledPool = shuffleInPlace([...pool], rng);
  const shuffledTeams = shuffleInPlace([...teams], rng);
  const assignments = [];
  for (const playerId of shuffledPool) {
    let bestTeam = shuffledTeams[0];
    let bestCount = counts.get(bestTeam);
    for (const teamId of shuffledTeams) {
      const c = counts.get(teamId);
      if (c < bestCount) {
        bestCount = c;
        bestTeam = teamId;
      }
    }
    counts.set(bestTeam, bestCount + 1);
    assignments.push({ playerId: Number(playerId), teamId: bestTeam });
  }
  return assignments;
}

// Répartition (partiellement) aléatoire des effectifs d'une partie.
// - mode 'fill' (défaut) : seuls les joueurs non assignés sont répartis ; les
//   équipes déjà constituées sont conservées et l'équilibrage tient compte des
//   effectifs existants → mode « partiellement aléatoire ».
// - mode 'reset' : tous les joueurs actifs de la classe sont redistribués.
// `teamIds` optionnel restreint les équipes cibles (défaut : toutes celles de la partie).
async function autoAssignRosterTx(
  tx,
  { gameId, teamIds = null, mode = 'fill', rng = Math.random },
) {
  const game = await tx.queryOne('SELECT id, class_id FROM gl_games WHERE id = ? LIMIT 1', [
    gameId,
  ]);
  if (!game) throw Object.assign(new Error('GAME_NOT_FOUND'), { status: 404 });

  const allTeams = await tx.queryAll('SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id ASC', [
    gameId,
  ]);
  let targetTeams = allTeams.map((row) => Number(row.id));
  if (Array.isArray(teamIds) && teamIds.length > 0) {
    const requested = new Set(teamIds.map(Number));
    targetTeams = targetTeams.filter((id) => requested.has(id));
  }
  if (targetTeams.length === 0) throw Object.assign(new Error('NO_TEAMS'), { status: 409 });

  const players = await tx.queryAll(
    `SELECT p.id, tm.team_id
       FROM gl_players p
  LEFT JOIN gl_team_members tm ON tm.game_id = ? AND tm.player_id = p.id
      WHERE p.class_id = ? AND p.is_active = 1
      ORDER BY p.id ASC`,
    [gameId, game.class_id],
  );

  const reset = mode === 'reset';
  const pool = players.filter((p) => (reset ? true : p.team_id == null)).map((p) => Number(p.id));

  // Effectifs déjà présents (mode 'fill' uniquement, pour équilibrer).
  let currentCounts = null;
  if (!reset) {
    currentCounts = new Map(targetTeams.map((id) => [id, 0]));
    for (const p of players) {
      const teamId = p.team_id != null ? Number(p.team_id) : null;
      if (teamId != null && currentCounts.has(teamId)) {
        currentCounts.set(teamId, currentCounts.get(teamId) + 1);
      }
    }
  }

  const assignments = computeBalancedAssignments({
    pool,
    teamIds: targetTeams,
    currentCounts,
    rng,
  });

  // assignPlayerToTeamTx fait un upsert (ON DUPLICATE KEY UPDATE) : en mode reset,
  // un joueur déjà dans une équipe est simplement déplacé.
  for (const { playerId, teamId } of assignments) {
    await assignPlayerToTeamTx(tx, { gameId, teamId, playerId });
  }

  return {
    assignedCount: assignments.length,
    teamIds: targetTeams,
    mode: reset ? 'reset' : 'fill',
  };
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
  shuffleInPlace,
  computeBalancedAssignments,
  autoAssignRosterTx,
};
