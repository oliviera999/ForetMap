'use strict';

const { normalizeMarkerQuestionRetrigger } = require('./glMarkerEventConfig');

const PRESENT_EVENT_TYPES = ['marker_question_presented', 'qcm_answer'];

async function hasMarkerQuestionEvent(deps, { gameId, teamId, markerId, mode }) {
  const events = await deps.queryAll(
    `SELECT event_type, team_id, payload_json
       FROM gl_game_events
      WHERE game_id = ?
        AND event_type IN (?, ?)
      ORDER BY id ASC`,
    [gameId, PRESENT_EVENT_TYPES[0], PRESENT_EVENT_TYPES[1]]
  );

  for (const evt of events) {
    let payload = {};
    try {
      payload = evt.payload_json ? JSON.parse(evt.payload_json) : {};
    } catch (_) {
      payload = {};
    }
    const evtMarkerId = payload.markerId != null ? Number(payload.markerId) : null;
    if (evtMarkerId !== Number(markerId)) continue;

    if (mode === 'once_per_game') {
      return true;
    }
    if (mode === 'once_per_team' && Number(evt.team_id) === Number(teamId)) {
      return true;
    }
  }
  return false;
}

async function canPresentMarkerQuestion(deps, { gameId, teamId, markerId, retriggerMode }) {
  const mode = normalizeMarkerQuestionRetrigger(retriggerMode);
  if (mode === 'every_arrival') return true;
  const already = await hasMarkerQuestionEvent(deps, { gameId, teamId, markerId, mode });
  return !already;
}

module.exports = {
  canPresentMarkerQuestion,
  hasMarkerQuestionEvent,
};
