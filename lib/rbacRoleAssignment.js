'use strict';

/**
 * Attribution du profil d'un compte — **une** garde, **une** écriture, pour toutes les voies.
 *
 * Attribution unitaire, en lot, création de compte, import de fichier, synchronisation
 * Moodle : toutes passent par `assignRole`. Les règles ne sont donc écrites qu'ici
 * (docs/AUDIT_COMPTES_DROITS_GROUPES_2026-09-18.md, CDG-06 et CDG-43) :
 *
 *   1. un profil du jeu Gnomes & Licornes (`gl_*`) ne s'attribue pas depuis ForetMap ;
 *   2. personne ne modifie son propre profil (un administrateur y compris : c'est un pair
 *      qui le fait) ;
 *   3. seul un administrateur attribue ou retire le profil `admin`, et touche un compte qui
 *      l'a ;
 *   4. hors administrateur, on n'attribue pas un profil de rang supérieur au sien ;
 *   5. le dernier administrateur **actif** ne se rétrograde pas.
 *
 * `actor = null` désigne le système (seed, réparation au démarrage) : aucune garde d'acteur,
 * mais toujours la garde du dernier administrateur.
 */

const { queryOne } = require('../database');
const { getPrimaryRoleForUser } = require('./rbac');
const { setAssignedRole } = require('./effectiveRole');
const { isGlRoleSlug, normalizeRoleSlug } = require('./shared/n3beurRolesCore');

/** Nombre d'administrateurs enseignants **actifs** porteurs du profil effectif `admin`. */
async function countPrimaryAdmins() {
  const row = await queryOne(
    `SELECT COUNT(*) AS c
       FROM user_roles ur
       INNER JOIN roles r ON r.id = ur.role_id
       INNER JOIN users u ON u.id = ur.user_id AND u.is_active = 1
      WHERE ur.is_primary = 1 AND ur.user_type = 'teacher' AND r.slug = 'admin'`,
  );
  return Number(row?.c || 0);
}

async function loadRole(roleId) {
  return queryOne('SELECT id, slug, display_name, `rank` FROM roles WHERE id = ? LIMIT 1', [
    roleId,
  ]);
}

function actorRank(actor) {
  const r = Number(actor?.roleRank);
  return Number.isFinite(r) ? r : 0;
}

function isAdminActor(actor) {
  return normalizeRoleSlug(actor?.roleSlug) === 'admin';
}

/**
 * Garde « acteur → profil » seule (création de compte, ligne d'import) : mêmes règles que
 * l'attribution, sans cible existante.
 * @returns {{ ok: true }|{ ok: false, status: number, error: string }}
 */
function checkRoleGrantAllowed(actor, role) {
  const targetSlug = normalizeRoleSlug(role?.slug);
  if (!role || !targetSlug) return { ok: false, status: 404, error: 'Profil introuvable' };
  if (isGlRoleSlug(targetSlug)) {
    return {
      ok: false,
      status: 400,
      error: 'Les profils Gnomes & Licornes se gèrent depuis l’administration du jeu',
    };
  }
  if (!actor) return { ok: true };
  const admin = isAdminActor(actor);
  if (!admin && targetSlug === 'admin') {
    return { ok: false, status: 403, error: 'Seul un administrateur peut créer un admin' };
  }
  if (!admin && Number(role.rank) > actorRank(actor)) {
    return {
      ok: false,
      status: 403,
      error: 'Vous ne pouvez pas attribuer un profil de rang supérieur au vôtre',
    };
  }
  return { ok: true };
}

/**
 * Vérifie qu'un acteur peut attribuer `roleId` à un compte, sans rien écrire.
 *
 * @param {object} params
 * @param {object|null} params.actor `req.auth` de l'acteur (`null` = système)
 * @param {string} params.userType 'teacher' | 'student'
 * @param {string} params.userId identifiant `users.id`
 * @param {number} [params.roleId] profil visé
 * @param {{ id?: number, slug?: string, rank?: number }} [params.nextRole] profil visé, s'il est déjà chargé
 * @returns {Promise<{ ok: true, role: object }|{ ok: false, status: number, error: string }>}
 */
async function checkRoleAssignmentAllowed({ actor = null, userType, userId, roleId, nextRole }) {
  const role = nextRole?.slug && nextRole?.id ? nextRole : await loadRole(roleId ?? nextRole?.id);
  if (!role) return { ok: false, status: 404, error: 'Profil introuvable' };
  const targetSlug = normalizeRoleSlug(role.slug);
  const grant = checkRoleGrantAllowed(actor, role);
  if (!grant.ok) return grant;
  const currentRole = await getPrimaryRoleForUser(userType, userId);
  const currentSlug = normalizeRoleSlug(currentRole?.slug);
  const assignedRow = await queryOne(
    `SELECT r.slug FROM users u LEFT JOIN roles r ON r.id = u.assigned_role_id WHERE u.id = ? LIMIT 1`,
    [String(userId)],
  );
  const assignedSlug = normalizeRoleSlug(assignedRow?.slug);
  const targetIsAdmin = targetSlug === 'admin';
  const holdsAdmin = currentSlug === 'admin' || assignedSlug === 'admin';

  if (actor) {
    const admin = isAdminActor(actor);
    if (String(actor.userId) === String(userId)) {
      return { ok: false, status: 403, error: 'Vous ne pouvez pas modifier votre propre profil' };
    }
    if (!admin && (targetIsAdmin || holdsAdmin)) {
      return {
        ok: false,
        status: 403,
        error: 'Seul un admin peut attribuer ou retirer le rôle admin',
      };
    }
  }
  const leavingAdmin = holdsAdmin && !targetIsAdmin;
  if (leavingAdmin && (await countPrimaryAdmins()) <= 1) {
    return { ok: false, status: 409, error: 'Action refusée: dernier administrateur actif' };
  }
  return { ok: true, role };
}

/**
 * Attribue le profil (profil **attribué**), après contrôle, puis recalcule le profil effectif.
 * @returns {Promise<{ ok: true, effective: object }|{ ok: false, status: number, error: string }>}
 */
async function assignRole({ actor = null, userType, userId, roleId, nextRole }) {
  const allowed = await checkRoleAssignmentAllowed({ actor, userType, userId, roleId, nextRole });
  if (!allowed.ok) return allowed;
  const effective = await setAssignedRole(userId, allowed.role.id);
  return { ok: true, role: allowed.role, effective };
}

/** Compatibilité d'appel : ancien nom de `assignRole`. */
const assignPrimaryRole = assignRole;

module.exports = {
  countPrimaryAdmins,
  checkRoleGrantAllowed,
  checkRoleAssignmentAllowed,
  assignRole,
  assignPrimaryRole,
};
