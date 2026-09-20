'use strict';

/**
 * Profil par défaut d'un groupe : qui peut le régler, et avec quel profil.
 *
 * Règle d'établissement (docs/reference/foretmap/comptes-roles-et-groupes.md, « Les groupes ») :
 *   - seuls l'administrateur et le n3boss (vue globale, rang ≥ 400) règlent le profil par défaut
 *     ou l'imposition d'un groupe ; un prof de classe gère les membres, pas les profils ;
 *   - tous les profils sont proposables, sauf ceux du jeu Gnomes & Licornes (`gl_*`) ;
 *   - hors administrateur, on ne pose pas sur un groupe un profil de rang supérieur au sien —
 *     sinon un n3boss créerait un groupe « Admin » et s'y ajouterait.
 *
 * Partagé par `routes/groups.js` (formulaire), `lib/groupImport.js` (fichier) et la
 * synchronisation Moodle (politiques, réservées à l'administrateur).
 */

const { queryOne } = require('../database');
const {
  hasGlobalScopeByRole,
  isGlRoleSlug,
  normalizeRoleSlug,
} = require('./shared/n3beurRolesCore');

/** Vrai si l'acteur peut régler le profil par défaut / l'imposition d'un groupe. */
function canManageGroupDefaultRole(auth) {
  return hasGlobalScopeByRole({ slug: auth?.roleSlug, rank: auth?.roleRank });
}

/**
 * Valide un profil par défaut demandé pour un groupe.
 * @param {object|null} auth acteur (`null` = système, sans garde de rang)
 * @param {number|string|null} roleRef identifiant numérique **ou** slug du profil
 * @returns {Promise<{ ok: true, roleId: number|null, role: object|null }
 *   | { ok: false, status: number, error: string }>}
 */
async function validateGroupDefaultRole(auth, roleRef) {
  if (roleRef == null || roleRef === '') return { ok: true, roleId: null, role: null };
  const numeric = Number(roleRef);
  const role =
    Number.isFinite(numeric) && numeric > 0
      ? await queryOne('SELECT id, slug, display_name, `rank` FROM roles WHERE id = ? LIMIT 1', [
          numeric,
        ])
      : await queryOne(
          'SELECT id, slug, display_name, `rank` FROM roles WHERE slug = ? OR LOWER(display_name) = ? LIMIT 1',
          [normalizeRoleSlug(roleRef), String(roleRef).trim().toLowerCase()],
        );
  if (!role) return { ok: false, status: 400, error: 'default_role_id invalide' };
  if (isGlRoleSlug(role.slug)) {
    return {
      ok: false,
      status: 400,
      error: 'Les profils Gnomes & Licornes ne peuvent pas être conférés par un groupe',
    };
  }
  if (auth) {
    if (!canManageGroupDefaultRole(auth)) {
      return {
        ok: false,
        status: 403,
        error: 'Seuls un administrateur ou un n3boss règlent le profil par défaut d’un groupe',
      };
    }
    const actorIsAdmin = normalizeRoleSlug(auth.roleSlug) === 'admin';
    if (!actorIsAdmin && Number(role.rank) > Number(auth.roleRank || 0)) {
      return {
        ok: false,
        status: 403,
        error: 'Un groupe ne peut pas conférer un profil de rang supérieur au vôtre',
      };
    }
  }
  return { ok: true, roleId: Number(role.id), role };
}

module.exports = { canManageGroupDefaultRole, validateGroupDefaultRole };
