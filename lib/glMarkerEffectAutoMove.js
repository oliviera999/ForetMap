'use strict';

const {
  sortMarkersByPath,
  resolveBoardMovementConfig,
  targetMarkerAfterPathSteps,
  markersAlongPathSteps,
} = require('./shared/glBoardPathCore');
const { applyTeamMoveTx } = require('./gl/gamesRuntime');

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

  const target = targetMarkerAfterPathSteps(sortedMarkers, team, steps, boardMovement.startIndex);
  if (!target?.marker) return null;

  const waypoints = markersAlongPathSteps(sortedMarkers, team, steps, boardMovement.startIndex);
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

  await tx.execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, 'move', ?, NOW())`,
    [gameId, teamId, actorType, actorId, JSON.stringify(movePayload)],
  );

  return {
    applied: true,
    steps,
    targetMarkerId: Number(target.marker.id),
    targetMarkerLabel: target.marker.label ?? null,
    waypoints: waypoints.map(serializeWaypoint),
    skipDestinationEffects: true,
  };
}

module.exports = {
  applyMarkerEffectAutoMoveTx,
  serializeWaypoint,
};
