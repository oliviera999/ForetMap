'use strict';

/**
 * Garde de rang « acteur → profil » — **la** règle, partagée par toutes les voies qui
 * attribuent ou font conférer un profil : attribution directe et en lot, création de compte,
 * duplication, import (`lib/rbacRoleAssignment.js`), profil par défaut d'un groupe et
 * rattachement à un groupe (`lib/groupDefaultRolePolicy.js`, `lib/groupMembers.js`).
 *
 * L'administrateur attribue tout profil. Hors administrateur, le rang visé doit être
 * **strictement inférieur** à celui de l'acteur : à rang égal, l'attribution est refusée (un
 * n3boss ne crée pas d'autre n3boss, un prof de classe pas d'autre prof de classe).
 *
 * Module sans dépendance (pur) : il est requis par des modules qui se requièrent entre eux.
 */

const { normalizeRoleSlug } = require('./shared/n3beurRolesCore');

/** Rang de l'acteur (`req.auth.roleRank`, relu en base par le middleware) ; 0 sinon. */
function actorRank(actor) {
  const r = Number(actor?.roleRank);
  return Number.isFinite(r) ? r : 0;
}

/** Vrai si l'acteur porte le profil effectif `admin`. */
function isAdminActor(actor) {
  return normalizeRoleSlug(actor?.roleSlug) === 'admin';
}

/**
 * Vrai si l'acteur peut attribuer (ou faire conférer) un profil de ce rang.
 * `actor = null` désigne le système (seed, réparation, synchronisation) : aucune garde d'acteur.
 * @param {object|null} actor `req.auth`
 * @param {number|string} rank rang du profil visé
 */
function canGrantRank(actor, rank) {
  if (!actor || isAdminActor(actor)) return true;
  const r = Number(rank);
  return Number.isFinite(r) && r < actorRank(actor);
}

const RANK_GRANT_REFUSED_ERROR = 'Vous ne pouvez attribuer qu’un profil de rang inférieur au vôtre';

module.exports = { actorRank, isAdminActor, canGrantRank, RANK_GRANT_REFUSED_ERROR };
