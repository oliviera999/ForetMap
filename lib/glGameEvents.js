function safeJsonParse(raw, fallback = null) {
  if (raw == null) return fallback;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return fallback;
  }
}

function normalizeEventRow(row) {
  return {
    id: Number(row.id),
    gameId: String(row.game_id),
    teamId: row.team_id ? Number(row.team_id) : null,
    actorType: String(row.actor_type || 'system'),
    actorId: row.actor_id ? String(row.actor_id) : null,
    eventType: String(row.event_type || ''),
    payload: safeJsonParse(row.payload_json, {}),
    createdAt: row.created_at,
  };
}

/**
 * Rejoue les evenements pour reconstituer l'etat de partie (positions, tour courant, scores,
 * fil narratif, actions en attente). N'effectue aucune ecriture : pur replay.
 *
 * Etat de retour :
 *  - gameStatus, currentTeamId
 *  - markersByTeamId  { [teamId]: markerId | null }
 *  - positionsByTeamId { [teamId]: { xp: number | null, yp: number | null, markerId: number | null } }
 *  - scoresByTeamId   { [teamId]: number }
 *  - pendingActions   [{ actionRequestId, teamId, playerId, actionType, payload, createdAt }]
 *  - narrations       [{ id, text, createdAt }]
 *  - timeline         tous les evenements normalises
 */
function replayGameEvents(events, initialState = {}) {
  const state = {
    gameStatus: initialState.gameStatus || 'draft',
    currentTeamId:
      initialState.currentTeamId != null ? Number(initialState.currentTeamId) : null,
    teamsById: { ...(initialState.teamsById || {}) },
    markersByTeamId: { ...(initialState.markersByTeamId || {}) },
    positionsByTeamId: { ...(initialState.positionsByTeamId || {}) },
    scoresByTeamId: { ...(initialState.scoresByTeamId || {}) },
    pendingActions: [],
    narrations: [],
    timeline: [],
  };

  const pendingById = new Map();

  for (const evt of events || []) {
    const event = normalizeEventRow(evt);
    state.timeline.push(event);

    switch (event.eventType) {
      case 'move': {
        if (event.teamId == null) break;
        const markerId =
          event.payload?.markerId != null ? Number(event.payload.markerId) : null;
        const xp = event.payload?.xp != null ? Number(event.payload.xp) : null;
        const yp = event.payload?.yp != null ? Number(event.payload.yp) : null;
        state.markersByTeamId[event.teamId] = markerId;
        state.positionsByTeamId[event.teamId] = {
          markerId,
          xp: Number.isFinite(xp) ? xp : null,
          yp: Number.isFinite(yp) ? yp : null,
        };
        break;
      }
      case 'game_status': {
        if (event.payload?.status) {
          state.gameStatus = String(event.payload.status);
        }
        break;
      }
      case 'turn_change': {
        const nextTeamId = event.payload?.teamId != null ? Number(event.payload.teamId) : null;
        state.currentTeamId = nextTeamId;
        break;
      }
      case 'narration': {
        const text = String(event.payload?.text || '').trim();
        if (text) {
          state.narrations.push({ id: event.id, text, createdAt: event.createdAt });
        }
        break;
      }
      case 'score': {
        if (event.teamId == null) break;
        const delta = Number(event.payload?.delta);
        if (!Number.isFinite(delta)) break;
        const current = Number(state.scoresByTeamId[event.teamId] || 0);
        state.scoresByTeamId[event.teamId] = current + delta;
        break;
      }
      case 'action_request': {
        const actionRequestId =
          event.payload?.actionRequestId != null ? Number(event.payload.actionRequestId) : null;
        if (actionRequestId == null) break;
        const item = {
          actionRequestId,
          teamId: event.teamId,
          playerId: event.payload?.playerId != null ? Number(event.payload.playerId) : null,
          actionType: String(event.payload?.actionType || ''),
          payload: event.payload?.payload || {},
          createdAt: event.createdAt,
        };
        pendingById.set(actionRequestId, item);
        break;
      }
      case 'action_resolved': {
        const actionRequestId =
          event.payload?.actionRequestId != null ? Number(event.payload.actionRequestId) : null;
        if (actionRequestId == null) break;
        pendingById.delete(actionRequestId);
        break;
      }
      default:
        // evenements non typeés : conservés uniquement dans la timeline.
        break;
    }
  }

  state.pendingActions = Array.from(pendingById.values());
  return state;
}

module.exports = {
  safeJsonParse,
  normalizeEventRow,
  replayGameEvents,
};
