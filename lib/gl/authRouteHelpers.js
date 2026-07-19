'use strict';

/**
 * Logique pure de `routes/gl/auth.js` (O10) : parsing CSV en Set normalisé,
 * mapping rôle -> permissions, construction du payload public `auth`,
 * détection de configuration OAuth, autorisation d'email Google, normalisation
 * du mode OAuth, parsing booléen JSON permissif, construction d'URL de
 * redirection d'erreur OAuth, et helpers de rôles staff (impersonation).
 * Déplacement byte-identique depuis la route — aucune I/O directe, aucun accès
 * req/res/DB/bcrypt/JWT/cookies/process.env/crypto. Les fonctions OAuth pures
 * strictement identiques à ForetMap (`parseCsvLowercaseSet`,
 * `googleOauthConfigured`, `isGoogleEmailAllowed`) sont importées du module
 * partagé `../shared/oauthCommon` puis ré-exportées sous leurs noms actuels.
 */

// Fonctions OAuth pures partagées avec ForetMap (déplacement byte-identique).
const {
  parseCsvLowercaseSet,
  googleOauthConfigured,
  isGoogleEmailAllowed,
} = require('../shared/oauthCommon');

// Doit rester aligné avec le catalogue RBAC (`lib/rbac.js`, ROLE_PERMISSIONS gl_*).
// Le MJ n'a PAS `gl.settings.manage` (réservé à l'admin) : sinon un MJ peut modifier
// les réglages globaux GL via requireGlPermission (qui ne lit que le JWT).
function getGlRolePermissions(roleSlug) {
  const role = String(roleSlug || '').toLowerCase();
  const staffBase = [
    'gl.read',
    'gl.content.manage',
    'gl.players.manage',
    'gl.game.manage',
    'gl.team.manage',
    'gl.event.emit',
    'gl.mascot.position',
  ];
  if (role === 'admin') {
    return [...staffBase, 'gl.settings.manage'];
  }
  if (role === 'mj') {
    return staffBase;
  }
  return ['gl.read', 'gl.action.request', 'gl.mascot.position'];
}

function exposeGlAuth(claims) {
  const auth = {
    product: 'gl',
    userType: claims.userType,
    userId: claims.userId,
    roleSlug: claims.roleSlug,
    displayName: claims.displayName || null,
    classId: claims.classId || null,
    teamId: claims.teamId || null,
    gameId: claims.gameId || null,
    permissions: claims.permissions || [],
    passwordMustReset: !!claims.passwordMustReset,
  };
  if (claims.impersonating && claims.actorUserType && claims.actorUserId != null) {
    auth.impersonating = true;
    auth.impersonatedBy = {
      userType: String(claims.actorUserType),
      userId: String(claims.actorUserId),
      roleSlug: String(claims.actorRoleSlug || ''),
    };
  }
  return auth;
}

function normalizeGlOAuthMode(value) {
  const raw = String(value || '').toLowerCase();
  if (raw === 'player') return 'player';
  if (raw === 'staff') return 'staff';
  return 'auto';
}

function parseBoolJsonSetting(rawValue, fallback = false) {
  try {
    if (rawValue == null) return fallback;
    return JSON.parse(String(rawValue)) === true;
  } catch (_) {
    return fallback;
  }
}

function buildGlOAuthFrontendErrorRedirect(frontendOrigin, code, mode) {
  const base = String(frontendOrigin || '').replace(/\/+$/, '');
  const modeParam =
    normalizeGlOAuthMode(mode) === 'player' ? '&oauth_mode=player' : '&oauth_mode=staff';
  return `${base}/#oauth_error=${encodeURIComponent(code)}${modeParam}`;
}

const GL_STAFF_IMPERSONATE_ROLE_SLUGS = new Set(['gl_admin', 'gl_mj']);

function canGlStaffImpersonate(auth) {
  if (!auth || auth.impersonating) return false;
  if (auth.userType !== 'gl_admin') return false;
  return GL_STAFF_IMPERSONATE_ROLE_SLUGS.has(String(auth.roleSlug || '').toLowerCase());
}

function glStaffRoleSlugToDbRole(roleSlug) {
  return String(roleSlug || '').toLowerCase() === 'gl_mj' ? 'mj' : 'admin';
}

function isGlStaffDbRole(role) {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'admin' || normalized === 'mj';
}

module.exports = {
  parseCsvLowercaseSet,
  getGlRolePermissions,
  exposeGlAuth,
  googleOauthConfigured,
  isGoogleEmailAllowed,
  normalizeGlOAuthMode,
  parseBoolJsonSetting,
  buildGlOAuthFrontendErrorRedirect,
  GL_STAFF_IMPERSONATE_ROLE_SLUGS,
  canGlStaffImpersonate,
  glStaffRoleSlugToDbRole,
  isGlStaffDbRole,
};
