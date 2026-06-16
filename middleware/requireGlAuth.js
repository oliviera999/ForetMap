const { JWT_SECRET, parseBearerToken } = require('./requireTeacher');
const { verifyJwtForProduct } = require('../lib/auth/jwtPipeline');

function hasGlPermission(auth, permission) {
  if (!auth) return false;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes(permission);
}

function allowsPasswordResetRoute(req) {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  if (method === 'POST' && path.endsWith('/api/gl/auth/change-password')) return true;
  if (method === 'GET' && path.endsWith('/api/gl/auth/me')) return true;
  return false;
}

function requireGlAuth(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: 'Authentification GL non configurée' });
  }
  const token = parseBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Token requis' });
  try {
    const verified = verifyJwtForProduct(token, JWT_SECRET, 'gl');
    if (verified.error) {
      return res.status(verified.status).json({ error: verified.error });
    }
    const claims = verified.claims;
    req.glAuth = {
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
      req.glAuth.impersonating = true;
      req.glAuth.impersonatedBy = {
        userType: String(claims.actorUserType),
        userId: String(claims.actorUserId),
        roleSlug: String(claims.actorRoleSlug || ''),
      };
    }
    if (!req.glAuth.userId) return res.status(401).json({ error: 'Token invalide' });
    if (
      req.glAuth.userType === 'gl_player' &&
      req.glAuth.passwordMustReset &&
      !allowsPasswordResetRoute(req)
    ) {
      return res.status(403).json({
        error: 'Mot de passe à mettre à jour avant de continuer',
        mustResetPassword: true,
      });
    }
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function requireGlPermission(permission) {
  return (req, res, next) => {
    requireGlAuth(req, res, () => {
      if (!hasGlPermission(req.glAuth, permission)) {
        return res.status(403).json({ error: 'Permission insuffisante' });
      }
      return next();
    });
  };
}

module.exports = {
  requireGlAuth,
  requireGlPermission,
  hasGlPermission,
};
