const jwt = require('jsonwebtoken');
const {
  parseBearerToken: parseBearerTokenFromPipeline,
  verifyJwtToken,
  verifyJwtForProduct,
} = require('../lib/auth/jwtPipeline');
const { ensureRbacBootstrap, buildAuthzPayload } = require('../lib/rbac');
const { getAuthJwtTtls } = require('../lib/settings');
const { getUserAccessibleGroupIds } = require('../lib/groupScope');

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

// Le 2ᵉ paramètre (jadis `elevated`) est conservé pour compatibilité d'appel mais ignoré :
// il n'existe plus de session « élevée », toutes les sessions utilisent la même durée de base.
async function signAuthToken(payload, _legacyElevated = false) {
  const ttls = await getAuthJwtTtls();
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttls.baseSeconds });
}

function parseBearerToken(req) {
  return parseBearerTokenFromPipeline(req);
}

async function hydrateAuthFromTokenClaims(claims) {
  if (!claims || !claims.userType || claims.userId == null) return null;
  const impersonating = !!(
    claims.impersonating &&
    claims.actorUserType &&
    claims.actorUserId != null
  );
  if (impersonating) {
    // L'acteur (compte réel) doit détenir admin.impersonate.
    const actorAuthz = await buildAuthzPayload(claims.actorUserType, claims.actorUserId);
    const actorPerms = Array.isArray(actorAuthz?.permissions) ? actorAuthz.permissions : [];
    if (!actorAuthz || !actorPerms.includes('admin.impersonate')) return null;
  }
  const authz = await buildAuthzPayload(claims.userType, claims.userId);
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
  try {
    let claims;
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
    req.auth = await hydrateAuthFromTokenClaims(claims);
  } catch (_) {
    res.status(401).json({ error: 'Token invalide ou expiré' });
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

function hasPermission(auth, permissionKey) {
  if (!auth) return false;
  const perms = Array.isArray(auth.permissions) ? auth.permissions : [];
  return perms.includes(permissionKey);
}

// `options` est conservé pour compatibilité d'appel (jadis `{ needsElevation }`) mais n'a plus
// d'effet : une permission attribuée au rôle est accordée directement.
function requirePermission(permissionKey, _options = {}) {
  return async (req, res, next) => {
    const auth = await resolveAuthOrRespond(req, res);
    if (!auth) return;
    if (!hasPermission(auth, permissionKey)) {
      return res.status(403).json({ error: 'Permission insuffisante' });
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
  signAuthToken,
};
