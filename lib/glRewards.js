'use strict';

/**
 * Gnomes & Licornes — instance du moteur de badges commun (`lib/rewards/core/engine.js`,
 * `docs/REWARDS_ENGINE.md` § 2). Ce qui est propre à G&L est ici, et seulement ici :
 *  - catalogue, familles et paliers de la Trame (`glRewardsCatalog.js`) ;
 *  - mesures bornées au joueur (`glRewardsMetrics.js`) ;
 *  - rangement : table `gl_player_rewards`, propriétaire `player_id` (migration 342) ;
 *  - noms affichés dans la vitrine du prof : pseudo du joueur (`gl_players`).
 *
 * Règles communes (moteur) : `INSERT IGNORE`, jamais de retrait, palier daté, badge décerné
 * numéroté avec un mot obligatoire, vitrine triée par nom (aucun classement). Aucune
 * ressource n'est jamais créditée par un badge (règle § 1-5). Les routes vivent dans
 * `routes/gl/rewards.js` ; les crochets d'action dans `glRewardsHooks.js`.
 */

const database = require('../database');
const { createRewardsEngine } = require('./rewards/core/engine');
const {
  GL_REWARD_TIERS,
  GL_REWARD_FAMILIES,
  GL_REWARD_CATALOGUE,
  GL_MANUAL_REWARD_TYPES,
  RESERVED_REWARDS,
} = require('./glRewardsCatalog');
const { createMetricContext } = require('./glRewardsMetrics');

/** Pseudos des joueurs actifs parmi `ids` (vitrine du prof). */
async function loadPlayerNames(ids, db = database) {
  if (!ids.length) return [];
  const rows = await db.queryAll(
    `SELECT id, pseudo FROM gl_players WHERE id IN (${ids.map(() => '?').join(',')}) AND is_active = 1`,
    ids.map(Number),
  );
  return rows.map((r) => ({ id: String(r.id), name: String(r.pseudo || '').trim() || `#${r.id}` }));
}

const glRewards = createRewardsEngine({
  product: 'gl',
  catalogue: GL_REWARD_CATALOGUE,
  families: GL_REWARD_FAMILIES,
  tiers: GL_REWARD_TIERS,
  store: { table: 'gl_player_rewards', ownerColumn: 'player_id' },
  createMetricContext,
  loadOwnerNames: loadPlayerNames,
  db: database,
});

/** Membres (distincts) d'une partie. */
async function listGameMemberIds(gameId, db = database) {
  const rows = await db.queryAll(
    'SELECT DISTINCT player_id FROM gl_team_members WHERE game_id = ? ORDER BY player_id ASC',
    [gameId],
  );
  return rows.map((r) => String(r.player_id));
}

module.exports = {
  glRewards,
  GL_REWARD_TIERS,
  GL_REWARD_FAMILIES,
  GL_REWARD_CATALOGUE,
  GL_MANUAL_REWARD_TYPES,
  RESERVED_REWARDS,
  loadPlayerNames,
  listGameMemberIds,
};
