'use strict';

const { normalizeMarkerQuestionRetrigger } = require('./glMarkerEventConfig');

const PRESENT_EVENT_TYPE = 'zone_content_presented';

async function hasZoneContentEvent(deps, { gameId, teamId, zoneId, mode }) {
  const events = await deps.queryAll(
    `SELECT event_type, team_id, payload_json
       FROM gl_game_events
      WHERE game_id = ?
        AND event_type = ?
      ORDER BY id ASC`,
    [gameId, PRESENT_EVENT_TYPE],
  );

  for (const evt of events) {
    let payload = {};
    try {
      payload = evt.payload_json ? JSON.parse(evt.payload_json) : {};
    } catch (_) {
      payload = {};
    }
    const evtZoneId = payload.zoneId != null ? Number(payload.zoneId) : null;
    if (evtZoneId !== Number(zoneId)) continue;

    if (mode === 'once_per_game') {
      return true;
    }
    if (mode === 'once_per_team' && Number(evt.team_id) === Number(teamId)) {
      return true;
    }
  }
  return false;
}

async function canPresentZoneContent(deps, { gameId, teamId, zoneId, retriggerMode }) {
  const mode = normalizeMarkerQuestionRetrigger(retriggerMode);
  if (mode === 'every_arrival') return true;
  const already = await hasZoneContentEvent(deps, { gameId, teamId, zoneId, mode });
  return !already;
}

function resolveZoneContentRetrigger(gameRow, globalSettings) {
  const gameValue = gameRow?.zone_content_retrigger ?? gameRow?.zoneContentRetrigger ?? null;
  if (gameValue != null && String(gameValue).trim()) {
    return normalizeMarkerQuestionRetrigger(gameValue);
  }
  return normalizeMarkerQuestionRetrigger(globalSettings?.zoneContentRetrigger);
}

module.exports = {
  PRESENT_EVENT_TYPE,
  canPresentZoneContent,
  hasZoneContentEvent,
  resolveZoneContentRetrigger,
};
