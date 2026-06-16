// O10 — helpers runtime à I/O partagés extraits de routes/gl/games.js (déplacement
// pur byte-identique). Ces fonctions à DB (readGameState, getPlayerGameMembership,
// ensurePlayerInGameClass, recordVitalityChangeEvent) et la résolution d'erreur
// roster (resolveRosterError) sont partagées par plusieurs sous-domaines de la
// route (roster, vitalité, événements, markers) : les sortir ici débloque le
// découpage futur en sous-routeurs sans import circulaire games.js↔sous-routeur.
const { queryAll, queryOne } = require('../../database');
const { normalizeEventRow, replayGameEvents } = require('../glGameEvents');
const { getGameplaySettings } = require('../glSettings');
const { parseVitalityDelta, loadVitalityForGame } = require('../glVitality');
const { loadBiomesForChapterIds } = require('../glChapterBiomes');
const { loadSpellsForChapterIds } = require('../glChapterSpells');
const { MARKER_SELECT, formatMarkerRow } = require('../glMarkerRow');
const { normalizeOptionalString } = require('../shared/httpHelpers');

async function getPlayerGameMembership(gameId, playerId) {
  return queryOne(
    `SELECT team_id
       FROM gl_team_members
      WHERE game_id = ?
        AND player_id = ?
      LIMIT 1`,
    [gameId, playerId],
  );
}

function resolveRosterError(err) {
  if (err?.status === 404) {
    if (err.message === 'TEAM_NOT_FOUND') return { status: 404, error: 'Équipe introuvable' };
    if (err.message === 'PLAYER_NOT_FOUND') return { status: 404, error: 'Joueur introuvable' };
    if (err.message === 'GAME_NOT_FOUND') return { status: 404, error: 'Partie introuvable' };
    return { status: 404, error: 'Ressource introuvable' };
  }
  if (err?.status === 409 || err?.message === 'PLAYER_CLASS_MISMATCH') {
    return { status: 409, error: 'Le joueur n’appartient pas à la classe de cette partie' };
  }
  return null;
}

async function readGameState(gameId) {
  const game = await queryOne(
    `SELECT g.id, g.class_id, g.chapter_id, g.name, g.status, g.current_team_id,
            g.zone_content_retrigger,
            g.lore_feuillet_retrigger, g.lore_effacement_enabled,
            g.lore_gemme_costs_enabled, g.lore_heart_rewards_enabled,
            g.created_by, g.created_at, g.updated_at,
            c.name AS class_name,
            ch.slug AS chapter_slug, ch.title AS chapter_title, ch.biome, ch.map_image_url,
            ch.plateau_number AS chapter_plateau_number,
            ch.story_markdown, ch.biotope_markdown, ch.biocenose_markdown, ch.sortileges_markdown
       FROM gl_games g
  LEFT JOIN gl_classes c ON c.id = g.class_id
  LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
      WHERE g.id = ?
      LIMIT 1`,
    [gameId],
  );
  if (!game) return null;

  if (game.chapter_id != null) {
    const chapterId = Number(game.chapter_id);
    const biomesMap = await loadBiomesForChapterIds({ queryAll }, [chapterId]);
    game.chapter_biomes = biomesMap.get(chapterId) || [];
    const spellsMap = await loadSpellsForChapterIds({ queryAll }, [chapterId]);
    game.chapter_spells = spellsMap.get(chapterId) || [];
  } else {
    game.chapter_biomes = [];
    game.chapter_spells = [];
  }

  const teams = await queryAll(
    `SELECT t.id, t.game_id, t.name, t.type, t.mascot_id, t.position_marker_id, t.color, t.created_at, t.updated_at,
            t.position_x_pct AS free_position_x_pct, t.position_y_pct AS free_position_y_pct,
            m.label AS position_label, m.x_pct AS marker_position_x_pct, m.y_pct AS marker_position_y_pct,
            COALESCE(t.position_x_pct, m.x_pct, 50) AS position_x_pct,
            COALESCE(t.position_y_pct, m.y_pct, 50) AS position_y_pct
       FROM gl_teams t
  LEFT JOIN gl_chapter_markers m ON m.id = t.position_marker_id
      WHERE t.game_id = ?
      ORDER BY t.id ASC`,
    [gameId],
  );
  const eventsRaw = await queryAll(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events
      WHERE game_id = ?
      ORDER BY id ASC`,
    [gameId],
  );
  const events = eventsRaw.map(normalizeEventRow);
  const markerRows = await queryAll(
    `SELECT ${MARKER_SELECT}
       FROM gl_chapter_markers
      WHERE chapter_id = ?
      ORDER BY order_index ASC, id ASC`,
    [game.chapter_id],
  );
  const markers = markerRows.map(formatMarkerRow);
  const scoreRows = await queryAll(
    'SELECT team_id, score, last_reason FROM gl_team_scores WHERE game_id = ?',
    [gameId],
  );
  const scores = {};
  for (const row of scoreRows) {
    scores[row.team_id] = { score: Number(row.score) || 0, lastReason: row.last_reason || null };
  }
  const pendingRows = await queryAll(
    `SELECT id, team_id, player_id, action_type, payload_json, created_at
       FROM gl_action_requests
      WHERE game_id = ? AND status = 'pending'
      ORDER BY id ASC`,
    [gameId],
  );
  const pendingActions = pendingRows.map((row) => {
    let payload = {};
    try {
      payload = row.payload_json ? JSON.parse(row.payload_json) : {};
    } catch (_) {
      payload = {};
    }
    return {
      id: Number(row.id),
      teamId: row.team_id != null ? Number(row.team_id) : null,
      playerId: row.player_id != null ? Number(row.player_id) : null,
      actionType: String(row.action_type || ''),
      payload,
      createdAt: row.created_at,
    };
  });
  const replay = replayGameEvents(eventsRaw, {
    gameStatus: game.status,
    currentTeamId: game.current_team_id,
    teamsById: Object.fromEntries(teams.map((team) => [team.id, team])),
    positionsByTeamId: Object.fromEntries(
      teams.map((team) => [
        Number(team.id),
        {
          markerId: team.position_marker_id != null ? Number(team.position_marker_id) : null,
          xp: team.position_x_pct != null ? Number(team.position_x_pct) : null,
          yp: team.position_y_pct != null ? Number(team.position_y_pct) : null,
        },
      ]),
    ),
    markersByTeamId: Object.fromEntries(
      teams.map((team) => [
        Number(team.id),
        team.position_marker_id != null ? Number(team.position_marker_id) : null,
      ]),
    ),
  });
  const settings = await getGameplaySettings();
  const vitality = await loadVitalityForGame(queryAll, queryOne, gameId, settings.vitalityEnabled);
  return {
    game,
    teams,
    markers,
    events,
    scores,
    pendingActions,
    replay,
    vitality,
  };
}

async function ensurePlayerInGameClass(playerId, gameId) {
  const row = await queryOne(
    `SELECT p.id
       FROM gl_players p
 INNER JOIN gl_games g ON g.class_id = p.class_id
      WHERE p.id = ? AND g.id = ?
      LIMIT 1`,
    [playerId, gameId],
  );
  if (!row) {
    const err = new Error('PLAYER_CLASS_MISMATCH');
    err.status = 409;
    throw err;
  }
}

async function recordVitalityChangeEvent(
  tx,
  { gameId, teamId, actorId, healthDelta, powerDelta, reason, results },
) {
  const payload = {
    healthDelta: parseVitalityDelta(healthDelta),
    powerDelta: parseVitalityDelta(powerDelta),
    reason: normalizeOptionalString(reason),
    results,
  };
  await tx.execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, ?, 'mj', ?, 'vitality_change', ?, NOW())`,
    [gameId, teamId, actorId, JSON.stringify(payload)],
  );
}

module.exports = {
  getPlayerGameMembership,
  resolveRosterError,
  readGameState,
  ensurePlayerInGameClass,
  recordVitalityChangeEvent,
};
