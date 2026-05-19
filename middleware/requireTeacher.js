const jwt = require('jsonwebtoken');
const { ensureRbacBootstrap, buildAuthzPayload } = require('../lib/rbac');
const { getAuthJwtTtls } = require('../lib/settings');
const { getUserAccessibleGroupIds } = require('../lib/groupScope');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-secret-change-in-production');

function requireJwtConfigured(res) {
  if (!JWT_SECRET) {
    res.status(503).json({ error: 'Mode prof non configuré' });
    return false;
  }
  return true;
}

async function signAuthToken(payload, elevated = false) {
  const ttls = await getAuthJwtTtls();
  const ttl = elevated ? ttls.elevatedSeconds : ttls.baseSeconds;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttl });
}

function parseBearerToken(req) {
  const auth = req.headers.authorization;
  return auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function hydrateAuthFromTokenClaims(claims) {
  if (!claims || !claims.userType || claims.userId == null) return null;
  const elevated = !!claims.elevated;
  if (claims.impersonating && claims.actorUserType && claims.actorUserId != null) {
    const actorAuthz = await buildAuthzPayload(claims.actorUserType, claims.actorUserId, false);
    const actorPerms = Array.isArray(actorAuthz?.permissions) ? actorAuthz.permissions : [];
    if (!actorAuthz || !actorPerms.includes('admin.impersonate')) return null;
    const authz = await buildAuthzPayload(claims.userType, claims.userId, elevated);
    if (!authz) return null;
    const groupIds = await getUserAccessibleGroupIds({
      userId: claims.userId,
      roleSlug: authz.roleSlug,
      permissions: authz.permissions,
    });
    return {
      userType: claims.userType,
      userId: claims.userId,
      product: claims.product || 'foret',
      canonicalUserId: claims.canonicalUserId || null,
      roleId: authz.roleId,
      roleSlug: authz.roleSlug,
      roleDisplayName: authz.roleDisplayName,
      permissions: authz.permissions,
      elevatedPermissions: authz.elevatedPermissions,
      elevated,
      nativePrivileged: !!authz.nativePrivileged,
      groupIds,
      impersonating: true,
      impersonatedBy: {
        userType: claims.actorUserType,
        userId: claims.actorUserId,
        canonicalUserId: claims.actorCanonicalUserId || null,
      },
    };
  }
  const authz = await buildAuthzPayload(claims.userType, claims.userId, elevated);
  if (!authz) return null;
  const groupIds = await getUserAccessibleGroupIds({
    userId: claims.userId,
    roleSlug: authz.roleSlug,
    permissions: authz.permissions,
  });
  return {
    userType: claims.userType,
    userId: claims.userId,
    product: claims.product || 'foret',
    canonicalUserId: claims.canonicalUserId || null,
    roleId: authz.roleId,
    roleSlug: authz.roleSlug,
    roleDisplayName: authz.roleDisplayName,
    permissions: authz.permissions,
    elevatedPermissions: authz.elevatedPermissions,
    elevated,
    nativePrivileged: !!authz.nativePrivileged,
    groupIds,
  };
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
    const claims = jwt.verify(token, JWT_SECRET);
    req.auth = await hydrateAuthFromTokenClaims(claims);
  } catch (e) {
    req.auth = null;
  }
  return next();
}

async function requireAuth(req, res, next) {
  if (!requireJwtConfigured(res)) return;
  await ensureRbacBootstrap();
  const token = parseBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Token requis' });
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    req.auth = await hydrateAuthFromTokenClaims(claims);
    if (!req.auth) return res.status(403).json({ error: 'Aucun profil attribué' });
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function hasPermission(auth, permissionKey, needsElevation) {
  if (!auth) return false;
  const roleSlug = String(auth.roleSlug || '').toLowerCase();
  const adminNative = !!auth.nativePrivileged || roleSlug === 'admin';
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  if (!perms.includes(permissionKey)) return false;
  if (needsElevation && !auth.elevated && !adminNative) return false;
  return true;
}

function requirePermission(permissionKey, options = {}) {
  const needsElevation = !!options.needsElevation;
  return async (req, res, next) => {
    if (!requireJwtConfigured(res)) return;
    await ensureRbacBootstrap();
    const token = parseBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Token requis' });
    try {
      const claims = jwt.verify(token, JWT_SECRET);
      req.auth = await hydrateAuthFromTokenClaims(claims);
      if (!req.auth) return res.status(403).json({ error: 'Aucun profil attribué' });
    } catch (e) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
    if (!hasPermission(req.auth, permissionKey, needsElevation)) {
      return res.status(403).json({ error: needsElevation ? 'Élévation PIN requise' : 'Permission insuffisante' });
    }
    return next();
  };
}

function requireProduct(expectedProduct) {
  const expected = String(expectedProduct || '').trim().toLowerCase();
  return async (req, res, next) => {
    if (!requireJwtConfigured(res)) return;
    await ensureRbacBootstrap();
    const token = parseBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Token requis' });
    try {
      const claims = jwt.verify(token, JWT_SECRET);
      const product = String(claims.product || 'foret').toLowerCase();
      if (product !== expected) {
        return res.status(403).json({ error: 'Session non autorisée pour ce produit' });
      }
      req.auth = await hydrateAuthFromTokenClaims(claims);
      if (!req.auth) return res.status(403).json({ error: 'Aucun profil attribué' });
      return next();
    } catch (_) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
  };
}

const requireTeacher = requirePermission('teacher.access');
const requireTeacherElevated = requirePermission('teacher.access', { needsElevation: true });

module.exports = {
  JWT_SECRET,
  parseBearerToken,
  hydrateAuthFromTokenClaims,
  authenticate,
  requireAuth,
  requirePermission,
  hasPermission,
  requireProduct,
  requireTeacher,
  requireTeacherElevated,
  signAuthToken,
};
