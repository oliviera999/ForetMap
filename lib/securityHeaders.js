'use strict';

/**
 * En-têtes de sécurité complémentaires — lot L de `docs/AUDIT_SECURITE_2026-09-22.md`.
 *
 * `helmet` pose déjà `nosniff`, `frameguard`, HSTS et `referrer-policy` (`server.js`), et le
 * CSP est porté par son middleware dédié (`lib/csp.js`). Restait `Permissions-Policy`, que
 * `helmet` ne pose pas : sans lui, tout ce que la plateforme sait faire reste offert à la page
 * **et à tout ce qu'elle charge**.
 *
 * Ce que la politique dit, et pourquoi chaque ligne est là :
 * - `geolocation=(self)` — la géolocalisation est une fonction du produit (« Se localiser » sur
 *   la carte et sur le plan, `src/shared/platform/useGeolocation.js`) : elle reste ouverte à la
 *   page elle-même, et refusée à toute iframe tierce ;
 * - `camera=(self)` — les champs de téléversement portent `capture="environment"`. La
 *   directive ne gouverne que `getUserMedia`, dont le code ne se sert pas, mais la restreindre
 *   à `self` plutôt qu'à rien évite de parier sur le comportement d'un navigateur futur pour
 *   une photo prise par un élève sur le terrain ;
 * - `microphone=()`, `payment=()`, `usb=()`, `midi=()`, `serial=()`, `bluetooth=()` — aucune
 *   n'est utilisée nulle part : refusées partout, y compris à la page ;
 * - `interest-cohort=()` — établissement scolaire, majorité de mineurs : la page se retire
 *   explicitement du ciblage par cohorte. La directive est obsolète sur les navigateurs
 *   récents, mais inoffensive et encore lue par d'anciens.
 *
 * Non traité ici : `CORS`. Il est déjà borné dans `server.js` (`buildCorsOptions`) — en
 * production, `origin: false` par défaut, et la liste de `FRONTEND_ORIGINS` sinon. Le boot en
 * journalise la politique effective pour qu'un opérateur la voie sans lire le code.
 */

/** Politique appliquée à toutes les réponses. */
const PERMISSIONS_POLICY = [
  'geolocation=(self)',
  'camera=(self)',
  'microphone=()',
  'payment=()',
  'usb=()',
  'midi=()',
  'serial=()',
  'bluetooth=()',
  'interest-cohort=()',
].join(', ');

/**
 * Middleware posant `Permissions-Policy`. À monter tôt, avec les autres en-têtes de sécurité,
 * pour qu'il couvre le HTML, les assets et l'API.
 * @returns {import('express').RequestHandler}
 */
function createPermissionsPolicyMiddleware() {
  return function permissionsPolicy(_req, res, next) {
    res.setHeader('Permissions-Policy', PERMISSIONS_POLICY);
    return next();
  };
}

/**
 * Décrit en une ligne la politique CORS effective, pour le journal de démarrage.
 * @param {{ origin?: unknown }} corsOptions le retour de `buildCorsOptions()`.
 * @returns {string}
 */
function describeCorsPolicy(corsOptions) {
  const origin = corsOptions ? corsOptions.origin : undefined;
  if (origin === false) return 'same-origin uniquement (aucune origine croisée autorisée)';
  if (Array.isArray(origin)) return `origines autorisées : ${origin.join(', ')}`;
  if (typeof origin === 'string' && origin) return `origine autorisée : ${origin}`;
  return 'toutes origines reflétées (hors production uniquement)';
}

module.exports = {
  PERMISSIONS_POLICY,
  createPermissionsPolicyMiddleware,
  describeCorsPolicy,
};
