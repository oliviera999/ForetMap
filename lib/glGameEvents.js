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

function replayGameEvents(events, initialState = {}) {
  const state = {
    gameStatus: initialState.gameStatus || 'draft',
    teamsById: { ...(initialState.teamsById || {}) },
    markersByTeamId: { ...(initialState.markersByTeamId || {}) },
    timeline: [],
  };
  for (const evt of events || []) {
    const event = normalizeEventRow(evt);
    state.timeline.push(event);
    if (event.eventType === 'move' && event.teamId != null) {
      const markerId = event.payload?.markerId != null ? Number(event.payload.markerId) : null;
      state.markersByTeamId[event.teamId] = markerId;
    } else if (event.eventType === 'game_status' && event.payload?.status) {
      state.gameStatus = String(event.payload.status);
    }
  }
  return state;
}

module.exports = {
  safeJsonParse,
  normalizeEventRow,
  replayGameEvents,
};
