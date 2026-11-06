'use strict';

/**
 * Instance ForetMap du moteur de badges générique (`lib/rewards/core/engine.js`).
 *
 * Ce qui est propre à la forêt est ici, et seulement ici :
 *  - le catalogue et les familles (`catalog.js`), les mesures (`metrics.js`) ;
 *  - le rangement : table `user_rewards`, propriétaire `user_id` ;
 *  - l'éligibilité : les familles de tâches, de projets, de savoirs, d'exploration, de
 *    reportage et du collectif vont aux élèves au profil n3beur **et à l'encadrement**
 *    (admin, prof, prof de classe) ; ni visiteurs, ni « personnel », ni le compte partagé
 *    « mode collectif ». Les badges de séance gardent leur règle historique (tout compte qui
 *    termine une séance) ;
 *  - les noms affichés dans la vitrine (`users`).
 *
 * Gnomes & Licornes créera sa propre instance (son catalogue, sa table de joueurs, ses
 * routes) : voir `docs/REWARDS_ENGINE.md`.
 */

const database = require('../../database');
const { isN3beurTierSlug, isEncadrementRoleSlug } = require('../shared/n3beurRolesCore');
const { createRewardsEngine } = require('./core/engine');
const { REWARD_CATALOGUE, REWARD_FAMILIES } = require('./catalog');
const { createMetricContext } = require('./metrics');

/**
 * Familles réservées aux comptes éligibles (élèves n3beur, encadrement). Nom historique
 * conservé : elles ne sont plus réservées aux seuls élèves depuis le 06/11/2026.
 */
const STUDENT_ONLY_FAMILIES = Object.freeze(
  new Set([
    'metiers',
    'engagement',
    'projet',
    'polyvalence',
    'exploration',
    'reportage',
    'nature',
    'temps',
    'collectif',
  ]),
);

/**
 * Le compte peut-il recevoir les badges des familles réservées ? Compte actif dont le profil
 * effectif est un palier n3beur (élève) ou un profil d'encadrement (`admin`, `prof`,
 * `prof_classe`, voir `n3beurRolesCore`). Visiteurs, « personnel », compte partagé « mode
 * collectif » et profils G&L : non.
 */
async function isRewardEligibleAccount(userId, db = database) {
  const user = await db.queryOne(
    'SELECT id, user_type, is_active FROM users WHERE id = ? LIMIT 1',
    [userId],
  );
  if (!user || Number(user.is_active) === 0) return false;
  const type = String(user.user_type);
  if (type !== 'student' && type !== 'teacher') return false;
  const { resolveEffectiveRole } = require('../effectiveRole');
  const resolved = await resolveEffectiveRole(userId);
  const role = resolved?.decision?.role;
  if (!role) return false;
  return isN3beurTierSlug(role.slug, role.rank) || isEncadrementRoleSlug(role.slug);
}

/** Nom historique (évaluateur, tests) : même règle que `isRewardEligibleAccount`. */
const isRewardEligibleStudent = isRewardEligibleAccount;

function studentLabel(row) {
  const dn = String(row.display_name || '').trim();
  if (dn) return dn;
  return `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim();
}

/** Noms des élèves actifs parmi `ids` (vitrine). */
async function loadStudentNames(ids, db = database) {
  if (!ids.length) return [];
  const rows = await db.queryAll(
    `SELECT id, first_name, last_name, display_name FROM users
      WHERE id IN (${ids.map(() => '?').join(',')}) AND user_type = 'student' AND is_active = 1`,
    ids,
  );
  return rows.map((row) => ({ id: row.id, name: studentLabel(row) }));
}

const foretRewards = createRewardsEngine({
  product: 'foret',
  catalogue: REWARD_CATALOGUE,
  families: REWARD_FAMILIES,
  store: { table: 'user_rewards', ownerColumn: 'user_id' },
  createMetricContext,
  isEligible: isRewardEligibleAccount,
  restrictedFamilies: [...STUDENT_ONLY_FAMILIES],
  loadOwnerNames: loadStudentNames,
  db: database,
});

module.exports = {
  foretRewards,
  STUDENT_ONLY_FAMILIES,
  isRewardEligibleAccount,
  isRewardEligibleStudent,
  loadStudentNames,
};
