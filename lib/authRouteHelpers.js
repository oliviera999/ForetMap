'use strict';

/**
 * Logique pure de `routes/auth.js` (O10) : constantes de validation,
 * normalisations de chaînes (e-mail, mode OAuth, préférence mascotte),
 * découpage du nom Google, contrôle de la liste blanche d'e-mails autorisés,
 * encodage / construction des redirections OAuth front-end, validation du
 * profil et exposition publique de l'objet `auth`.
 *
 * Déplacement byte-identique depuis la route — AUCUN changement de logique,
 * aucune I/O, aucun accès req/res/DB, aucun secret runtime (`process.env`).
 * Tout ce qui touche bcrypt/JWT, la base, les cookies, `process.env` ou la
 * configuration OAuth (getGoogleOauthConfig, exchangeGoogleCode,
 * verifyGoogleIdToken, makeGoogleOAuthState, readCookie) reste dans la route.
 */

const { normalizeOptionalString } = require('./shared/httpHelpers');
const { EMAIL_RE } = require('./passwordReset');

const MAX_DESCRIPTION_LEN = 300;
const PSEUDO_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const GOOGLE_ALLOWED_DOMAINS_DEFAULT = ['pedagolyautey.org', 'lyceelyautey.org'];
const GOOGLE_ALLOWED_EMAILS_DEFAULT = ['oliv.arn.lau@gmail.com'];

function normalizeEmail(value) {
  const email = normalizeOptionalString(value);
  return email ? email.toLowerCase() : null;
}

function detectAvatarExtension(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const raw = String(m[1]).toLowerCase();
  return raw === 'jpeg' ? 'jpg' : raw;
}

function parseCsvLowercaseSet(raw, defaults = []) {
  const value = String(raw || '').trim();
  if (!value) return new Set(defaults.map((v) => String(v).trim().toLowerCase()).filter(Boolean));
  return new Set(
    value
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
}

function normalizeOAuthMode(value) {
  return String(value || '').toLowerCase() === 'teacher' ? 'teacher' : 'student';
}

function googleOauthConfigured(cfg) {
  return !!(cfg?.clientId && cfg?.clientSecret && cfg?.redirectUri);
}

function splitDisplayName(name) {
  const value = normalizeOptionalString(name);
  if (!value) return { firstName: 'Google', lastName: 'Utilisateur' };
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0], lastName: 'Utilisateur' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function isGoogleEmailAllowed(email, hd, allowedDomains, allowedEmails) {
  if (!email) return false;
  if (allowedEmails.has(email)) return true;
  const domain = String(email.split('@')[1] || '').toLowerCase();
  if (domain && allowedDomains.has(domain)) return true;
  const hostedDomain = normalizeOptionalString(hd)?.toLowerCase();
  if (hostedDomain && hostedDomain === domain && allowedDomains.has(hostedDomain)) return true;
  return false;
}

function encodeOAuthPayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function buildOAuthFrontendRedirect(frontendOrigin, payload) {
  const base = String(frontendOrigin || '').replace(/\/+$/, '');
  return `${base}/#oauth=${encodeURIComponent(encodeOAuthPayload(payload))}`;
}

function buildOAuthFrontendErrorRedirect(frontendOrigin, code, mode) {
  const base = String(frontendOrigin || '').replace(/\/+$/, '');
  return `${base}/#oauth_error=${encodeURIComponent(code)}&mode=${encodeURIComponent(normalizeOAuthMode(mode))}`;
}

function validateProfileInput({ pseudo, email, description }) {
  if (pseudo != null && !PSEUDO_RE.test(pseudo)) {
    return 'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)';
  }
  if (email != null && !EMAIL_RE.test(email)) {
    return 'Email invalide';
  }
  if (description != null && description.length > MAX_DESCRIPTION_LEN) {
    return `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`;
  }
  return null;
}

function normalizeVisitMascotPreference(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function exposeAuth(auth) {
  if (!auth || auth.userType == null || auth.userId == null) {
    return {};
  }
  const base = {
    userType: auth.userType,
    userId: auth.userId,
    canonicalUserId: auth.canonicalUserId || null,
    roleId: auth.roleId,
    roleSlug: auth.roleSlug,
    roleDisplayName: auth.roleDisplayName,
    permissions: auth.permissions,
    elevated: !!auth.elevated,
    nativePrivileged: !!auth.nativePrivileged,
  };
  if (auth.impersonating && auth.impersonatedBy) {
    base.impersonating = true;
    base.impersonatedBy = {
      userType: auth.impersonatedBy.userType,
      userId: auth.impersonatedBy.userId,
      canonicalUserId: auth.impersonatedBy.canonicalUserId || null,
    };
  }
  return base;
}

module.exports = {
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
};
