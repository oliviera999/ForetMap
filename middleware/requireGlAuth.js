const { JWT_SECRET, parseBearerToken } = require('./requireTeacher');
const { verifyJwtForProduct } = require('../lib/auth/jwtPipeline');

const GL_GUEST_USER_TYPE = 'gl_guest';

function hasGlPermission(auth, permission) {
  if (!auth) return false;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes(permission);
}

function isGlGuest(auth) {
  return auth?.userType === GL_GUEST_USER_TYPE;
}

function allowsPasswordResetRoute(req) {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (method === 'POST' && path.endsWith('/api/gl/auth/change-password')) return true;
  if (method === 'GET' && path.endsWith('/api/gl/auth/me')) return true;
  return false;
}

function buildGlAuthFromClaims(claims) {
  const glAuth = {
    product: 'gl',
    userType: String(claims.userType || 'gl_player'),
    userId: String(claims.userId || ''),
    roleSlug: String(claims.roleSlug || ''),
    permissions: Array.isArray(claims.permissions) ? claims.permissions : [],
    displayName: String(claims.displayName || ''),
    classId: claims.classId || null,
    teamId: claims.teamId || null,
    gameId: claims.gameId || null,
    passwordMustReset: !!claims.passwordMustReset,
  };
  if (claims.impersonating && claims.actorUserType && claims.actorUserId != null) {
    glAuth.impersonating = true;
    glAuth.impersonatedBy = {
      userType: String(claims.actorUserType),
      userId: String(claims.actorUserId),
      roleSlug: String(claims.actorRoleSlug || ''),
    };
  }
  return glAuth;
}

function passwordResetBlocked(glAuth, req) {
  return (
    glAuth.userType === 'gl_player' && glAuth.passwordMustReset && !allowsPasswordResetRoute(req)
  );
}

/**
 * Vérifie le JWT GL et construit req.glAuth sans politique d'accès invité / reset MDP.
 * @returns {{ ok: true, glAuth }} | {{ ok: false, status: number, error: string }}
 */
function authenticateGl(req) {
  if (!JWT_SECRET) {
    return { ok: false, status: 503, error: 'Authentification GL non configurée' };
  }
  const token = parseBearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Token requis' };
  try {
    const verified = verifyJwtForProduct(token, JWT_SECRET, 'gl');
    if (verified.error) {
      return { ok: false, status: verified.status, error: verified.error };
    }
    const glAuth = buildGlAuthFromClaims(verified.claims);
    if (!glAuth.userId) return { ok: false, status: 401, error: 'Token invalide' };
    return { ok: true, glAuth };
  } catch (_) {
    return { ok: false, status: 401, error: 'Token invalide ou expiré' };
  }
}

function requireGlAuth(req, res, next) {
  const result = authenticateGl(req);
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
  return (req, res, next) => {
    const result = authenticateGl(req);
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
  GL_GUEST_USER_TYPE,
};
