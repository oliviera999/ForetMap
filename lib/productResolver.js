const { DEFAULT_PRODUCT_ID, normalizeProductId, resolveProductIdFromHost } = require('./products');

/**
 * Host normalisé : minuscules, sans port, sans `www.` (www.gl.olution.info doit résoudre
 * comme gl.olution.info, quel que soit le produit).
 */
function normalizeHost(host) {
  const raw = String(host || '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  const withoutPort = raw.split(':')[0];
  return withoutPort.startsWith('www.') ? withoutPort.slice(4) : withoutPort;
}

/**
 * La surcharge par en-tête `X-Foretmap-Product` n'est honorée qu'hors production — et dans le
 * harnais e2e, qui tourne volontairement en `NODE_ENV=production` sur `dist/`
 * (`E2E_DISABLE_RATE_LIMIT=1`, cf. `playwright.config.js`). Même règle que
 * `resolveSecureProductId` (`lib/surfaceAccess.js`).
 *
 * Audit ForetMap du 19/11/2026 (S7) : en production, l'en-tête choisissait encore le HTML, le
 * manifest, `/sw.js` et le favicon servis — le manifest étant public 24 h sans `Vary`, un cache
 * partagé pouvait garder la réponse d'un autre produit.
 */
function isProductOverrideAllowed() {
  return process.env.NODE_ENV !== 'production' || process.env.E2E_DISABLE_RATE_LIMIT === '1';
}

/**
 * Quand la surcharge est permise, la réponse dépend de l'en-tête : le dire aux caches
 * (`Vary`). En production, l'en-tête est ignoré, le host suffit à distinguer les produits.
 * @param {import('express').Response} res
 */
function varyOnProductOverride(res) {
  if (isProductOverrideAllowed() && res && typeof res.vary === 'function') {
    res.vary('X-Foretmap-Product');
  }
}

/** Surcharge explicite (tests, e2e) : identifiant d'un produit du registre, sinon `null`. */
function normalizeProductOverride(value) {
  return normalizeProductId(value);
}

/**
 * Produit servi pour une requête : header `X-Foretmap-Product` (surcharge, hors production
 * seulement — voir `isProductOverrideAllowed`) sinon préfixe de host du registre
 * (`lib/products.js`), sinon produit par défaut.
 * @returns {import('./products').ProductId}
 */
function resolveProductFromRequest(req) {
  if (isProductOverrideAllowed()) {
    const override = normalizeProductOverride(req?.get?.('x-foretmap-product'));
    if (override) return override;
  }
  const host = normalizeHost(req?.hostname || req?.get?.('host') || '');
  return resolveProductIdFromHost(host) || DEFAULT_PRODUCT_ID;
}

module.exports = {
  resolveProductFromRequest,
  normalizeHost,
  normalizeProductOverride,
  isProductOverrideAllowed,
  varyOnProductOverride,
};
