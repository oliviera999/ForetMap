'use strict';

/**
 * En-tête `Clear-Site-Data` à la déconnexion (lot A — traceurs RGPD).
 *
 * Ne jamais émettre `"cookies"` : la directive vise tout le domaine enregistrable
 * (sous-domaines compris) et effacerait les laissez-passer des autres produits, le
 * cookie de visite anonyme et les cookies de G&L. Ne jamais émettre
 * `"executionContexts"` (rechargement forcé).
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Clear-Site-Data
 */

const SCOPES = Object.freeze(['cache', 'cache_storage']);

/**
 * @param {unknown} raw
 * @returns {'cache'|'cache_storage'}
 */
function normalizeLogoutClearSiteDataScope(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  return s === 'cache_storage' ? 'cache_storage' : 'cache';
}

/**
 * Valeur de l'en-tête `Clear-Site-Data` selon le réglage admin.
 * @param {unknown} scope
 * @returns {string}
 */
function buildClearSiteDataHeader(scope) {
  const normalized = normalizeLogoutClearSiteDataScope(scope);
  if (normalized === 'cache_storage') return '"cache", "storage"';
  return '"cache"';
}

/**
 * Pose `Clear-Site-Data` + `Cache-Control: no-store` sur la réponse.
 * @param {import('express').Response} res
 * @param {unknown} [scope]
 */
function applyClearSiteData(res, scope) {
  res.set('Cache-Control', 'no-store');
  res.set('Clear-Site-Data', buildClearSiteDataHeader(scope));
}

module.exports = {
  SCOPES,
  normalizeLogoutClearSiteDataScope,
  buildClearSiteDataHeader,
  applyClearSiteData,
};
