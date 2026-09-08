'use strict';

/**
 * Fausse plateforme LTI 1.3 pour les tests : paire RSA, JWKS HTTP local, `id_token` signés
 * RS256. Reproduit Moodle côté jeton (issuer, aud, nonce, deployment, Resource Link).
 *
 * `jose` (MIT, https://github.com/panva/jose) — même bibliothèque que `lib/lti/launch.js`.
 */

const http = require('node:http');
const { loadJose } = require('../../lib/lti/jose');
const {
  MESSAGE_TYPE_CLAIM,
  VERSION_CLAIM,
  DEPLOYMENT_CLAIM,
  TARGET_CLAIM,
} = require('../../lib/lti/launch');
const { CUSTOM_CLAIM, CONTEXT_CLAIM, ROLES_CLAIM } = require('../../lib/lti/bindings');

const LEARNER = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const INSTRUCTOR = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';

async function generatePlatformKeys() {
  const jose = await loadJose();
  const { publicKey, privateKey } = await jose.generateKeyPair('RS256', { extractable: true });
  const jwk = await jose.exportJWK(publicKey);
  const kid = await jose.calculateJwkThumbprint(jwk);
  return {
    publicKey,
    privateKey,
    jwk: { ...jwk, kid, use: 'sig', alg: 'RS256' },
    kid,
  };
}

async function generateToolPrivateKeyPem() {
  const jose = await loadJose();
  const { privateKey } = await jose.generateKeyPair('RS256', { extractable: true });
  return jose.exportPKCS8(privateKey);
}

function createJwksServer(jwk) {
  const server = http.createServer((req, res) => {
    if (req.url === '/jwks.json' || req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return {
    server,
    start() {
      return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const { port } = server.address();
          this.port = port;
          this.jwksUrl = `http://127.0.0.1:${port}/jwks.json`;
          resolve(this);
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function signIdToken(
  privateKey,
  claims,
  { kid, issuer, audience, subject, expiresIn = '5m' },
) {
  const jose = await loadJose();
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(subject)
    .sign(privateKey);
}

function ltiClaims({
  nonce,
  deploymentId,
  courseId = 564,
  email = null,
  name = null,
  givenName = null,
  familyName = null,
  roles = [LEARNER],
  custom = {},
  targetLinkUri = 'https://foretmap.test/api/lti/launch',
} = {}) {
  return {
    nonce,
    name: name || null,
    given_name: givenName || null,
    family_name: familyName || null,
    email: email || null,
    [MESSAGE_TYPE_CLAIM]: 'LtiResourceLinkRequest',
    [VERSION_CLAIM]: '1.3.0',
    [DEPLOYMENT_CLAIM]: deploymentId,
    [TARGET_CLAIM]: targetLinkUri,
    [ROLES_CLAIM]: roles,
    [CONTEXT_CLAIM]: { id: String(courseId) },
    [CUSTOM_CLAIM]: custom,
  };
}

/**
 * Assemble une plateforme de test et les variables d'environnement LTI.
 */
async function startFakeLtiPlatform(overrides = {}) {
  const platform = await generatePlatformKeys();
  const toolPrivateKey = overrides.toolPrivateKey || (await generateToolPrivateKeyPem());
  const jwks = createJwksServer(platform.jwk);
  await jwks.start();
  const issuer = overrides.issuer || 'http://lti.platform.test';
  const clientId = overrides.clientId || 'foretmap-lti-client';
  const deploymentId = overrides.deploymentId || '1';
  const env = {
    LTI_ISSUER: issuer,
    LTI_CLIENT_ID: clientId,
    LTI_DEPLOYMENT_ID: deploymentId,
    LTI_PLATFORM_AUTH_URL: `${jwks.jwksUrl.replace('/jwks.json', '')}/auth`,
    LTI_PLATFORM_JWKS_URL: jwks.jwksUrl,
    LTI_TOOL_PRIVATE_KEY: toolPrivateKey,
    LTI_TOOL_KID: overrides.toolKid || 'foretmap-lti-test',
  };
  return {
    platform,
    jwks,
    env,
    issuer,
    clientId,
    deploymentId,
    LEARNER,
    INSTRUCTOR,
    async sign({ nonce, sub, ...rest }) {
      const claims = ltiClaims({ nonce, deploymentId, ...rest });
      return signIdToken(platform.privateKey, claims, {
        kid: platform.kid,
        issuer,
        audience: clientId,
        subject: String(sub || '1001'),
      });
    },
    async close() {
      await jwks.close();
    },
  };
}

function applyLtiEnv(env, target = process.env) {
  const saved = {};
  for (const [key, value] of Object.entries(env)) {
    saved[key] = target[key];
    target[key] = value;
  }
  return () => {
    for (const [key, prev] of Object.entries(saved)) {
      if (prev === undefined) delete target[key];
      else target[key] = prev;
    }
  };
}

function unsetLtiEnv(target = process.env) {
  for (const key of [
    'LTI_ISSUER',
    'LTI_CLIENT_ID',
    'LTI_DEPLOYMENT_ID',
    'LTI_PLATFORM_AUTH_URL',
    'LTI_PLATFORM_JWKS_URL',
    'LTI_TOOL_PRIVATE_KEY',
    'LTI_TOOL_KID',
  ]) {
    delete target[key];
  }
}

module.exports = {
  LEARNER,
  INSTRUCTOR,
  generatePlatformKeys,
  generateToolPrivateKeyPem,
  createJwksServer,
  signIdToken,
  ltiClaims,
  startFakeLtiPlatform,
  applyLtiEnv,
  unsetLtiEnv,
  MESSAGE_TYPE_CLAIM,
  DEPLOYMENT_CLAIM,
  CUSTOM_CLAIM,
  CONTEXT_CLAIM,
  ROLES_CLAIM,
};
