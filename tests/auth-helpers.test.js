'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_DESCRIPTION_LEN,
  PSEUDO_RE,
  GOOGLE_ALLOWED_DOMAINS_DEFAULT,
  GOOGLE_ALLOWED_EMAILS_DEFAULT,
  normalizeEmail,
  detectAvatarExtension,
  parseCsvLowercaseSet,
  normalizeOAuthMode,
  googleOauthConfigured,
  splitDisplayName,
  isGoogleEmailAllowed,
  encodeOAuthPayload,
  buildOAuthFrontendRedirect,
  buildOAuthFrontendErrorRedirect,
  validateProfileInput,
  normalizeVisitMascotPreference,
  exposeAuth,
} = require('../lib/authRouteHelpers');

describe('authRouteHelpers (logique pure de routes/auth.js, sans DB)', () => {
  it('constantes inchangées', () => {
    assert.equal(MAX_DESCRIPTION_LEN, 300);
    assert.ok(PSEUDO_RE.test('abc_123.x-y'));
    assert.ok(!PSEUDO_RE.test('ab'));
    assert.ok(!PSEUDO_RE.test('a'.repeat(31)));
    assert.ok(!PSEUDO_RE.test('avec espace'));
    assert.deepEqual(GOOGLE_ALLOWED_DOMAINS_DEFAULT, ['pedagolyautey.org', 'lyceelyautey.org']);
    assert.deepEqual(GOOGLE_ALLOWED_EMAILS_DEFAULT, ['oliv.arn.lau@gmail.com']);
  });

  it('normalizeEmail : trim, minuscule, null si vide', () => {
    assert.equal(normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com');
    assert.equal(normalizeEmail(''), null);
    assert.equal(normalizeEmail('   '), null);
    assert.equal(normalizeEmail(null), null);
    assert.equal(normalizeEmail(undefined), null);
  });

  it('detectAvatarExtension : png/jpg/webp, jpeg -> jpg, sinon null', () => {
    assert.equal(detectAvatarExtension('data:image/png;base64,AAAA'), 'png');
    assert.equal(detectAvatarExtension('data:image/jpeg;base64,AAAA'), 'jpg');
    assert.equal(detectAvatarExtension('data:image/jpg;base64,AAAA'), 'jpg');
    assert.equal(detectAvatarExtension('data:image/webp;base64,AAAA'), 'webp');
    assert.equal(detectAvatarExtension('data:image/gif;base64,AAAA'), null);
    assert.equal(detectAvatarExtension('pas-une-data-url'), null);
    assert.equal(detectAvatarExtension(null), null);
    assert.equal(detectAvatarExtension(''), null);
  });

  it('parseCsvLowercaseSet : split, trim, minuscule, defaults si vide', () => {
    const s = parseCsvLowercaseSet(' A.fr , B.COM ,, c.org ');
    assert.deepEqual([...s].sort(), ['a.fr', 'b.com', 'c.org']);
    const def = parseCsvLowercaseSet('', ['X.org', ' Y.fr ']);
    assert.deepEqual([...def].sort(), ['x.org', 'y.fr']);
    const empty = parseCsvLowercaseSet('', []);
    assert.equal(empty.size, 0);
    const nullDefaults = parseCsvLowercaseSet(null, ['Z.net']);
    assert.deepEqual([...nullDefaults], ['z.net']);
  });

  it('normalizeOAuthMode : teacher exact (insensible à la casse) sinon student', () => {
    assert.equal(normalizeOAuthMode('teacher'), 'teacher');
    assert.equal(normalizeOAuthMode('TEACHER'), 'teacher');
    assert.equal(normalizeOAuthMode('student'), 'student');
    assert.equal(normalizeOAuthMode('autre'), 'student');
    assert.equal(normalizeOAuthMode(''), 'student');
    assert.equal(normalizeOAuthMode(null), 'student');
    assert.equal(normalizeOAuthMode(undefined), 'student');
  });

  it('googleOauthConfigured : exige clientId, clientSecret et redirectUri', () => {
    assert.equal(
      googleOauthConfigured({ clientId: 'a', clientSecret: 'b', redirectUri: 'c' }),
      true,
    );
    assert.equal(googleOauthConfigured({ clientId: 'a', clientSecret: 'b' }), false);
    assert.equal(googleOauthConfigured({ clientId: 'a', redirectUri: 'c' }), false);
    assert.equal(googleOauthConfigured({}), false);
    assert.equal(googleOauthConfigured(null), false);
    assert.equal(googleOauthConfigured(undefined), false);
  });

  it('splitDisplayName : prénom/nom, fallback Google Utilisateur', () => {
    assert.deepEqual(splitDisplayName('Jean Dupont'), { firstName: 'Jean', lastName: 'Dupont' });
    assert.deepEqual(splitDisplayName('Jean Pierre Dupont'), {
      firstName: 'Jean Pierre',
      lastName: 'Dupont',
    });
    assert.deepEqual(splitDisplayName('Solo'), { firstName: 'Solo', lastName: 'Utilisateur' });
    assert.deepEqual(splitDisplayName('   '), { firstName: 'Google', lastName: 'Utilisateur' });
    assert.deepEqual(splitDisplayName(null), { firstName: 'Google', lastName: 'Utilisateur' });
  });

  it('isGoogleEmailAllowed : liste blanche e-mail puis domaine puis hosted domain', () => {
    const domains = new Set(['lyceelyautey.org']);
    const emails = new Set(['admin@externe.com']);
    assert.equal(isGoogleEmailAllowed('admin@externe.com', null, domains, emails), true);
    assert.equal(isGoogleEmailAllowed('eleve@lyceelyautey.org', null, domains, emails), true);
    assert.equal(
      isGoogleEmailAllowed('eleve@lyceelyautey.org', 'lyceelyautey.org', domains, emails),
      true,
    );
    assert.equal(isGoogleEmailAllowed('intrus@gmail.com', null, domains, emails), false);
    assert.equal(isGoogleEmailAllowed('', null, domains, emails), false);
    assert.equal(isGoogleEmailAllowed(null, null, domains, emails), false);
  });

  it('encodeOAuthPayload / buildOAuthFrontendRedirect : base64url + ancre #oauth=', () => {
    const encoded = encodeOAuthPayload({ a: 1, b: 'x' });
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    assert.deepEqual(decoded, { a: 1, b: 'x' });
    const url = buildOAuthFrontendRedirect('https://app.exemple.fr/', { token: 't' });
    assert.ok(url.startsWith('https://app.exemple.fr/#oauth='));
    assert.ok(!url.includes('//#'));
    const expectedFrag = encodeURIComponent(encodeOAuthPayload({ token: 't' }));
    assert.equal(url, `https://app.exemple.fr/#oauth=${expectedFrag}`);
  });

  it('buildOAuthFrontendErrorRedirect : code et mode encodés', () => {
    assert.equal(
      buildOAuthFrontendErrorRedirect('https://app.fr///', 'oauth_invalid_state', 'teacher'),
      'https://app.fr/#oauth_error=oauth_invalid_state&mode=teacher',
    );
    assert.equal(
      buildOAuthFrontendErrorRedirect('https://app.fr', 'oauth_server_error', 'inconnu'),
      'https://app.fr/#oauth_error=oauth_server_error&mode=student',
    );
  });

  it('validateProfileInput : pseudo / email / longueur description', () => {
    assert.equal(validateProfileInput({ pseudo: null, email: null, description: null }), null);
    assert.equal(
      validateProfileInput({ pseudo: 'ok_pseudo', email: 'a@b.fr', description: 'court' }),
      null,
    );
    assert.match(validateProfileInput({ pseudo: 'x' }), /Pseudo invalide/);
    assert.match(validateProfileInput({ email: 'pas-un-email' }), /Email invalide/);
    assert.match(
      validateProfileInput({ description: 'a'.repeat(MAX_DESCRIPTION_LEN + 1) }),
      /Description trop longue/,
    );
    assert.equal(validateProfileInput({ description: 'a'.repeat(MAX_DESCRIPTION_LEN) }), null);
  });

  it('normalizeVisitMascotPreference : trim, null si vide/absent', () => {
    assert.equal(normalizeVisitMascotPreference('  mascotte-1 '), 'mascotte-1');
    assert.equal(normalizeVisitMascotPreference('   '), null);
    assert.equal(normalizeVisitMascotPreference(''), null);
    assert.equal(normalizeVisitMascotPreference(null), null);
    assert.equal(normalizeVisitMascotPreference(undefined), null);
  });

  it('exposeAuth : objet vide si auth incomplet', () => {
    assert.deepEqual(exposeAuth(null), {});
    assert.deepEqual(exposeAuth({ userType: 'student' }), {});
    assert.deepEqual(exposeAuth({ userId: 'u1' }), {});
  });

  it('exposeAuth : champs publics, jamais de secret, impersonation conditionnelle', () => {
    const base = exposeAuth({
      userType: 'teacher',
      userId: 'u1',
      canonicalUserId: 'c1',
      roleId: 7,
      roleSlug: 'prof',
      roleDisplayName: 'Prof',
      permissions: ['a.b'],
      elevated: 1,
      nativePrivileged: 0,
      password_hash: 'NE-DOIT-PAS-FUIR',
    });
    assert.deepEqual(base, {
      userType: 'teacher',
      userId: 'u1',
      canonicalUserId: 'c1',
      roleId: 7,
      roleSlug: 'prof',
      roleDisplayName: 'Prof',
      permissions: ['a.b'],
      elevated: true,
      nativePrivileged: false,
    });
    assert.equal('password_hash' in base, false);

    const imp = exposeAuth({
      userType: 'student',
      userId: 's1',
      impersonating: true,
      impersonatedBy: { userType: 'teacher', userId: 'u1', canonicalUserId: 'c1' },
    });
    assert.equal(imp.impersonating, true);
    assert.deepEqual(imp.impersonatedBy, {
      userType: 'teacher',
      userId: 'u1',
      canonicalUserId: 'c1',
    });

    // impersonating sans impersonatedBy : pas de bloc impersonation
    const noBy = exposeAuth({ userType: 'student', userId: 's1', impersonating: true });
    assert.equal('impersonating' in noBy, false);
  });
});
