'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
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
} = require('../lib/gl/authRouteHelpers');

test('parseCsvLowercaseSet: parse, trim, lowercase, filtre les vides', () => {
  const set = parseCsvLowercaseSet(' A , b,, C ');
  assert.ok(set instanceof Set);
  assert.deepEqual([...set], ['a', 'b', 'c']);
});

test('parseCsvLowercaseSet: valeur vide -> defaults normalisés', () => {
  const set = parseCsvLowercaseSet('', ['Foo.ORG', ' bar ', '']);
  assert.deepEqual([...set], ['foo.org', 'bar']);
  assert.deepEqual([...parseCsvLowercaseSet(null, [])], []);
});

test('getGlRolePermissions: admin et mj -> permissions étendues', () => {
  const admin = getGlRolePermissions('admin');
  assert.ok(admin.includes('gl.settings.manage'));
  assert.ok(admin.includes('gl.read'));
  assert.deepEqual(getGlRolePermissions('MJ'), admin);
});

test('getGlRolePermissions: autre rôle -> permissions joueur', () => {
  assert.deepEqual(getGlRolePermissions('player'), ['gl.read', 'gl.action.request']);
  assert.deepEqual(getGlRolePermissions(null), ['gl.read', 'gl.action.request']);
});

test('exposeGlAuth: payload public de base', () => {
  const auth = exposeGlAuth({
    userType: 'gl_player',
    userId: '7',
    roleSlug: 'gl_player',
    permissions: ['gl.read'],
  });
  assert.equal(auth.product, 'gl');
  assert.equal(auth.userType, 'gl_player');
  assert.equal(auth.displayName, null);
  assert.equal(auth.passwordMustReset, false);
  assert.equal(auth.impersonating, undefined);
});

test('exposeGlAuth: ajoute impersonatedBy quand impersonating', () => {
  const auth = exposeGlAuth({
    userType: 'gl_player',
    userId: '7',
    roleSlug: 'gl_player',
    impersonating: true,
    actorUserType: 'gl_admin',
    actorUserId: 42,
    actorRoleSlug: 'gl_admin',
  });
  assert.equal(auth.impersonating, true);
  assert.deepEqual(auth.impersonatedBy, {
    userType: 'gl_admin',
    userId: '42',
    roleSlug: 'gl_admin',
  });
});

test('googleOauthConfigured: requiert clientId, clientSecret, redirectUri', () => {
  assert.equal(googleOauthConfigured({ clientId: 'a', clientSecret: 'b', redirectUri: 'c' }), true);
  assert.equal(googleOauthConfigured({ clientId: 'a', clientSecret: 'b' }), false);
  assert.equal(googleOauthConfigured(null), false);
});

test('isGoogleEmailAllowed: email explicitement autorisé', () => {
  const emails = new Set(['vip@example.com']);
  assert.equal(isGoogleEmailAllowed('vip@example.com', null, new Set(), emails), true);
});

test('isGoogleEmailAllowed: domaine autorisé', () => {
  const domains = new Set(['lyceelyautey.org']);
  assert.equal(isGoogleEmailAllowed('prof@lyceelyautey.org', null, domains, new Set()), true);
  assert.equal(isGoogleEmailAllowed('prof@other.org', null, domains, new Set()), false);
});

test('isGoogleEmailAllowed: hd doit correspondre au domaine autorisé', () => {
  const domains = new Set(['lyceelyautey.org']);
  assert.equal(
    isGoogleEmailAllowed('prof@lyceelyautey.org', 'lyceelyautey.org', domains, new Set()),
    true,
  );
  assert.equal(isGoogleEmailAllowed('', null, domains, new Set()), false);
});

test('normalizeGlOAuthMode: player/staff/auto', () => {
  assert.equal(normalizeGlOAuthMode('player'), 'player');
  assert.equal(normalizeGlOAuthMode('STAFF'), 'staff');
  assert.equal(normalizeGlOAuthMode('inconnu'), 'auto');
  assert.equal(normalizeGlOAuthMode(null), 'auto');
});

test('parseBoolJsonSetting: parse JSON booléen, fallback sinon', () => {
  assert.equal(parseBoolJsonSetting('true'), true);
  assert.equal(parseBoolJsonSetting('false'), false);
  assert.equal(parseBoolJsonSetting(null, true), true);
  assert.equal(parseBoolJsonSetting('pas-du-json', false), false);
  assert.equal(parseBoolJsonSetting('1'), false);
});

test("buildGlOAuthFrontendErrorRedirect: URL d'erreur avec mode", () => {
  assert.equal(
    buildGlOAuthFrontendErrorRedirect('https://gl.example.org/', 'oauth_invalid_state', 'player'),
    'https://gl.example.org/#oauth_error=oauth_invalid_state&oauth_mode=player',
  );
  assert.equal(
    buildGlOAuthFrontendErrorRedirect('https://gl.example.org', 'x', 'auto'),
    'https://gl.example.org/#oauth_error=x&oauth_mode=staff',
  );
});

test('canGlStaffImpersonate: gl_admin avec roleSlug autorisé', () => {
  assert.equal(canGlStaffImpersonate({ userType: 'gl_admin', roleSlug: 'gl_admin' }), true);
  assert.equal(canGlStaffImpersonate({ userType: 'gl_admin', roleSlug: 'gl_mj' }), true);
  assert.equal(canGlStaffImpersonate({ userType: 'gl_admin', roleSlug: 'autre' }), false);
  assert.equal(canGlStaffImpersonate({ userType: 'gl_player', roleSlug: 'gl_admin' }), false);
  assert.equal(
    canGlStaffImpersonate({ userType: 'gl_admin', roleSlug: 'gl_admin', impersonating: true }),
    false,
  );
  assert.equal(canGlStaffImpersonate(null), false);
});

test('GL_STAFF_IMPERSONATE_ROLE_SLUGS: contenu attendu', () => {
  assert.ok(GL_STAFF_IMPERSONATE_ROLE_SLUGS.has('gl_admin'));
  assert.ok(GL_STAFF_IMPERSONATE_ROLE_SLUGS.has('gl_mj'));
  assert.equal(GL_STAFF_IMPERSONATE_ROLE_SLUGS.size, 2);
});

test('glStaffRoleSlugToDbRole: gl_mj -> mj sinon admin', () => {
  assert.equal(glStaffRoleSlugToDbRole('gl_mj'), 'mj');
  assert.equal(glStaffRoleSlugToDbRole('GL_MJ'), 'mj');
  assert.equal(glStaffRoleSlugToDbRole('gl_admin'), 'admin');
  assert.equal(glStaffRoleSlugToDbRole(null), 'admin');
});

test('isGlStaffDbRole: admin/mj uniquement', () => {
  assert.equal(isGlStaffDbRole('admin'), true);
  assert.equal(isGlStaffDbRole('MJ'), true);
  assert.equal(isGlStaffDbRole('player'), false);
  assert.equal(isGlStaffDbRole(null), false);
});
