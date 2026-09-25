'use strict';

/**
 * Jetons de marque des pages HTML (`%BRAND_*%`) — vocabulaire UNIQUE, partagé par :
 *   - le plugin Vite `foretmap-brand-html` (`vite.config.js`), qui les substitue dans les
 *     entrées HTML au build et en développement ;
 *   - `lib/pwaRoutes.js`, qui les substitue AU SERVICE dans `offline.html` : ce fichier vit
 *     dans `public/`, que Vite copie tel quel sans passer par `transformIndexHtml`.
 *
 * Avant ce module, `public/offline.html` écrivait « ForêtMap » en dur (audit du 25/09/2026,
 * § 1.4.6) — et la même page servait de repli hors ligne à G&L, au Plan et au plan des
 * personnels. Les noms viennent de `lib/brand.js` et du registre `lib/products.js`.
 */

const { getBrand } = require('./brand');

/** Motif d'un jeton : `%BRAND_APP_NAME%`, `%BRAND_PRODUCT_LABEL%`… */
const BRAND_TOKEN_RE = /%(BRAND_[A-Z_]+)%/g;

/** Échappe une valeur destinée à du texte HTML ou à un attribut `content="…"`. */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Jetons de marque : communs à toutes les pages, plus ceux du produit quand il est connu.
 * @param {import('./products').ProductDefinition|null} [product]
 * @returns {Record<string, string>}
 */
function brandHtmlTokens(product = null) {
  const brand = getBrand();
  return {
    BRAND_APP_NAME: brand.appName,
    BRAND_APP_SHORT_NAME: brand.appShortName,
    BRAND_ORG_NAME: brand.orgName,
    BRAND_ORG_SHORT_NAME: brand.orgShortName,
    BRAND_GL_NAME: brand.glName,
    BRAND_GL_SHORT_NAME: brand.glShortName,
    ...(product
      ? {
          BRAND_PRODUCT_NAME: product.pwa.name,
          BRAND_PRODUCT_SHORT_NAME: product.pwa.shortName,
          BRAND_PRODUCT_LABEL: product.label,
          BRAND_PRODUCT_DESCRIPTION: product.pwa.description,
        }
      : {}),
  };
}

/**
 * Substitue les jetons connus (valeurs échappées). Un jeton inconnu reste tel quel : une
 * faute de frappe se voit à l'écran plutôt que de disparaître en silence.
 * @param {string} html
 * @param {Record<string, string>} tokens
 */
function renderBrandHtml(html, tokens) {
  return String(html).replace(BRAND_TOKEN_RE, (match, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? escapeHtml(tokens[key]) : match,
  );
}

module.exports = { BRAND_TOKEN_RE, brandHtmlTokens, escapeHtml, renderBrandHtml };
