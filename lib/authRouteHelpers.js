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

const { detectAvatarExtension } = require('./shared/dataUrlImage');
const { normalizeOptionalString } = require('./shared/httpHelpers');
const { EMAIL_RE } = require('./passwordReset');
const { PSEUDO_RE, PSEUDO_INVALID_MSG } = require('./shared/pseudo');
// Fonctions OAuth pures partagées avec GL (déplacement byte-identique).
const {
  parseCsvLowercaseSet,
  googleOauthConfigured,
  isGoogleEmailAllowed,
} = require('./shared/oauthCommon');
const { normalizeEmail } = require('./identity');

const MAX_DESCRIPTION_LEN = 300;
const GOOGLE_ALLOWED_DOMAINS_DEFAULT = ['pedagolyautey.org', 'lyceelyautey.org'];
// Liste vide par défaut : une adresse personnelle n'a rien à faire dans le code d'un dépôt
// (elle y est publiée, et elle désigne le compte administrateur). Les dérogations hors des
// domaines de l'établissement se déclarent en environnement via GOOGLE_OAUTH_ALLOWED_EMAILS
// (CSV). Sans cette variable, seuls GOOGLE_ALLOWED_DOMAINS_DEFAULT ouvrent la connexion Google.
const GOOGLE_ALLOWED_EMAILS_DEFAULT = [];

/**
 * Modes de la connexion Google ForetMap :
 *
 * - `teacher` : console n3boss — **comptes enseignants uniquement** ;
 * - `staff` : plan des personnels (proflyautey / stafflyautey) — tout compte **existant**
 *   autorisé par `ui.staff_plan.*` ou la permission `staff_plan.access`, quel que soit son
 *   type. Le profil « Personnel » est porté par un compte de type `student`
 *   (`lib/studentRouteHelpers.js`, `userTypeForRole`) : le refuser au motif qu'il n'est pas
 *   enseignant fermait proflyautey à toute la vie scolaire ;
 * - `student` : tout le reste (défaut), seul mode où une création de compte est possible.
 */
function normalizeOAuthMode(value) {
  const mode = String(value || '').toLowerCase();
  if (mode === 'teacher') return 'teacher';
  if (mode === 'staff') return 'staff';
  return 'student';
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
    return PSEUDO_INVALID_MSG;
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
    roleId: auth.roleId,
    roleSlug: auth.roleSlug,
    roleDisplayName: auth.roleDisplayName,
    permissions: auth.permissions,
    nativePrivileged: !!auth.nativePrivileged,
    groupIds: Array.isArray(auth.groupIds) ? auth.groupIds : undefined,
  };
  // Nom du compte quand la session le porte (connexion, ré-émission) — pas le nom du profil.
  if (auth.displayName) base.displayName = auth.displayName;
  if (auth.impersonating && auth.impersonatedBy) {
    base.impersonating = true;
    base.impersonatedBy = {
      userType: auth.impersonatedBy.userType,
      userId: auth.impersonatedBy.userId,
    };
  }
  return base;
}

module.exports = {
  MAX_DESCRIPTION_LEN,
  PSEUDO_RE,
  PSEUDO_INVALID_MSG,
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
