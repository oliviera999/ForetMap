'use strict';

/**
 * Appartenance « active » d'un joueur Gnomes & Licornes à une équipe.
 *
 * L'appartenance réelle est portée par `gl_team_members` (clé `(game_id, player_id)`) : un
 * joueur a UNE équipe PAR PARTIE. La colonne `gl_players.team_id` était un pointeur global
 * écrit à chaque affectation — préparer le chapitre N+1 pendant que le chapitre N tournait
 * écrasait donc l'équipe de la partie en cours. Ce module est le seul endroit qui décide
 * « quelle est l'équipe du joueur » hors contexte de partie explicite, avec une priorité
 * stable : partie préférée (jeton / requête) > live > paused > draft > ended, puis la partie
 * la plus récemment modifiée.
 *
 * La colonne `gl_players.team_id` n'est plus ni écrite ni lue par l'application (conservée
 * en base pour ne pas imposer une migration destructive ; suppression notée en suivi).
 */

const database = require('../database');

/**
 * Sous-requête corrélée (alias `p` = `gl_players`) : équipe active d'un joueur, sans partie
 * préférée. À insérer dans une liste `SELECT` ; ne consomme aucun paramètre.
 */
const ACTIVE_TEAM_ID_SUBQUERY_SQL = `(
  SELECT tm.team_id
    FROM gl_team_members tm
    INNER JOIN gl_games g ON g.id = tm.game_id
   WHERE tm.player_id = p.id
   ORDER BY
     CASE g.status WHEN 'live' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END ASC,
     g.updated_at DESC,
     tm.joined_at DESC
   LIMIT 1
)`;

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

/**
 * Appartenance active d'un joueur.
 *
 * @param {number|string} playerId
 * @param {{ preferredGameId?: number|null, preferredTeamId?: number|null, queryOne?: Function }} [options]
 *   `queryOne` permet l'injection (tests, hydratation d'auth) ; défaut : pool `database.js`.
 * @returns {Promise<{ gameId: number|null, teamId: number|null, gameStatus: string|null }|null>}
 */
async function resolveGlPlayerActiveMembership(playerId, options = {}) {
  const id = toPositiveInt(playerId);
  if (!id) return null;
  const queryOne = typeof options.queryOne === 'function' ? options.queryOne : database.queryOne;
  const preferredGame = toPositiveInt(options.preferredGameId) ?? -1;
  const preferredTeam = toPositiveInt(options.preferredTeamId) ?? -1;
  const membership = await queryOne(
    `SELECT tm.game_id, tm.team_id, g.status
       FROM gl_team_members tm
 INNER JOIN gl_games g ON g.id = tm.game_id
      WHERE tm.player_id = ?
      ORDER BY
        CASE WHEN tm.game_id = ? THEN 0 ELSE 1 END ASC,
        CASE g.status
          WHEN 'live' THEN 0
          WHEN 'paused' THEN 1
          WHEN 'draft' THEN 2
          ELSE 3
        END ASC,
        CASE WHEN tm.team_id = ? THEN 0 ELSE 1 END ASC,
        g.updated_at DESC,
        tm.joined_at DESC
      LIMIT 1`,
    [id, preferredGame, preferredTeam],
  );
  if (!membership) return null;
  return {
    gameId: membership.game_id != null ? Number(membership.game_id) : null,
    teamId: membership.team_id != null ? Number(membership.team_id) : null,
    gameStatus: membership.status != null ? String(membership.status) : null,
  };
}

/**
 * Équipe d'un joueur DANS une partie donnée (scopé strictement, sans repli).
 * @returns {Promise<number|null>}
 */
async function resolveGlPlayerTeamIdForGame(playerId, gameId, options = {}) {
  const pid = toPositiveInt(playerId);
  const gid = toPositiveInt(gameId);
  if (!pid || !gid) return null;
  const queryOne = typeof options.queryOne === 'function' ? options.queryOne : database.queryOne;
  const row = await queryOne(
    'SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
    [gid, pid],
  );
  return row?.team_id != null ? Number(row.team_id) : null;
}

module.exports = {
  ACTIVE_TEAM_ID_SUBQUERY_SQL,
  resolveGlPlayerActiveMembership,
  resolveGlPlayerTeamIdForGame,
};
