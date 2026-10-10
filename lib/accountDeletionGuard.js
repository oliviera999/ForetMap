'use strict';

/**
 * Garde de rang d'une suppression de compte élève (`DELETE /api/students/:id`).
 *
 * Supprimer un compte est définitif : on ne supprime qu'un compte de rang **strictement
 * inférieur** au sien. Le rang de la cible est le plus élevé de son profil **effectif** et de
 * son profil **attribué** (un groupe qui impose un profil plus bas ne masque pas un profil
 * attribué élevé). Contrairement à l'attribution, **pas d'exception pour l'administrateur** :
 * un administrateur ne supprime pas un autre administrateur par cette route. Et jamais le
 * dernier administrateur actif, quel que soit l'acteur.
 */

const { queryOne } = require('../database');
const { getPrimaryRoleForUser } = require('./rbac');
const { normalizeRoleSlug } = require('./shared/n3beurRolesCore');
const { actorRank } = require('./rankGuard');

function rankOf(role) {
  const r = Number(role?.rank);
  return Number.isFinite(r) ? r : 0;
}

/**
 * Décision pure (testable sans base).
 * @param {object} params
 * @param {object} params.actor `req.auth` de l'acteur
 * @param {string} params.targetId identifiant du compte visé
 * @param {{ slug?: string, rank?: number }|null} params.effectiveRole profil effectif de la cible
 * @param {{ slug?: string, rank?: number }|null} params.assignedRole profil attribué de la cible
 * @param {number} params.otherActiveAdmins administrateurs actifs **autres** que la cible
 * @returns {{ ok: true }|{ ok: false, status: number, error: string }}
 */
function decideAccountDeletion({
  actor,
  targetId,
  effectiveRole = null,
  assignedRole = null,
  otherActiveAdmins = 0,
}) {
  if (!actor) return { ok: false, status: 401, error: 'Authentification requise' };
  if (String(actor.userId) === String(targetId)) {
    return { ok: false, status: 403, error: 'Vous ne pouvez pas supprimer votre propre compte' };
  }
  const targetRank = Math.max(rankOf(effectiveRole), rankOf(assignedRole));
  if (targetRank >= actorRank(actor)) {
    return {
      ok: false,
      status: 403,
      error: 'Suppression réservée à un profil de rang supérieur à celui du compte visé',
    };
  }
  const holdsAdmin =
    normalizeRoleSlug(effectiveRole?.slug) === 'admin' ||
    normalizeRoleSlug(assignedRole?.slug) === 'admin';
  if (holdsAdmin && Number(otherActiveAdmins) <= 0) {
    return { ok: false, status: 409, error: 'Action refusée: dernier administrateur actif' };
  }
  return { ok: true };
}

/** Administrateurs actifs (profil effectif `admin`, tout type de compte) hors `excludedId`. */
async function countOtherActiveAdmins(excludedId) {
  const row = await queryOne(
    `SELECT COUNT(DISTINCT u.id) AS c
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id AND ur.is_primary = 1
       INNER JOIN roles r ON r.id = ur.role_id AND r.slug = 'admin'
      WHERE u.is_active = 1 AND u.id <> ?`,
    [String(excludedId)],
  );
  return Number(row?.c || 0);
}

/**
 * Garde complète pour un compte **élève** existant ; un identifiant inconnu (ou qui n'est pas
 * un élève) passe : la suppression elle-même répond 404.
 * @returns {Promise<{ ok: true }|{ ok: false, status: number, error: string }>}
 */
async function checkStudentDeletionAllowed(actor, studentId) {
  const id = String(studentId || '').trim();
  const target = await queryOne(
    `SELECT u.id, r.slug AS assigned_slug, r.\`rank\` AS assigned_rank
       FROM users u
       LEFT JOIN roles r ON r.id = u.assigned_role_id
      WHERE u.id = ? AND u.user_type = 'student'
      LIMIT 1`,
    [id],
  );
  if (!target) return { ok: true };
  const effectiveRole = await getPrimaryRoleForUser('student', id);
  const assignedRole = target.assigned_slug
    ? { slug: target.assigned_slug, rank: target.assigned_rank }
    : null;
  const holdsAdmin =
    normalizeRoleSlug(effectiveRole?.slug) === 'admin' ||
    normalizeRoleSlug(assignedRole?.slug) === 'admin';
  return decideAccountDeletion({
    actor,
    targetId: id,
    effectiveRole,
    assignedRole,
    otherActiveAdmins: holdsAdmin ? await countOtherActiveAdmins(id) : 0,
  });
}

module.exports = { decideAccountDeletion, countOtherActiveAdmins, checkStudentDeletionAllowed };
