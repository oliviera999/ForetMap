'use strict';

/**
 * Hôte public pour OAuth (sans www. sur gl.* / foret*, port conservé pour le dev local).
 */
function normalizeOAuthPublicHost(hostHeader) {
  const raw = String(hostHeader || '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  const portIdx = raw.indexOf(':');
  const hostPart = portIdx >= 0 ? raw.slice(0, portIdx) : raw;
  const portPart = portIdx >= 0 ? raw.slice(portIdx) : '';
  const normalizedHost = hostPart.startsWith('www.') ? hostPart.slice(4) : hostPart;
  return `${normalizedHost}${portPart}`;
}

/**
 * Origine publique (schéma + hôte) vue par le navigateur, compatible reverse-proxy.
 */
function resolveOAuthPublicOrigin(req, envOrigin = null) {
  const fromEnv = String(envOrigin || '')
    .trim()
    .replace(/\/+$/, '');
  if (fromEnv) return fromEnv;

  const forwardedProto = String(req?.get?.('x-forwarded-proto') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const protoRaw = forwardedProto || String(req?.protocol || 'https').toLowerCase();
  const proto = protoRaw === 'http' || protoRaw === 'https' ? protoRaw : 'https';

  const host = normalizeOAuthPublicHost(req?.get?.('x-forwarded-host') || req?.get?.('host') || '');
  if (!host) return '';
  return `${proto}://${host}`;
}

/**
 * redirect_uri OAuth : variable d’environnement prioritaire, sinon dérivée de la requête.
 */
function resolveOAuthRedirectUri(req, { envRedirectUri = null, callbackPath } = {}) {
  const fromEnv = String(envRedirectUri || '').trim();
  if (fromEnv) return fromEnv;

  const origin = resolveOAuthPublicOrigin(req);
  const path = String(callbackPath || '').startsWith('/') ? callbackPath : `/${callbackPath || ''}`;
  return origin ? `${origin}${path}` : '';
}

/** Domaine parent d'un hôte (`proflyautey.olution.info` → `olution.info`). */
function parentDomain(host) {
  const labels = String(host || '')
    .split(':')[0]
    .split('.')
    .filter(Boolean);
  return labels.length <= 2 ? labels.join('.') : labels.slice(1).join('.');
}

/**
 * Origine de **retour** après le rappel OAuth.
 *
 * Google n'accepte qu'une poignée de `redirect_uri` enregistrées : le rappel arrive donc
 * toujours sur le même hôte, quel que soit le produit d'où l'utilisateur est parti. Sans
 * cette résolution, un personnel qui se connecte depuis `proflyautey.*` était renvoyé sur
 * l'origine de ForetMap, où son jeton ne lui sert à rien — le plan des personnels n'aurait
 * jamais pu utiliser Google.
 *
 * L'origine candidate vient d'un cookie posé par `/google/start` depuis l'hôte réellement
 * visité. On ne lui fait pas confiance pour autant : elle n'est retenue que si son hôte est
 * celui d'un produit **déclaré au registre** et partage le domaine parent de l'hôte du
 * rappel. Toute autre valeur retombe sur `fallbackOrigin` — une redirection ouverte sur un
 * flux qui transporte un jeton est exactement ce qu'il ne faut pas offrir.
 *
 * @param {string} candidate Origine mémorisée au départ du flux (`https://hôte`).
 * @param {object} options
 * @param {string} options.requestHost Hôte du rappel (`req.get('host')`).
 * @param {string} options.fallbackOrigin Origine à servir si la candidate est refusée.
 * @param {string[]} options.productHostPrefixes Préfixes de host du registre (`lib/products.js`).
 * @returns {string}
 */
function resolveProductReturnOrigin(
  candidate,
  { requestHost, fallbackOrigin, productHostPrefixes = [] } = {},
) {
  const raw = String(candidate || '').trim();
  const fallback = String(fallbackOrigin || '').replace(/\/+$/, '');
  if (!raw) return fallback;
  let url;
  try {
    url = new URL(raw);
  } catch (_) {
    return fallback;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return fallback;
  const host = normalizeOAuthPublicHost(url.host);
  const hostLabel = host.split(':')[0];
  const known = productHostPrefixes.some((prefix) => prefix && hostLabel.startsWith(prefix));
  if (!known) return fallback;
  const reference = normalizeOAuthPublicHost(requestHost || '').split(':')[0];
  if (!reference || parentDomain(hostLabel) !== parentDomain(reference)) return fallback;
  return `${url.protocol}//${url.host}`;
}

module.exports = {
  normalizeOAuthPublicHost,
  resolveOAuthPublicOrigin,
  resolveOAuthRedirectUri,
  parentDomain,
  resolveProductReturnOrigin,
};
