'use strict';

const { normalizeMarkerQuestionRetrigger } = require('./glMarkerEventConfig');

const PRESENT_EVENT_TYPE = 'feuillet_discovered';

async function hasFeuilletEvent(deps, { gameId, teamId, feuilletCode, mode }) {
  const events = await deps.queryAll(
    `SELECT event_type, team_id, payload_json
       FROM gl_game_events
      WHERE game_id = ?
        AND event_type IN ('feuillet_discovered', 'feuillet_presented')
      ORDER BY id ASC`,
    [gameId],
  );

  for (const evt of events) {
    let payload = {};
    try {
      payload = evt.payload_json ? JSON.parse(evt.payload_json) : {};
    } catch (_) {
      payload = {};
    }
    const code = String(payload.feuilletCode || payload.feuillet_code || '').trim();
    if (code !== String(feuilletCode).trim()) continue;

    if (mode === 'once_per_game') return true;
    if (mode === 'once_per_team' && Number(evt.team_id) === Number(teamId)) return true;
  }
  return false;
}

async function canPresentFeuillet(deps, { gameId, teamId, feuilletCode, retriggerMode }) {
  const mode = normalizeMarkerQuestionRetrigger(retriggerMode);
  if (mode === 'every_arrival') return true;
  const already = await hasFeuilletEvent(deps, { gameId, teamId, feuilletCode, mode });
  return !already;
}

function resolveLoreFeuilletRetrigger(gameRow, globalSettings) {
  const gameValue = gameRow?.lore_feuillet_retrigger ?? gameRow?.loreFeuilletRetrigger ?? null;
  if (gameValue != null && String(gameValue).trim()) {
    return normalizeMarkerQuestionRetrigger(gameValue);
  }
  return normalizeMarkerQuestionRetrigger(globalSettings?.loreFeuilletRetrigger);
}

function resolveLoreBoolSetting(gameRow, gameKey, globalSettings, globalKey, defaultValue = true) {
  const gameVal = gameRow?.[gameKey];
  if (gameVal === 0 || gameVal === 1 || gameVal === true || gameVal === false) {
    return Boolean(gameVal);
  }
  const globalVal = globalSettings?.[globalKey];
  if (globalVal === 0 || globalVal === 1 || globalVal === true || globalVal === false) {
    return Boolean(globalVal);
  }
  return defaultValue;
}

module.exports = {
  PRESENT_EVENT_TYPE,
  canPresentFeuillet,
  hasFeuilletEvent,
  resolveLoreFeuilletRetrigger,
  resolveLoreBoolSetting,
};
