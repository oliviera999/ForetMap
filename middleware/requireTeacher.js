const jwt = require('jsonwebtoken');
const { ensureRbacBootstrap } = require('../lib/rbac');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-secret-change-in-production');
const ELEVATION_TTL_SECONDS = 60 * 60 * 6;
const BASE_TTL_SECONDS = 60 * 60 * 24;

function requireJwtConfigured(res) {
  if (!JWT_SECRET) {
    res.status(503).json({ error: 'Mode prof non configuré' });
    return false;
  }
  return true;
}

function signAuthToken(payload, elevated = false) {
  const ttl = elevated ? ELEVATION_TTL_SECONDS : BASE_TTL_SECONDS;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttl });
}

function parseBearerToken(req) {
  const auth = req.headers.authorization;
  return auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function authenticate(req, res, next) {
  if (!requireJwtConfigured(res)) return;
  await ensureRbacBootstrap();
  const token = parseBearerToken(req);
  if (!token) {
    req.auth = null;
    return next();
  }
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    req.auth = null;
  }
  return next();
}

function requireAuth(req, res, next) {
  if (!requireJwtConfigured(res)) return;
  const token = parseBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Token requis' });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function hasPermission(auth, permissionKey, needsElevation) {
  if (!auth) return false;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  if (!perms.includes(permissionKey)) return false;
  if (needsElevation && !auth.elevated) return false;
  return true;
}

function requirePermission(permissionKey, options = {}) {
  const needsElevation = !!options.needsElevation;
  return (req, res, next) => {
    if (!requireJwtConfigured(res)) return;
    const token = parseBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Token requis' });
    try {
      req.auth = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
    if (!hasPermission(req.auth, permissionKey, needsElevation)) {
      return res.status(403).json({ error: needsElevation ? 'Élévation PIN requise' : 'Permission insuffisante' });
    }
    return next();
  };
}

const requireTeacher = requirePermission('teacher.access');
const requireTeacherElevated = requirePermission('teacher.access', { needsElevation: true });

module.exports = {
  JWT_SECRET,
  authenticate,
  requireAuth,
  requirePermission,
  requireTeacher,
  requireTeacherElevated,
  signAuthToken,
};
