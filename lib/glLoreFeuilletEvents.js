'use strict';

const { queryOne, execute } = require('../database');
const { emitGlGameEvent } = require('./realtime');

function normalizeFeuilletEventRow(row) {
  let payload = {};
  try {
    payload = row.payload_json ? JSON.parse(row.payload_json) : {};
  } catch (_) {
    payload = {};
  }
  return {
    id: Number(row.id),
    gameId: Number(row.game_id),
    teamId: row.team_id != null ? Number(row.team_id) : null,
    actorType: row.actor_type,
    actorId: row.actor_id,
    eventType: row.event_type,
    payload,
    createdAt: row.created_at,
  };
}

async function recordFeuilletEvent(gameId, teamId, actorType, actorId, eventType, payload) {
  const result = await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [gameId, teamId, actorType, actorId, eventType, JSON.stringify(payload)],
  );
  // Relecture par insertId : le re-SELECT « dernier de la partie » pouvait, sous
  // concurrence, émettre l'événement d'une autre requête.
  const evt = await queryOne(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events WHERE id = ?`,
    [result.insertId],
  );
  if (evt) emitGlGameEvent(gameId, normalizeFeuilletEventRow(evt));
}

module.exports = {
  recordFeuilletEvent,
};
