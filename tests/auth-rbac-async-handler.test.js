'use strict';

/**
 * Verifie (O8) que routes/auth.js et routes/rbac.js peuvent etre charges sans erreur
 * et exposent bien des routeurs Express (preuve que l'adoption d'asyncHandler est syntaxiquement correcte).
 * Aucun acces DB, aucune variable d'environnement requise.
 */
const test = require('node:test');
const assert = require('node:assert');

// --- Stubs minimaux pour les dependances qui font des appels au module load-time ---

// Evite l'acces DB au require (database.js est charge par le routeur)
const Module = require('node:module');
const _originalLoad = Module._load;
const STUBS = {
  '../database': {
    queryAll: async () => [],
    queryOne: async () => null,
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    withTransaction: async (fn) => fn({ queryOne: async () => null, execute: async () => {} }),
  },
  '../middleware/requireTeacher': {
    requireAuth: (req, res, next) => next(),
    requirePermission: () => (req, res, next) => next(),
    signAuthToken: async () => 'token',
    parseBearerToken: () => null,
    hydrateAuthFromTokenClaims: async () => null,
    JWT_SECRET: 'test-secret',
  },
  '../lib/routeLog': { logRouteError: () => {}, respondInternalError: () => {} },
  '../lib/logger': { warn: () => {}, error: () => {}, info: () => {} },
  '../lib/realtime': { emitStudentsChanged: () => {} },
  '../lib/mailer': { sendPasswordResetEmail: async () => {} },
  '../lib/passwordReset': {
    EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    PASSWORD_RESET_MIN_LEN: 8,
    createPasswordResetToken: async () => 'token',
    consumePasswordResetToken: async () => null,
    getPasswordMinLength: async () => 8,
    makeResetUrl: () => 'http://example.com/reset',
  },
  '../lib/rbac': {
    ensureRbacBootstrap: async () => {},
    buildAuthzPayload: async () => null,
    consumePendingAutoProfilePromotion: () => null,
    ensurePrimaryRole: async () => {},
    getPrimaryRoleForUser: async () => null,
    setPrimaryRole: async () => {},
    verifyRolePin: async () => false,
  },
  '../lib/settings': { getSettingValue: async () => true, getVisitMascotSettings: async () => ({ allowedIds: [] }), setSetting: async (k, v) => v },
  '../lib/studentTaskEnrollment': { countStudentActiveTaskAssignments: async () => 0, getEffectiveMaxActiveTaskAssignments: async () => 0 },
  './audit': { logAudit: () => {}, logSecurityEvent: async () => {} },
  '../lib/identity': { ensureCanonicalUserByAuth: async () => null, resolveLoginAccountByIdentifier: async () => null },
  '../lib/uploads': { saveBase64ToDisk: () => {}, deleteFile: () => {} },
  '../lib/studentAffiliation': { resolveStudentAffiliationForPersist: async () => ({ ok: true, affiliation: 'both' }) },
  '../lib/oauthPublicUrl': { resolveOAuthPublicOrigin: () => null, resolveOAuthRedirectUri: () => 'http://localhost/callback' },
  '../lib/shared/httpHelpers': { normalizeOptionalString: (v) => (typeof v === 'string' ? v.trim() || null : null) },
  // rbac-specific
  '../lib/routeLog': { logRouteError: () => {}, respondInternalError: () => {} },
  './audit': { logAudit: () => {}, logSecurityEvent: async () => {} },
};

Module._load = function patchedLoad(request, parent, isMain) {
  // Normalise la cle (retire l'extension si presente)
  const bare = request.replace(/\.js$/, '');
  if (Object.prototype.hasOwnProperty.call(STUBS, bare)) return STUBS[bare];
  if (Object.prototype.hasOwnProperty.call(STUBS, request)) return STUBS[request];
  return _originalLoad.apply(this, arguments);
};

let authRouter;
let rbacRouter;
try {
  authRouter = require('../routes/auth');
  rbacRouter = require('../routes/rbac');
} finally {
  Module._load = _originalLoad;
}

test('routes/auth.js : charge sans erreur et expose un routeur Express', () => {
  assert.ok(authRouter, 'authRouter charge');
  assert.strictEqual(typeof authRouter, 'function', 'routeur est une fonction middleware');
  // Un routeur Express expose une propriete stack
  assert.ok(Array.isArray(authRouter.stack), 'authRouter.stack est un tableau');
  // Verifie que les principales routes sont presentes
  const methods = authRouter.stack
    .filter((l) => l.route)
    .map((l) => `${Object.keys(l.route.methods).join(',').toUpperCase()} ${l.route.path}`);
  assert.ok(methods.some((m) => m.includes('/me')), 'route /me presente');
  assert.ok(methods.some((m) => m.includes('/login')), 'route /login presente');
});

test('routes/rbac.js : charge sans erreur et expose un routeur Express', () => {
  assert.ok(rbacRouter, 'rbacRouter charge');
  assert.strictEqual(typeof rbacRouter, 'function', 'routeur est une fonction middleware');
  assert.ok(Array.isArray(rbacRouter.stack), 'rbacRouter.stack est un tableau');
  const methods = rbacRouter.stack
    .filter((l) => l.route)
    .map((l) => `${Object.keys(l.route.methods).join(',').toUpperCase()} ${l.route.path}`);
  assert.ok(methods.some((m) => m.includes('/profiles')), 'route /profiles presente');
  assert.ok(methods.some((m) => m.includes('/users')), 'route /users presente');
});
