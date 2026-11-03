'use strict';

/**
 * Authentification des requêtes `/mcp` par jeton d'accès OAuth du connecteur.
 *
 * - seuls les jetons opaques `fmcp_at_…` émis par `/oauth/token` sont admis ; un JWT
 *   applicatif (session ForetMap ou G&L) est refusé (`invalid_token`) — et réciproquement,
 *   `rejectMcpTokensOnApi` refuse un jeton MCP sur `/api/*` ;
 * - le jeton doit viser cette ressource (`resource` = `<base>/mcp`, RFC 8707) ;
 * - le compte est **revérifié à chaque requête** : actif, porteur de `mcp.use`. Une permission
 *   retirée ou un compte désactivé coupe l'accès immédiatement, sans attendre l'expiration ;
 * - les portées effectives sont l'intersection des portées du jeton et de ce que les
 *   permissions **actuelles** autorisent (`foretmap.write` exige `mcp.write`).
 */

const { queryOne } = require('../../../database');
const { buildAuthzPayload } = require('../../rbac');
const { parseBearerToken } = require('../../auth/jwtPipeline');
const { SCOPES, resolvePublicBaseUrl } = require('../config');
const store = require('./store');

function protectedResourceMetadataUrl(req) {
  return `${resolvePublicBaseUrl(req)}/.well-known/oauth-protected-resource/mcp`;
}

function mcpResourceUrl(req) {
  return `${resolvePublicBaseUrl(req)}/mcp`;
}

/** En-tête de défi RFC 6750 / RFC 9728. */
function buildWwwAuthenticate(req, failure = {}) {
  const parts = [];
  if (failure.error && failure.error !== 'unauthorized') parts.push(`error="${failure.error}"`);
  if (failure.description) {
    parts.push(`error_description="${String(failure.description).replace(/"/g, "'")}"`);
  }
  parts.push(`resource_metadata="${protectedResourceMetadataUrl(req)}"`);
  parts.push(`scope="${SCOPES.READ} ${SCOPES.WRITE}"`);
  return `Bearer ${parts.join(', ')}`;
}

/**
 * Profil RBAC d'un compte (même résolution du type qu'à la connexion : rôle principal
 * d'abord, `users.user_type` ensuite).
 * @returns {Promise<{ userType: string, permissions: string[], roleSlug: string, roleRank: number } | null>}
 */
async function resolveAccountAuthz(userId) {
  const account = await queryOne(
    'SELECT id, user_type, is_active FROM users WHERE id = ? LIMIT 1',
    [String(userId)],
  );
  if (!account || (account.is_active != null && !Number(account.is_active))) return null;
  const primary = await queryOne(
    `SELECT ur.user_type FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND ur.is_primary = 1 ORDER BY r.\`rank\` DESC LIMIT 1`,
    [account.id],
  );
  const candidates = [
    primary?.user_type,
    account.user_type,
    account.user_type === 'teacher' ? 'student' : 'teacher',
  ].filter(Boolean);
  for (const userType of [...new Set(candidates)]) {
    const authz = await buildAuthzPayload(userType, account.id);
    if (authz) {
      return {
        userType,
        permissions: authz.permissions || [],
        roleSlug: authz.roleSlug,
        roleRank: authz.roleRank,
        authz,
      };
    }
  }
  return null;
}

/** Portées effectivement accordables à un compte, d'après ses permissions actuelles. */
function grantableScopes(permissions) {
  const perms = new Set(permissions || []);
  const out = new Set();
  if (perms.has('mcp.use')) out.add(SCOPES.READ);
  if (perms.has('mcp.use') && perms.has('mcp.write')) out.add(SCOPES.WRITE);
  return out;
}

/**
 * @returns {Promise<{ ok: true, userId, userType, clientId, scopes: string[], permissions: string[] }
 *   | { ok: false, status: number, error: string, description: string }>}
 */
async function authenticateMcpRequest(req) {
  const token = parseBearerToken(req);
  if (!token) {
    return { ok: false, status: 401, error: 'unauthorized', description: 'Jeton requis' };
  }
  const row = await store.findActiveAccessToken(token);
  if (!row) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
      description: 'Jeton invalide, expiré ou révoqué',
    };
  }
  // Audience explicite (RFC 8707, cf. GHSA-rvq5-wwqv-78pq) : un jeton sans ressource ou émis
  // pour une autre ressource est refusé — jamais « accepté faute de mieux ».
  if (!row.resource || row.resource !== mcpResourceUrl(req)) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
      description: 'Jeton émis pour une autre ressource',
    };
  }
  // Époque de jeton du site : un changement de mot de passe, une désactivation ou une
  // réinitialisation TOTP l'incrémente — tous les jetons MCP émis avant tombent aussitôt.
  if (Number(row.token_epoch) !== Number(row.current_epoch)) {
    await store.revokeFamily(row.family_id);
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
      description: 'Jeton révoqué (mot de passe changé ou compte désactivé)',
    };
  }
  const account = await resolveAccountAuthz(row.user_id);
  const grantable = grantableScopes(account?.permissions);
  if (!account || !grantable.has(SCOPES.READ)) {
    await store.revokeFamily(row.family_id);
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
      description: 'Accès au connecteur retiré pour ce compte',
    };
  }
  const tokenScopes = String(row.scope || '')
    .split(/\s+/)
    .filter(Boolean);
  const scopes = tokenScopes.filter((s) => grantable.has(s) || s === SCOPES.OFFLINE);
  return {
    ok: true,
    userId: String(row.user_id),
    userType: account.userType,
    clientId: row.client_id,
    scopes,
    permissions: account.permissions,
  };
}

/**
 * Garde d'isolation : un jeton du connecteur MCP n'ouvre **aucune** route `/api/*`
 * (ForetMap ou G&L). Sans cette garde il serait simplement « invalide » pour le pipeline JWT ;
 * la réponse explicite évite qu'une route à session facultative le traite en anonyme.
 */
function rejectMcpTokensOnApi(req, res, next) {
  const token = parseBearerToken(req);
  if (token && token.startsWith(store.TOKEN_PREFIX.access.slice(0, 5))) {
    return res
      .status(401)
      .json({ error: 'Jeton du connecteur MCP non valable sur cette API', code: 'MCP_TOKEN' });
  }
  return next();
}

module.exports = {
  authenticateMcpRequest,
  buildWwwAuthenticate,
  grantableScopes,
  mcpResourceUrl,
  protectedResourceMetadataUrl,
  rejectMcpTokensOnApi,
  resolveAccountAuthz,
};
