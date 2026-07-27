const { queryOne } = require('../database');
const { JWT_SECRET, parseBearerToken } = require('./requireTeacher');
const { verifyJwtForProduct } = require('../lib/auth/jwtPipeline');
const {
  GL_GUEST_USER_TYPE,
  GlAuthInfraError,
  hydrateGlAuthFromClaims,
} = require('../lib/auth/glHydration');
const logger = require('../lib/logger');

function hasGlPermission(auth, permission) {
  if (!auth) return false;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes(permission);
}

function isGlGuest(auth) {
  return auth?.userType === GL_GUEST_USER_TYPE;
}

/** Vrai si la requête est authentifiée comme MJ/Admin GL (userType gl_admin). */
function isMj(req) {
  return req?.glAuth?.userType === 'gl_admin';
}

/** Type d'acteur pour l'audit des actions de partie : 'mj' ou 'team'. */
function actorTypeOf(req) {
  return isMj(req) ? 'mj' : 'team';
}

function allowsPasswordResetRoute(req) {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (method === 'POST' && path.endsWith('/api/gl/auth/change-password')) return true;
  if (method === 'GET' && path.endsWith('/api/gl/auth/me')) return true;
  return false;
}

function passwordResetBlocked(glAuth, req) {
  return (
    glAuth.userType === 'gl_player' && glAuth.passwordMustReset && !allowsPasswordResetRoute(req)
  );
}

/**
 * Vérifie le JWT GL puis **ré-hydrate les droits depuis la base** (audit B6) : le jeton ne
 * porte plus que l'identité, jamais les permissions effectives. Une révocation de rôle, une
 * désactivation ou une suppression de compte prend donc effet à la requête suivante — même
 * contrat que `resolveAuthOrRespond` côté ForetMap.
 *
 * Ne pose aucune politique d'accès invité / reset MDP (cf. `requireGlAuth`).
 * @returns {Promise<{ ok: true, glAuth: object } | { ok: false, status: number, error: string }>}
 */
async function authenticateGl(req) {
  if (!JWT_SECRET) {
    return { ok: false, status: 503, error: 'Authentification GL non configurée' };
  }
  const token = parseBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Token requis' };

  const verified = verifyJwtForProduct(token, JWT_SECRET, 'gl');
  if (verified.error) {
    return { ok: false, status: verified.status, error: verified.error };
  }

  let glAuth;
  try {
    glAuth = await hydrateGlAuthFromClaims(verified.claims, { queryOne });
  } catch (err) {
    // Panne d'infrastructure : surtout pas un 401, qui ferait boucler les reconnexions.
    if (err instanceof GlAuthInfraError) {
      logger.error({ err: err.cause, msg: 'gl_auth_hydration_failed' }, 'Échec hydratation GL');
      return { ok: false, status: 503, error: 'Service momentanément indisponible' };
    }
    throw err;
  }
  // Compte supprimé, désactivé, ou rôle absent du catalogue : la session ne vaut plus rien.
  if (!glAuth) {
    return { ok: false, status: 401, error: 'Session expirée ou compte désactivé' };
  }
  return { ok: true, glAuth };
}

async function requireGlAuth(req, res, next) {
  let result;
  try {
    result = await authenticateGl(req);
  } catch (err) {
    return next(err);
  }
  if (!result.ok) {
    return res.status(result.status).json({ error: result.error });
  }
  req.glAuth = result.glAuth;
  if (isGlGuest(req.glAuth)) {
    return res.status(403).json({
      error: 'Compte requis pour cette ressource',
      guestBlocked: true,
    });
  }
  if (passwordResetBlocked(req.glAuth, req)) {
    return res.status(403).json({
      error: 'Mot de passe à mettre à jour avant de continuer',
      mustResetPassword: true,
    });
  }
  return next();
}

function requireGlPermission(permission) {
  return async (req, res, next) => {
    let result;
    try {
      result = await authenticateGl(req);
    } catch (err) {
      return next(err);
    }
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    req.glAuth = result.glAuth;
    if (!hasGlPermission(req.glAuth, permission)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
    }
    if (passwordResetBlocked(req.glAuth, req)) {
      return res.status(403).json({
        error: 'Mot de passe à mettre à jour avant de continuer',
        mustResetPassword: true,
      });
    }
    return next();
  };
}

module.exports = {
  requireGlAuth,
  requireGlPermission,
  hasGlPermission,
  authenticateGl,
  isGlGuest,
  isMj,
  actorTypeOf,
  GL_GUEST_USER_TYPE,
};
