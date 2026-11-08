'use strict';

/**
 * Pont API **Gnomes & Licornes** des outils de domaine `gl_*` (`lib/mcp/tools/domains/gl*.js`).
 *
 * L'API G&L (`/api/gl/*`) exige un JWT de produit `gl` (`middleware/requireGlAuth.js`) : le
 * jeton ForêtMap du pont général y est refusé, et `foretmap_api` garde son refus permanent de
 * `/api/gl/*` (isolement des produits). Les outils G&L passent donc par ce module :
 *
 * 1. la personne connectée au connecteur (compte enseignant `users`) est résolue en **staff
 *    G&L** par la même règle que la connexion MJ (`resolveGlStaffLogin`, CDG-12 : enseignant
 *    actif porteur de `teacher.access`, ligne `gl_admins` liée ou administrateur ForêtMap) ;
 *    sans accès maître du jeu → `MCP_GL_FORBIDDEN`, et aucun outil G&L n'écrit ni ne lit ;
 * 2. un JWT **éphémère** (120 s, `product: 'gl'`, `via: 'mcp'`) est signé pour ce staff ; les
 *    permissions sont, comme à chaque requête G&L, relues en base (`hydrateGlAuthFromClaims`) ;
 * 3. l'appel est injecté par le pont général (`bridgeRequest`, option `gl`), qui applique les
 *    réglages `mcp.api_bridge_*`, journalise (`mcp_api_call`) et nettoie la sortie.
 *
 * Les lectures SQL agrégées des outils G&L exigent la même résolution (`requireGlStaff`) : le
 * SQL ne contourne pas le RBAC du jeu.
 */

const { queryOne } = require('../../database');
const { McpToolError } = require('./registry');

const GL_BRIDGE_TOKEN_TTL_SECONDS = 120;

/**
 * Staff G&L de la personne connectée, ou `McpToolError` (`MCP_GL_FORBIDDEN`).
 * @returns {Promise<{ admin: object, glRole: 'admin'|'mj', claims: object }>}
 */
async function requireGlStaff(ctx) {
  const userId = String(ctx?.user?.userId || '');
  if (!userId || (ctx?.user?.userType && ctx.user.userType !== 'teacher')) {
    throw new McpToolError('Compte enseignant requis pour Gnomes & Licornes', 'MCP_GL_FORBIDDEN');
  }
  const account = await queryOne(
    `SELECT id, email, display_name FROM users WHERE id = ? AND user_type = 'teacher' AND is_active = 1 LIMIT 1`,
    [userId],
  );
  if (!account) {
    throw new McpToolError('Compte enseignant introuvable ou désactivé', 'MCP_GL_FORBIDDEN');
  }
  const { resolveGlStaffLogin, buildGlAdminClaims } = require('../glStaffAuth');
  const resolved = await resolveGlStaffLogin({
    email: account.email,
    displayName: account.display_name,
    googleSub: null,
    teacherId: account.id,
  });
  if (!resolved.ok) {
    throw new McpToolError(
      `Accès maître du jeu refusé : ${resolved.error || 'compte sans rôle G&L'}`,
      'MCP_GL_FORBIDDEN',
    );
  }
  return {
    admin: resolved.admin,
    glRole: resolved.glRole,
    claims: buildGlAdminClaims(resolved.admin, resolved.glRole),
  };
}

/** JWT G&L éphémère pour le staff résolu (époque de jeton du compte enseignant lié). */
async function signGlBridgeToken(staff) {
  const { signJwtToken } = require('../auth/jwtPipeline');
  const { JWT_SECRET } = require('../../middleware/requireTeacher');
  const { getUserTokenEpoch, resolveUserIdForGlClaims } = require('../auth/tokenEpoch');
  if (!JWT_SECRET) throw new McpToolError('JWT_SECRET absent : pont indisponible', 'MCP_BRIDGE');
  const claims = staff.claims;
  const epochUserId = await resolveUserIdForGlClaims(claims);
  const tokenEpoch = epochUserId ? await getUserTokenEpoch(epochUserId) : 0;
  return signJwtToken({ ...claims, tokenEpoch, product: 'gl', via: 'mcp' }, JWT_SECRET, {
    expiresIn: GL_BRIDGE_TOKEN_TTL_SECONDS,
  });
}

/**
 * Appel métier d'une route G&L (`/api/gl/…`) en tant que staff G&L de la personne connectée.
 * Renvoie le JSON de la réponse ; lève `McpToolError` (`MCP_API_ERROR`, `status`) sur 4xx/5xx.
 * @param {object} ctx contexte d'outil
 * @param {string} method
 * @param {string} path chemin sous `/api/gl/`
 * @param {unknown} [body]
 * @param {{ tool?: string, query?: object, staff?: object }} [opts]
 */
async function callGlApi(ctx, method, path, body, opts = {}) {
  const staff = opts.staff || (await requireGlStaff(ctx));
  const token = await signGlBridgeToken(staff);
  const { callApi } = require('./apiBridge');
  return callApi(ctx, method, path, body, undefined, {
    tool: opts.tool,
    query: opts.query,
    gl: { token },
  });
}

/** Corps du 404 des chemins `/api` qu'aucun routeur ne sert (`lib/spaFallback.js`). */
const ROUTE_NOT_FOUND_RE = /^Route introuvable\b/i;

/**
 * Comme `callGlApi`, mais le 404 **du routeur absent** (« Route introuvable », aucun routeur
 * monté) devient `MCP_NOT_AVAILABLE` avec le message donné : la route est livrée par un autre
 * lot et manque sur ce serveur. Un 404 métier (partie ou joueur introuvable) reste tel quel.
 */
async function callGlApiOrUnavailable(ctx, method, path, body, opts = {}) {
  try {
    return await callGlApi(ctx, method, path, body, opts);
  } catch (err) {
    const routeMissing =
      err?.code === 'MCP_API_ERROR' &&
      err.status === 404 &&
      ROUTE_NOT_FOUND_RE.test(String(err.body?.error || err.message || ''));
    if (routeMissing && opts.unavailableMessage) {
      throw new McpToolError(opts.unavailableMessage, 'MCP_NOT_AVAILABLE');
    }
    throw err;
  }
}

module.exports = {
  GL_BRIDGE_TOKEN_TTL_SECONDS,
  callGlApi,
  callGlApiOrUnavailable,
  requireGlStaff,
  signGlBridgeToken,
};
