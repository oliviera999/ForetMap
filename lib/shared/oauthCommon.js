'use strict';

/**
 * Fonctions OAuth PURES partagées entre `lib/authRouteHelpers.js` (ForetMap)
 * et `lib/gl/authRouteHelpers.js` (GL). Ce module ne contient QUE de la logique
 * pure sur des chaînes / des objets de configuration Google déjà résolus :
 *   - aucun accès à un store de session (`foretmap_session` / `gl_session`),
 *   - aucun claim, jeton, secret produit, cookie ni redirection OAuth,
 *   - aucune I/O, aucun accès req/res/DB, aucun `process.env` runtime.
 *
 * Ne mutualiser ici QUE des fonctions strictement identiques dans les deux
 * produits (déplacement byte-identique, vérifié). Toute variante spécifique à
 * un produit (mode OAuth, redirections, claims, impersonation) reste locale à
 * son helper pour préserver l'isolement produit.
 *
 * `normalizeOptionalString` provient du helper HTTP neutre partagé
 * (`./httpHelpers`) — implémentation strictement identique à celle utilisée
 * jusqu'ici côté ForetMap et GL (`glProfile`).
 */

const { normalizeOptionalString } = require('./httpHelpers');

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

function googleOauthConfigured(cfg) {
  return !!(cfg?.clientId && cfg?.clientSecret && cfg?.redirectUri);
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

module.exports = {
  parseCsvLowercaseSet,
  googleOauthConfigured,
  isGoogleEmailAllowed,
};
