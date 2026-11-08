'use strict';

/**
 * Gnomes & Licornes — points d'appel de l'évaluation des badges, **hors transaction** de la
 * route et jamais bloquants (motif de `lib/rewards/hooks.js`) : l'évaluation part après
 * l'action (`setImmediate`), une panne est journalisée et la passe de nuit
 * (`lib/glRewardsBatch.js`) rattrape. Borné aux membres concernés.
 *
 *  - fouille, page trouvée / réparée, page tenue, lecture : membres présents de l'équipe ;
 *  - don au Marché, étude d'une espèce ou d'un biome : le joueur ;
 *  - sort d'aide lancé : équipe présente au tour du lancer et contributeurs au pot ;
 *  - clôture d'une partie : tous les membres ;
 *  - mission réussie, Olu corrigé : badge décerné (avec un mot par défaut) aux membres présents.
 */

const database = require('../database');
const logger = require('./logger');
const { glRewards } = require('./glRewards');
const { listPresentMembers } = require('./glTenir');

function safely(work, context) {
  return Promise.resolve()
    .then(work)
    .catch((err) => {
      logger.error({ err, ...context }, 'gl_rewards_hook_failed');
      return [];
    });
}

/**
 * Évalue des joueurs sans attendre ; renvoie une promesse résolue quand tout est passé (les
 * routes ne l'attendent pas). `families` restreint l'évaluation ; `source` date l'origine.
 * @param {Array<number|string>} playerIds
 * @param {{ families?: string[], source?: { type: string, ref?: string }, reason?: string }} [options]
 * @returns {Promise<Array<{ playerId: string, awarded: object[] }>>}
 */
function queueGlRewards(playerIds, options = {}) {
  const ids = [...new Set((playerIds || []).map((p) => String(p || '').trim()).filter(Boolean))];
  if (!ids.length) return Promise.resolve([]);
  const run = async () => {
    const awardedAll = [];
    for (const id of ids) {
      try {
        const awarded = await glRewards.evaluate(id, {
          families: options.families || null,
          source: options.source || null,
        });
        if (awarded.length) awardedAll.push({ playerId: id, awarded });
      } catch (err) {
        logger.error({ err, reason: options.reason || null }, 'gl_rewards_evaluation_failed');
      }
    }
    return awardedAll;
  };
  return new Promise((resolve) => {
    setImmediate(() => {
      run().then(resolve, () => resolve([]));
    });
  });
}

/** Membres présents d'une équipe (tour donné, absents exclus) puis évaluation. */
function queueGlRewardsForTeam(gameId, teamId, { roundNumber = 0, ...options } = {}) {
  if (!gameId || !teamId) return Promise.resolve([]);
  return safely(
    async () =>
      queueGlRewards(await listPresentMembers(database, gameId, teamId, roundNumber), {
        reason: 'team',
        ...options,
      }),
    { gameId, teamId },
  );
}

/** Tous les membres d'une partie (clôture). */
function queueGlRewardsForGame(gameId, options = {}) {
  if (!gameId) return Promise.resolve([]);
  return safely(
    async () => {
      const rows = await database.queryAll(
        'SELECT DISTINCT player_id FROM gl_team_members WHERE game_id = ?',
        [gameId],
      );
      return queueGlRewards(
        rows.map((r) => r.player_id),
        { reason: 'game', ...options },
      );
    },
    { gameId },
  );
}

/** Après un lancer de sort : équipe présente au tour du lancer + contributeurs au pot. */
function queueGlRewardsForSpellCast(gameId, draftId) {
  if (!gameId || !draftId) return Promise.resolve([]);
  return safely(
    async () => {
      const draft = await database.queryOne(
        'SELECT team_id, cast_round_number FROM gl_spell_cast_drafts WHERE id = ? AND game_id = ? LIMIT 1',
        [draftId, gameId],
      );
      if (!draft) return [];
      const present = await listPresentMembers(
        database,
        gameId,
        Number(draft.team_id),
        Number(draft.cast_round_number) || 0,
      );
      const contribs = await database.queryAll(
        'SELECT player_id FROM gl_spell_cast_contributions WHERE draft_id = ? AND (gems > 0 OR hearts > 0)',
        [draftId],
      );
      return queueGlRewards([...present, ...contribs.map((c) => c.player_id)], {
        families: ['cooperation'],
        source: { type: 'spell_cast', ref: String(draftId) },
        reason: 'spell_cast',
      });
    },
    { gameId, draftId },
  );
}

/**
 * Badge décerné aux membres présents d'une équipe (mission réussie, Olu corrigé), avec un mot
 * par défaut. Hors transaction, sans jamais faire échouer l'action du prof.
 * @returns {Promise<Array<{ playerId: number, reward: object }>>}
 */
function awardGlManualToTeam(
  gameId,
  teamId,
  { type, note, awardedBy = null, roundNumber = 0 } = {},
) {
  if (!gameId || !teamId || !type) return Promise.resolve([]);
  return safely(
    async () => {
      const members = await listPresentMembers(database, gameId, teamId, roundNumber);
      const out = [];
      for (const playerId of members) {
        try {
          const { reward } = await glRewards.awardManual({
            ownerId: String(playerId),
            type,
            note,
            awardedBy,
          });
          out.push({ playerId, reward });
        } catch (err) {
          logger.error({ err, gameId, type }, 'gl_rewards_manual_award_failed');
        }
      }
      return out;
    },
    { gameId, teamId, type },
  );
}

module.exports = {
  queueGlRewards,
  queueGlRewardsForTeam,
  queueGlRewardsForGame,
  queueGlRewardsForSpellCast,
  awardGlManualToTeam,
};
