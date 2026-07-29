'use strict';

/**
 * Hydratation de l'auth Gnomes & Licornes — pendant GL de
 * `hydrateAuthFromTokenClaims` (ForetMap, `middleware/requireTeacher.js`).
 *
 * Pourquoi (audit B6, docs/AUDIT_BUGS_2026-07.md) : les permissions GL étaient lues
 * **telles quelles dans le JWT**. Retirer son rôle à un MJ, désactiver un joueur ou
 * supprimer son compte restait donc sans effet jusqu'à l'expiration du jeton (90 min par
 * défaut, jusqu'à 7 jours). Côté ForetMap la révocation est immédiate, car chaque requête
 * relit les droits en base — c'est ce comportement qui est repris ici.
 *
 * Deux sources partagées avec ForetMap :
 *  - le **catalogue RBAC** (`lib/rbac.js`) : les rôles `gl_admin` / `gl_mj` / `gl_player` /
 *    `gl_observateur` y figurent déjà avec leurs permissions ; GL n'a plus sa propre copie ;
 *  - le **pipeline JWT** (`lib/auth/jwtPipeline.js`) : vérification + contrainte de produit.
 *
 * Le jeton ne sert donc plus qu'à porter l'**identité** (`userType` + `userId`) et le
 * contexte de partie ; les **droits** sont toujours recalculés.
 */

const { buildAuthzPayloadForRoleSlug } = require('../rbac');

const GL_GUEST_USER_TYPE = 'gl_guest';

/** Rôle RBAC de l'invité éphémère (aucune ligne en base : le jeton porte tout). */
const GL_GUEST_ROLE_SLUG = 'gl_observateur';

/**
 * Erreur d'infrastructure pendant l'hydratation (panne BDD…).
 * Doit donner un **503**, jamais un 401 : sinon le front déconnecte en boucle sur une
 * indisponibilité passagère (même raisonnement que `resolveAuthOrRespond` côté ForetMap).
 */
class GlAuthInfraError extends Error {
  constructor(cause) {
    super('gl_auth_hydration_failed');
    this.name = 'GlAuthInfraError';
    this.cause = cause;
  }
}

/** Identité GL courante, relue en base. `null` = compte supprimé ou désactivé. */
async function loadGlIdentity(claims, deps) {
  const { queryOne } = deps;
  const userType = String(claims?.userType || '');
  const userId = String(claims?.userId || '');
  if (!userId) return null;

  if (userType === 'gl_player') {
    const row = await queryOne(
      'SELECT id, class_id, team_id, is_active, password_must_reset FROM gl_players WHERE id = ? LIMIT 1',
      [userId],
    );
    if (!row || !Number(row.is_active)) return null;
    return {
      userType: 'gl_player',
      userId: String(row.id),
      roleSlug: 'gl_player',
      // Le rattachement classe/équipe suit la base, pas le jeton : un joueur déplacé de
      // classe ne conserve pas l'ancienne portée jusqu'à expiration.
      classId: row.class_id != null ? Number(row.class_id) : null,
      tokenTeamId: claims?.teamId != null ? Number(claims.teamId) : null,
      fallbackTeamId: row.team_id != null ? Number(row.team_id) : null,
      // Même contrat que les permissions (B6) : le drapeau « doit changer son MDP »
      // est relu en base. Sinon, après un POST /change-password réussi (DB=0), le JWT
      // conserve passwordMustReset=true et le middleware bloque toute la session.
      passwordMustReset: !!Number(row.password_must_reset || 0),
    };
  }

  if (userType === 'gl_admin') {
    const row = await queryOne(
      'SELECT id, role, display_name, is_active FROM gl_admins WHERE id = ? LIMIT 1',
      [userId],
    );
    if (!row || !Number(row.is_active)) return null;
    // Le rôle vient de la base : rétrograder un admin en MJ prend effet immédiatement.
    const isMj = String(row.role || 'admin').toLowerCase() === 'mj';
    return {
      userType: 'gl_admin',
      userId: String(row.id),
      roleSlug: isMj ? 'gl_mj' : 'gl_admin',
      displayName: row.display_name || null,
      classId: null,
    };
  }

  return null;
}

/**
 * Construit `req.glAuth` à partir de claims **déjà vérifiés**, en relisant les droits en base.
 *
 * @param {object} claims claims JWT vérifiés (produit `gl` déjà contraint)
 * @param {{ queryOne: Function }} deps injection BDD (tests)
 * @returns {Promise<object|null>} payload d'auth, ou `null` si l'identité n'est plus valide
 * @throws {GlAuthInfraError} en cas de panne d'infrastructure
 */
async function hydrateGlAuthFromClaims(claims, deps) {
  if (!claims) return null;

  const isGuest = String(claims.userType || '') === GL_GUEST_USER_TYPE;

  let identity;
  let authz;
  try {
    // L'invité n'a pas de ligne en base : son identité reste portée par le jeton, mais ses
    // permissions viennent quand même du catalogue RBAC (rôle `gl_observateur`).
    identity = isGuest
      ? {
          userType: GL_GUEST_USER_TYPE,
          userId: String(claims.userId || ''),
          roleSlug: GL_GUEST_ROLE_SLUG,
          classId: null,
        }
      : await loadGlIdentity(claims, deps);
    if (!identity) return null;
    authz = await buildAuthzPayloadForRoleSlug(identity.roleSlug, identity.userType);
  } catch (err) {
    throw new GlAuthInfraError(err);
  }
  if (!authz) return null;
  if (isGuest && !identity.userId) return null;

  const teamId =
    identity.tokenTeamId != null && Number.isFinite(identity.tokenTeamId)
      ? identity.tokenTeamId
      : (identity.fallbackTeamId ?? null);

  return {
    product: 'gl',
    userType: identity.userType,
    userId: identity.userId,
    roleSlug: authz.roleSlug,
    // TOUJOURS recalculées : le tableau `permissions` du jeton n'est plus jamais lu.
    permissions: authz.permissions,
    displayName: String(identity.displayName || claims.displayName || ''),
    classId: identity.classId ?? (claims.classId || null),
    teamId: identity.userType === 'gl_player' ? teamId : claims.teamId || null,
    gameId: claims.gameId || null,
    // Joueur : valeur base (cf. loadGlIdentity). Autres profils : claim JWT (pas de colonne).
    passwordMustReset:
      identity.userType === 'gl_player' ? !!identity.passwordMustReset : !!claims.passwordMustReset,
    ...(claims.impersonating && claims.actorUserType && claims.actorUserId != null
      ? {
          impersonating: true,
          impersonatedBy: {
            userType: String(claims.actorUserType),
            userId: String(claims.actorUserId),
            roleSlug: String(claims.actorRoleSlug || ''),
          },
        }
      : {}),
  };
}

module.exports = {
  GL_GUEST_USER_TYPE,
  GL_GUEST_ROLE_SLUG,
  GlAuthInfraError,
  loadGlIdentity,
  hydrateGlAuthFromClaims,
};
