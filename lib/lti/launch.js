'use strict';

/**
 * Vérification du `id_token` LTI 1.3 (Resource Link Request).
 *
 * `jose` (MIT, https://github.com/panva/jose) : JWKS distant + RS256. Import dynamique
 * pour rester compatible avec le runtime CommonJS du serveur.
 */

const { loadJose } = require('./jose');
const { ROLES_CLAIM } = require('./bindings');
const { nodeHttpFetch } = require('../nodeHttpFetch');

const MESSAGE_TYPE_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/message_type';
const VERSION_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/version';
const DEPLOYMENT_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id';
const TARGET_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri';

function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

const jwksCache = new Map();

async function jwksFor(url) {
  let set = jwksCache.get(url);
  if (!set) {
    const jose = await loadJose();
    // `customFetch` (symbole jose) : éviter undici/Wasm sur CloudLinux (4 Gio VAS).
    set = jose.createRemoteJWKSet(new URL(url), {
      [jose.customFetch]: nodeHttpFetch,
    });
    jwksCache.set(url, set);
  }
  return set;
}

/**
 * @param {string} idToken
 * @param {{ env: object, expectedNonce: string }} args
 */
async function verifyLaunchToken(idToken, { env, expectedNonce }) {
  if (!idToken) throw httpError(400, 'id_token manquant');
  const { jwtVerify } = await loadJose();
  let payload;
  try {
    const result = await jwtVerify(idToken, await jwksFor(env.platformJwksUrl), {
      issuer: env.issuer,
      audience: env.clientId,
      algorithms: ['RS256'],
    });
    payload = result.payload;
  } catch (error) {
    if (error.status) throw error;
    throw httpError(401, `Jeton LTI refusé (${error.message})`, { code: 'LTI_TOKEN_INVALID' });
  }
  if (String(payload.nonce || '') !== String(expectedNonce || '')) {
    throw httpError(401, 'Nonce LTI invalide ou rejoué', { code: 'LTI_NONCE' });
  }
  if (String(payload[DEPLOYMENT_CLAIM] || '') !== env.deploymentId) {
    throw httpError(401, 'Déploiement LTI inconnu', { code: 'LTI_DEPLOYMENT' });
  }
  const messageType = String(payload[MESSAGE_TYPE_CLAIM] || '');
  if (messageType !== 'LtiResourceLinkRequest') {
    throw httpError(400, `Type de message LTI non supporté : ${messageType || '?'}`, {
      code: 'LTI_MESSAGE_TYPE',
    });
  }
  return payload;
}

async function toolPublicJwk(env) {
  const { importPKCS8, exportJWK, calculateJwkThumbprint } = await loadJose();
  const key = await importPKCS8(env.toolPrivateKey, 'RS256', { extractable: true });
  const jwk = await exportJWK(key);
  const kid = env.toolKid || (await calculateJwkThumbprint(jwk));
  return { kty: jwk.kty, n: jwk.n, e: jwk.e, kid, use: 'sig', alg: 'RS256' };
}

function launchView(payload) {
  return {
    sub: String(payload.sub || ''),
    email: payload.email ? String(payload.email) : null,
    name: payload.name ? String(payload.name) : null,
    givenName: payload.given_name || payload.givenName || null,
    familyName: payload.family_name || payload.familyName || null,
    roles: payload[ROLES_CLAIM] || [],
    deploymentId: payload[DEPLOYMENT_CLAIM] || null,
    version: payload[VERSION_CLAIM] || null,
    targetLinkUri: payload[TARGET_CLAIM] || null,
  };
}

module.exports = {
  MESSAGE_TYPE_CLAIM,
  VERSION_CLAIM,
  DEPLOYMENT_CLAIM,
  TARGET_CLAIM,
  verifyLaunchToken,
  toolPublicJwk,
  launchView,
  resetJwksCacheForTests() {
    jwksCache.clear();
  },
};
