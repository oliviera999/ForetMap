'use strict';

const {
  parseVitalityDelta,
  applyTeamVitalityDelta,
  applyPlayerVitalityDelta,
} = require('./glVitality');
const { resolveMarkerEffects } = require('./glMarkerEffects');

function parseMarkerIdFromPayload(payloadJson) {
  try {
    const payload = payloadJson ? JSON.parse(payloadJson) : {};
    const markerId = Number(payload.markerId);
    return Number.isFinite(markerId) ? markerId : null;
  } catch (_) {
    return null;
  }
}

async function hasMarkerVitalityApplied(deps, { gameId, teamId, markerId }) {
  const events = await deps.queryAll(
    `SELECT payload_json
       FROM gl_game_events
      WHERE game_id = ?
        AND team_id = ?
        AND event_type = 'marker_effect'
      ORDER BY id ASC`,
    [gameId, teamId],
  );
  const targetId = Number(markerId);
  for (const evt of events) {
    if (parseMarkerIdFromPayload(evt.payload_json) === targetId) {
      return true;
    }
  }
  return false;
}

function resolveMarkerVitalityDeltas(resolved) {
  return {
    healthDelta: parseVitalityDelta(resolved?.deltaPv),
    powerDelta: parseVitalityDelta(resolved?.deltaGems),
    moveDelta: parseVitalityDelta(resolved?.deltaMove),
  };
}

function hasNonZeroVitalityDeltas(healthDelta, powerDelta) {
  return healthDelta !== 0 || powerDelta !== 0;
}

/**
 * Applique les deltas cœurs/gemmes d'un repère à l'équipe (chaque membre) ou à des joueurs ciblés.
 * Même mécanique que les sortilèges (solde par joueur) et les zones feuillets (équipe entière).
 */
async function applyMarkerVitalityEffects(
  tx,
  {
    gameId,
    teamId,
    marker,
    teamType,
    settings,
    playerIds = null,
    skipIfAlreadyApplied = true,
    checkAlreadyApplied = null,
  },
) {
  const resolved = resolveMarkerEffects(marker, teamType);
  if (!resolved) {
    return { applied: false, reason: 'NO_EFFECT', resolvedEffect: null };
  }

  const { healthDelta, powerDelta, moveDelta } = resolveMarkerVitalityDeltas(resolved);
  const vitalityEnabled = settings?.vitalityEnabled === true;
  const vitalityRequired = vitalityEnabled && hasNonZeroVitalityDeltas(healthDelta, powerDelta);

  const base = {
    resolvedEffect: resolved,
    healthDelta,
    powerDelta,
    moveDelta,
    passTurn: Boolean(resolved.passTurn),
    vitalityRequired,
    vitalityResults: null,
    vitalityTarget: 'team',
    alreadyApplied: false,
  };

  if (!vitalityRequired) {
    return { ...base, applied: false, reason: 'NO_VITALITY_DELTA' };
  }

  const alreadyApplied =
    typeof checkAlreadyApplied === 'function'
      ? await checkAlreadyApplied()
      : skipIfAlreadyApplied
        ? await hasMarkerVitalityApplied(
            { queryAll: tx.queryAll.bind(tx) },
            { gameId, teamId, markerId: marker.id },
          )
        : false;

  if (alreadyApplied) {
    return { ...base, applied: false, alreadyApplied: true, reason: 'ALREADY_APPLIED' };
  }

  const normalizedPlayerIds = Array.isArray(playerIds)
    ? playerIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : [];

  let vitalityResults;
  let vitalityTarget = 'team';

  if (normalizedPlayerIds.length > 0) {
    vitalityTarget = 'players';
    vitalityResults = [];
    for (const playerId of normalizedPlayerIds) {
      const updated = await applyPlayerVitalityDelta(tx, {
        playerId,
        healthDelta,
        powerDelta,
      });
      vitalityResults.push(updated);
    }
  } else {
    vitalityResults = await applyTeamVitalityDelta(tx, {
      gameId,
      teamId,
      healthDelta,
      powerDelta,
    });
  }

  return {
    ...base,
    applied: true,
    vitalityResults,
    vitalityTarget,
    vitalityPlayerIds: normalizedPlayerIds.length > 0 ? normalizedPlayerIds : null,
  };
}

function buildMarkerEffectEventPayload({
  marker,
  resolved,
  healthDelta,
  powerDelta,
  moveDelta,
  passTurn,
  reason,
  vitalityTarget,
  vitalityPlayerIds,
  autoMoveApplied = false,
}) {
  return {
    markerId: Number(marker.id),
    markerLabel: marker.label,
    eventType: marker.event_type,
    branch: resolved?.branch ?? null,
    healthDelta,
    powerDelta,
    moveDelta,
    passTurn: Boolean(passTurn),
    reason,
    vitalityTarget: vitalityTarget || 'team',
    autoMoveApplied: Boolean(autoMoveApplied),
    ...(vitalityPlayerIds?.length ? { playerIds: vitalityPlayerIds } : {}),
  };
}

module.exports = {
  parseMarkerIdFromPayload,
  hasMarkerVitalityApplied,
  resolveMarkerVitalityDeltas,
  hasNonZeroVitalityDeltas,
  applyMarkerVitalityEffects,
  buildMarkerEffectEventPayload,
};
