const jwt = require('jsonwebtoken');
const {
  parseBearerToken: parseBearerTokenFromPipeline,
  verifyJwtToken,
  verifyJwtForProduct,
} = require('../lib/auth/jwtPipeline');
const { ensureRbacBootstrap, buildAuthzPayload } = require('../lib/rbac');
const { getAuthJwtTtls } = require('../lib/settings');
const { getUserAccessibleGroupIds } = require('../lib/groupScope');
const logger = require('../lib/logger');

const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production' ? null : 'dev-secret-change-in-production');

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
  return parseBearerTokenFromPipeline(req);
}

async function hydrateAuthFromTokenClaims(claims) {
  if (!claims || !claims.userType || claims.userId == null) return null;
  const elevated = !!claims.elevated;
  const impersonating = !!(
    claims.impersonating &&
    claims.actorUserType &&
    claims.actorUserId != null
  );
  if (impersonating) {
    // L'acteur (compte réel) doit détenir admin.impersonate ; ses permissions non élevées font foi.
    const actorAuthz = await buildAuthzPayload(claims.actorUserType, claims.actorUserId, false);
    const actorPerms = Array.isArray(actorAuthz?.permissions) ? actorAuthz.permissions : [];
    if (!actorAuthz || !actorPerms.includes('admin.impersonate')) return null;
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
    ...(impersonating
      ? {
          impersonating: true,
          impersonatedBy: {
            userType: claims.actorUserType,
            userId: claims.actorUserId,
            canonicalUserId: claims.actorCanonicalUserId || null,
          },
        }
      : {}),
  };
}

/**
 * Pipeline commun des middlewares stricts (requireAuth / requirePermission / requireProduct) :
 * JWT configuré → bootstrap RBAC → token Bearer requis (401) → vérification JWT
 * (contrainte produit si `product` fourni) → hydratation (403 « Aucun profil attribué »).
 * Répond soi-même en cas d'échec (mêmes statuts/messages qu'avant factorisation) et
 * retourne `null` ; sinon renseigne `req.auth` et le retourne.
 */
async function resolveAuthOrRespond(req, res, { product } = {}) {
  if (!requireJwtConfigured(res)) return null;
  await ensureRbacBootstrap();
  const token = parseBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Token requis' });
    return null;
  }
  let claims;
  try {
    if (product != null) {
      const verified = verifyJwtForProduct(token, JWT_SECRET, product);
      if (verified.error) {
        res.status(verified.status).json({ error: verified.error });
        return null;
      }
      claims = verified.claims;
    } else {
      claims = verifyJwtToken(token, JWT_SECRET);
    }
  } catch (_) {
    res.status(401).json({ error: 'Token invalide ou expiré' });
    return null;
  }
  // L'hydratation fait des requêtes SQL : une panne BDD ne doit PAS être renvoyée
  // comme « token invalide » (401 trompeur + reconnexions en boucle) mais comme 503.
  try {
    req.auth = await hydrateAuthFromTokenClaims(claims);
  } catch (err) {
    logger.error({ err, msg: 'auth_hydration_failed' }, 'Échec hydratation auth (infra)');
    res.status(503).json({ error: 'Service momentanément indisponible' });
    return null;
  }
  if (!req.auth) {
    res.status(403).json({ error: 'Aucun profil attribué' });
    return null;
  }
  return req.auth;
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
    const claims = verifyJwtToken(token, JWT_SECRET);
    req.auth = await hydrateAuthFromTokenClaims(claims);
  } catch (e) {
    req.auth = null;
  }
  return next();
}

async function requireAuth(req, res, next) {
  const auth = await resolveAuthOrRespond(req, res);
  if (!auth) return;
  next();
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
    const auth = await resolveAuthOrRespond(req, res);
    if (!auth) return;
    if (!hasPermission(auth, permissionKey, needsElevation)) {
      return res
        .status(403)
        .json({ error: needsElevation ? 'Élévation PIN requise' : 'Permission insuffisante' });
    }
    return next();
  };
}

function requireProduct(expectedProduct) {
  const expected = String(expectedProduct || '')
    .trim()
    .toLowerCase();
  return async (req, res, next) => {
    const auth = await resolveAuthOrRespond(req, res, { product: expected });
    if (!auth) return;
    return next();
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
