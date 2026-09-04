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

/** Surcharge explicite (tests, e2e) : identifiant d'un produit du registre, sinon `null`. */
function normalizeProductOverride(value) {
  return normalizeProductId(value);
}

/**
 * Produit servi pour une requête : header `X-Foretmap-Product` (surcharge) sinon préfixe de
 * host du registre (`lib/products.js`), sinon produit par défaut.
 * @returns {import('./products').ProductId}
 */
function resolveProductFromRequest(req) {
  const override = normalizeProductOverride(req?.get?.('x-foretmap-product'));
  if (override) return override;
  const host = normalizeHost(req?.hostname || req?.get?.('host') || '');
  return resolveProductIdFromHost(host) || DEFAULT_PRODUCT_ID;
}

module.exports = {
  resolveProductFromRequest,
  normalizeHost,
  normalizeProductOverride,
};
