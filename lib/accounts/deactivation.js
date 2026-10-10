'use strict';

/**
 * Date de désactivation d'un compte (`users.deactivated_at`, migration 319).
 *
 * La désactivation d'un compte — par la synchronisation Moodle quand l'élève quitte sa cohorte,
 * ou par un administrateur — vaut **départ constaté** : la purge planifiée
 * (`scripts/retention-purge.js`) supprime le compte 12 mois après cette date. La date est donc
 * posée au PASSAGE actif → inactif (jamais reprise d'une désactivation antérieure) et effacée
 * à la réactivation.
 *
 * Tout chemin qui change `users.is_active` passe par ces fragments. Un chemin oublié n'est pas
 * dangereux : la purge rattrape les désactivations sans date (elle les date du jour de son
 * passage, ce qui ne peut que retarder la suppression) et efface la date des comptes actifs.
 */

/** Passage actif → inactif : `is_active` à 0, date de départ au moment présent. */
const DEACTIVATE_SET_SQL = 'is_active = 0, deactivated_at = NOW()';

/** Réactivation : `is_active` à 1, plus de date de départ. */
const REACTIVATE_SET_SQL = 'is_active = 1, deactivated_at = NULL';

/**
 * Fragment pour une mise à jour où `is_active` est un paramètre (formulaire d'administration).
 * Deux paramètres, dans l'ordre : la nouvelle valeur (0 ou 1), puis la transition rendue par
 * {@link activeTransition} — la date n'est réécrite qu'au passage d'un état à l'autre.
 */
const ACTIVE_STATE_SET_SQL =
  "is_active = ?, deactivated_at = CASE ? WHEN 'deactivate' THEN NOW() WHEN 'activate' THEN NULL ELSE deactivated_at END";

/**
 * Transition entre l'état courant et l'état demandé.
 * @param {number|boolean} current `is_active` actuel
 * @param {number|boolean} next `is_active` demandé
 * @returns {'deactivate'|'activate'|'none'}
 */
function activeTransition(current, next) {
  const was = Number(current) !== 0;
  const will = Number(next) !== 0;
  if (was && !will) return 'deactivate';
  if (!was && will) return 'activate';
  return 'none';
}

/**
 * Paramètres de {@link ACTIVE_STATE_SET_SQL}. Un compte qui reste (ou redevient) actif perd
 * toute date de départ ; un compte qui reste inactif garde la sienne.
 */
function activeStateParams(current, next) {
  const active = Number(next) !== 0;
  return [active ? 1 : 0, active ? 'activate' : activeTransition(current, next)];
}

module.exports = {
  DEACTIVATE_SET_SQL,
  REACTIVATE_SET_SQL,
  ACTIVE_STATE_SET_SQL,
  activeTransition,
  activeStateParams,
};
