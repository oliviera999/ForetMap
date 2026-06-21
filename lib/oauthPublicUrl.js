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

module.exports = {
  normalizeOAuthPublicHost,
  resolveOAuthPublicOrigin,
  resolveOAuthRedirectUri,
};
