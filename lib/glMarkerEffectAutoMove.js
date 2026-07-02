'use strict';

const { insertGameEvent } = require('./glGameEvents');

const {
  sortMarkersByPath,
  resolveBoardMovementConfig,
  targetMarkerAfterPathSteps,
  markersAlongPathSteps,
} = require('./shared/glBoardPathCore');
const { applyTeamMoveTx } = require('./gl/gamesRuntime');

function parseMarkerEffectAutoMovePayload(payloadJson) {
  try {
    const payload = payloadJson ? JSON.parse(payloadJson) : {};
    if (payload?.source !== 'marker_effect') return null;
    const originMarkerId = Number(payload.originMarkerId);
    return Number.isFinite(originMarkerId) ? { originMarkerId } : null;
  } catch (_) {
    return null;
  }
}

async function hasMarkerEffectAutoMoveApplied(deps, { gameId, teamId, originMarkerId }) {
  const rows = await deps.queryAll(
    `SELECT payload_json
       FROM gl_game_events
      WHERE game_id = ?
        AND team_id = ?
        AND event_type = 'move'
      ORDER BY id ASC`,
    [gameId, teamId],
  );
  const targetId = Number(originMarkerId);
  for (const row of rows) {
    const parsed = parseMarkerEffectAutoMovePayload(row.payload_json);
    if (parsed && parsed.originMarkerId === targetId) return true;
  }
  return false;
}

function serializeWaypoint(marker) {
  return {
    id: Number(marker.id),
    label: marker.label ?? null,
    x_pct: Number(marker.x_pct),
    y_pct: Number(marker.y_pct),
  };
}

/**
 * Déplace automatiquement une équipe le long du parcours numéroté selon deltaMove d'un repère.
 * Les effets du repère d'arrivée ne sont pas déclenchés (skipDestinationEffects sur l'événement move).
 */
async function applyMarkerEffectAutoMoveTx(
  tx,
  {
    gameId,
    teamId,
    team,
    game,
    chapterMarkers = [],
    moveDelta,
    settings,
    actorType,
    actorId,
    originMarkerId,
    roundNumber = null,
  },
) {
  if (settings?.markerEffectAutoMoveEnabled !== true) return null;

  const steps = Number(moveDelta);
  if (!Number.isFinite(steps) || steps === 0) return null;

  const boardMovement = resolveBoardMovementConfig(game);
  if (!boardMovement.isNumberedPath) return null;

  const sortedMarkers = sortMarkersByPath(chapterMarkers);
  if (!sortedMarkers.length) return null;

  const lockedTeam = await tx.queryOne(
    `SELECT id, position_marker_id, position_x_pct, position_y_pct
       FROM gl_teams
      WHERE id = ? AND game_id = ?
      LIMIT 1
      FOR UPDATE`,
    [teamId, gameId],
  );
  if (!lockedTeam) return null;

  const alreadyApplied = await hasMarkerEffectAutoMoveApplied(
    { queryAll: tx.queryAll.bind(tx) },
    { gameId, teamId, originMarkerId },
  );
  if (alreadyApplied) return null;

  const currentTeam = lockedTeam || team;
  const target = targetMarkerAfterPathSteps(
    sortedMarkers,
    currentTeam,
    steps,
    boardMovement.startIndex,
  );
  if (!target?.marker) return null;

  const waypoints = markersAlongPathSteps(
    sortedMarkers,
    currentTeam,
    steps,
    boardMovement.startIndex,
  );
  if (!waypoints.length) return null;

  await applyTeamMoveTx(tx, {
    gameId,
    teamId,
    markerId: target.marker.id,
    roundNumber,
  });

  const movePayload = {
    markerId: Number(target.marker.id),
    markerLabel: target.marker.label ?? null,
    xp: Number(target.marker.x_pct),
    yp: Number(target.marker.y_pct),
    skipDestinationEffects: true,
    source: 'marker_effect',
    originMarkerId: Number(originMarkerId),
    moveDelta: steps,
  };

  const moveEvent = await insertGameEvent(tx, {
    gameId,
    teamId,
    actorType,
    actorId,
    eventType: 'move',
    payload: movePayload,
  });

  return {
    applied: true,
    moveEvent,
    steps,
    targetMarkerId: Number(target.marker.id),
    targetMarkerLabel: target.marker.label ?? null,
    waypoints: waypoints.map(serializeWaypoint),
    skipDestinationEffects: true,
  };
}

module.exports = {
  applyMarkerEffectAutoMoveTx,
  hasMarkerEffectAutoMoveApplied,
  parseMarkerEffectAutoMovePayload,
  serializeWaypoint,
};
