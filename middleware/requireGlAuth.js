const jwt = require('jsonwebtoken');
const { JWT_SECRET, parseBearerToken } = require('./requireTeacher');

function hasGlPermission(auth, permission) {
  if (!auth) return false;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes(permission);
}

function requireGlAuth(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(503).json({ error: 'Authentification GL non configurée' });
  }
  const token = parseBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Token requis' });
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    if (String(claims.product || '').toLowerCase() !== 'gl') {
      return res.status(403).json({ error: 'Session non autorisée pour Gnomes & Licornes' });
    }
    req.glAuth = {
      product: 'gl',
      userType: String(claims.userType || 'gl_player'),
      userId: String(claims.userId || ''),
      roleSlug: String(claims.roleSlug || ''),
      permissions: Array.isArray(claims.permissions) ? claims.permissions : [],
      displayName: String(claims.displayName || ''),
      classId: claims.classId || null,
      teamId: claims.teamId || null,
    };
    if (!req.glAuth.userId) return res.status(401).json({ error: 'Token invalide' });
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
