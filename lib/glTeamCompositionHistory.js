'use strict';

/**
 * Historique des équipes d'une classe, au service de la composition automatique
 * (docs/GL_EQUIPES_AUTO_CONCEPTION.md § 4.1 / § 7.4).
 *
 * Tout part de `gl_team_members ⋈ gl_teams ⋈ gl_games` : aucune table nouvelle. Deux requêtes
 * constantes quelle que soit la profondeur d'historique (pas de N+1) :
 *   1. les N dernières parties de la classe qui ont des équipes ;
 *   2. les équipes et leurs membres pour ces parties.
 *
 * Le poids d'une paire décroît géométriquement avec l'ancienneté de la partie :
 * `Σ decay^rang` (rang 0 = partie la plus récente). La recette « aléatoire à mémoire » le
 * minimise ; l'indicateur de brassage s'en déduit.
 */

const database = require('../database');
const { pairKey } = require('./gl/teamComposition');

const DEFAULT_DECAY = 0.8;
const DEFAULT_MAX_GAMES = 12;

/**
 * Parties passées d'une classe (les plus récentes d'abord) avec équipes et membres.
 *
 * @param {object} params
 * @param {number} params.classId
 * @param {number|null} [params.excludeGameId]  partie en cours de composition (ignorée)
 * @param {number} [params.maxGames]  profondeur (défaut 12) ; `0` = toutes
 * @param {Function} [params.queryAll]  injection (tests)
 * @returns {Promise<Array<{ gameId, rank, status, chapterId, plateauNumber, updatedAt, teams: Array<{ teamId, name, type, color, mascotId, memberIds: number[] }> }>>}
 */
async function loadClassTeamHistory({
  classId,
  excludeGameId = null,
  maxGames = DEFAULT_MAX_GAMES,
  queryAll,
}) {
  const q = typeof queryAll === 'function' ? queryAll : database.queryAll;
  const cid = Number(classId);
  if (!Number.isFinite(cid) || cid <= 0) return [];
  const exclude = Number(excludeGameId);
  const excludeId = Number.isFinite(exclude) && exclude > 0 ? exclude : -1;
  const limit = Math.max(0, Math.trunc(Number(maxGames) || 0));

  const gameRows = await q(
    `SELECT g.id, g.status, g.chapter_id, g.updated_at, c.plateau_number
       FROM gl_games g
       LEFT JOIN gl_chapters c ON c.id = g.chapter_id
      WHERE g.class_id = ? AND g.id <> ?
        AND EXISTS (SELECT 1 FROM gl_team_members tm WHERE tm.game_id = g.id)
      ORDER BY g.id DESC
      ${limit > 0 ? 'LIMIT ?' : ''}`,
    limit > 0 ? [cid, excludeId, limit] : [cid, excludeId],
  );
  if (!gameRows.length) return [];

  const gameIds = gameRows.map((g) => Number(g.id));
  const placeholders = gameIds.map(() => '?').join(', ');
  const memberRows = await q(
    `SELECT tm.game_id, tm.team_id, tm.player_id, t.name, t.type, t.color, t.mascot_id
       FROM gl_team_members tm
       INNER JOIN gl_teams t ON t.id = tm.team_id
      WHERE tm.game_id IN (${placeholders})
      ORDER BY tm.game_id DESC, tm.team_id ASC, tm.player_id ASC`,
    gameIds,
  );

  const byGame = new Map();
  gameRows.forEach((g, rank) => {
    byGame.set(Number(g.id), {
      gameId: Number(g.id),
      rank,
      status: g.status != null ? String(g.status) : null,
      chapterId: g.chapter_id != null ? Number(g.chapter_id) : null,
      plateauNumber: g.plateau_number != null ? Number(g.plateau_number) : null,
      updatedAt: g.updated_at ?? null,
      teams: [],
      _teams: new Map(),
    });
  });
  for (const row of memberRows) {
    const game = byGame.get(Number(row.game_id));
    if (!game) continue;
    const teamId = Number(row.team_id);
    let team = game._teams.get(teamId);
    if (!team) {
      team = {
        teamId,
        name: row.name != null ? String(row.name) : null,
        type: row.type != null ? String(row.type) : null,
        color: row.color != null ? String(row.color) : null,
        mascotId: row.mascot_id != null ? String(row.mascot_id) : null,
        memberIds: [],
      };
      game._teams.set(teamId, team);
      game.teams.push(team);
    }
    team.memberIds.push(Number(row.player_id));
  }
  return [...byGame.values()].map(({ _teams, ...game }) => game);
}

/**
 * Poids des paires déjà réunies : `Map<'min-max', Σ decay^rang>`.
 * Peut être construit à partir d'un historique déjà chargé (`history`) pour éviter une
 * seconde lecture.
 */
async function loadPairHistory({
  classId,
  excludeGameId = null,
  decay = DEFAULT_DECAY,
  maxGames = DEFAULT_MAX_GAMES,
  queryAll,
  history = null,
}) {
  const games = Array.isArray(history)
    ? history
    : await loadClassTeamHistory({ classId, excludeGameId, maxGames, queryAll });
  return buildPairHistory(games, { decay });
}

/** Version pure : historique → carte des paires pondérées. */
function buildPairHistory(games, { decay = DEFAULT_DECAY } = {}) {
  const d = Number.isFinite(Number(decay)) && Number(decay) > 0 ? Number(decay) : DEFAULT_DECAY;
  const pairs = new Map();
  for (const game of Array.isArray(games) ? games : []) {
    const weight = d ** Number(game.rank || 0);
    for (const team of game.teams || []) {
      const ids = team.memberIds || [];
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const key = pairKey(ids[i], ids[j]);
          pairs.set(key, (pairs.get(key) || 0) + weight);
        }
      }
    }
  }
  return pairs;
}

/**
 * Taux de brassage cumulé d'une classe : paires distinctes déjà réunies / paires possibles
 * entre joueurs actifs. Pure : prend l'historique et la liste des joueurs actifs.
 *
 * @returns {{ rate: number|null, pairsSeen: number, pairsPossible: number, gamesCount: number }}
 */
function computeMixingRate(games, activePlayerIds) {
  const active = new Set((activePlayerIds || []).map(Number).filter(Number.isFinite));
  const n = active.size;
  const pairsPossible = (n * (n - 1)) / 2;
  const seen = new Set();
  for (const game of Array.isArray(games) ? games : []) {
    for (const team of game.teams || []) {
      const ids = (team.memberIds || []).filter((id) => active.has(Number(id)));
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) seen.add(pairKey(ids[i], ids[j]));
      }
    }
  }
  return {
    rate: pairsPossible > 0 ? seen.size / pairsPossible : null,
    pairsSeen: seen.size,
    pairsPossible,
    gamesCount: Array.isArray(games) ? games.length : 0,
  };
}

module.exports = {
  DEFAULT_DECAY,
  DEFAULT_MAX_GAMES,
  loadClassTeamHistory,
  loadPairHistory,
  buildPairHistory,
  computeMixingRate,
};
