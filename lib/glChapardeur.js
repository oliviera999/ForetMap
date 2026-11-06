'use strict';

/**
 * « Tenir à deux » v2 — le chapardeur (spec § 13). Une fois par chapitre, en phase `souffle`
 * du tour tiré à la création de l'état (2–4) : une unité de la ressource la plus abondante de
 * la bourse la plus pleine du groupe part au nid. Personne ne sait qui (payload privé) ; l'élève
 * voit une plume. La prochaine page trouvée rend le nid au membre le moins riche de l'équipe
 * découvreuse. Égalités : tirage au sort (`randomInt`).
 */

const crypto = require('node:crypto');
const { insertGameEvent } = require('./glGameEvents');
const { applyPlayerVitalityDelta, resolveVitalityCaps, clampVitality } = require('./glVitality');
const { parseJsonColumn } = require('./glTenir');

function pickRandom(list, randomInt = crypto.randomInt) {
  if (!list.length) return null;
  return list[list.length === 1 ? 0 : randomInt(0, list.length)];
}

async function chapardeurTx(
  tx,
  { gameId, roundNumber, resolved, actorId = null, randomInt = crypto.randomInt },
) {
  if (!resolved?.chapardeur) return null;
  const state = await tx.queryOne(
    'SELECT * FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1 FOR UPDATE',
    [gameId],
  );
  if (!state) return null;
  if (Number(state.chapardeur_round) !== Number(roundNumber)) return null;
  const done = await tx.queryOne(
    "SELECT id FROM gl_game_events WHERE game_id = ? AND event_type = 'chapardeur' LIMIT 1",
    [gameId],
  );
  if (done) return null;
  const members = await tx.queryAll(
    `SELECT p.id, p.health_points, p.power_points FROM gl_team_members tm
       INNER JOIN gl_players p ON p.id = tm.player_id WHERE tm.game_id = ? ORDER BY p.id ASC`,
    [gameId],
  );
  if (!members.length) return null;
  const totals = members.map((m) => ({
    id: Number(m.id),
    health: clampVitality(m.health_points),
    power: clampVitality(m.power_points),
  }));
  const maxTotal = Math.max(...totals.map((m) => m.health + m.power));
  if (maxTotal <= 0) return null;
  const richest = pickRandom(
    totals.filter((m) => m.health + m.power === maxTotal),
    randomInt,
  );
  let ressource;
  if (richest.power > richest.health) ressource = 'power';
  else if (richest.health > richest.power) ressource = 'health';
  else ressource = pickRandom(['health', 'power'], randomInt);
  await applyPlayerVitalityDelta(tx, {
    playerId: richest.id,
    healthDelta: ressource === 'health' ? -1 : 0,
    powerDelta: ressource === 'power' ? -1 : 0,
  });
  const nid = { playerId: richest.id, ressource, pris_at: new Date().toISOString() };
  await tx.execute(
    'UPDATE gl_game_tenir_state SET nid_json = ?, updated_at = NOW() WHERE game_id = ?',
    [JSON.stringify(nid), gameId],
  );
  await tx.execute(
    'UPDATE gl_game_rounds SET chapardeur_at = NOW() WHERE game_id = ? AND round_number = ?',
    [gameId, roundNumber],
  );
  const event = await insertGameEvent(tx, {
    gameId,
    actorType: 'system',
    actorId: actorId != null ? String(actorId) : null,
    eventType: 'chapardeur',
    // Jamais l'identité du chapardé : seul le numéro du tour est public.
    payload: {
      roundNumber,
      playerId: richest.id,
      ressource,
      private: true,
      publicKeys: ['roundNumber'],
    },
  });
  return { event, nid };
}

/** Le nid revient au membre le moins riche de l'équipe découvreuse (égalité → tirage). */
async function rendreNidTx(tx, { gameId, teamId, settings, randomInt = crypto.randomInt }) {
  const state = await tx.queryOne(
    'SELECT nid_json FROM gl_game_tenir_state WHERE game_id = ? LIMIT 1 FOR UPDATE',
    [gameId],
  );
  const nid = parseJsonColumn(state?.nid_json, null);
  if (!nid || !nid.ressource) return null;
  const members = await tx.queryAll(
    `SELECT p.id, p.health_points, p.power_points FROM gl_team_members tm
       INNER JOIN gl_players p ON p.id = tm.player_id WHERE tm.game_id = ? AND tm.team_id = ? ORDER BY p.id ASC`,
    [gameId, teamId],
  );
  if (!members.length) return null;
  const totals = members.map((m) => ({
    id: Number(m.id),
    total: clampVitality(m.health_points) + clampVitality(m.power_points),
  }));
  const minTotal = Math.min(...totals.map((m) => m.total));
  const poorest = pickRandom(
    totals.filter((m) => m.total === minTotal),
    randomInt,
  );
  await applyPlayerVitalityDelta(tx, {
    playerId: poorest.id,
    healthDelta: nid.ressource === 'health' ? 1 : 0,
    powerDelta: nid.ressource === 'power' ? 1 : 0,
    caps: resolveVitalityCaps(settings),
  });
  await tx.execute(
    'UPDATE gl_game_tenir_state SET nid_json = NULL, updated_at = NOW() WHERE game_id = ?',
    [gameId],
  );
  const event = await insertGameEvent(tx, {
    gameId,
    teamId,
    actorType: 'system',
    eventType: 'nid_rendu',
    payload: {
      teamId: Number(teamId),
      playerId: poorest.id,
      private: true,
      publicKeys: ['teamId'],
    },
  });
  return { event, playerId: poorest.id };
}

module.exports = { chapardeurTx, rendreNidTx, pickRandom };
