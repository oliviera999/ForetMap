'use strict';

/**
 * Contrôle LTI 1.3 pour `npm run moodle:check` (section 21.6) : secrets présents, JWKS joignable.
 * Aucun lancement réel ; le paragraphe 21.7 reste à remplir après un test sur olution.info.
 */

const { readLtiEnv } = require('./config');
const { toolPublicJwk } = require('./launch');
const { nodeHttpFetch } = require('../nodeHttpFetch');

const JWKS_TIMEOUT_MS = 15000;

async function runLtiCheck({ env = readLtiEnv(), fetchImpl = nodeHttpFetch } = {}) {
  const report = {
    configured: env.configured,
    issuer: env.issuer || null,
    clientIdSet: Boolean(env.clientId),
    deploymentIdSet: Boolean(env.deploymentId),
    platformAuthUrl: env.platformAuthUrl || null,
    platformJwksUrl: env.platformJwksUrl || null,
    toolKid: env.toolKid || null,
    jwksOk: false,
    jwksKeys: 0,
    toolJwkOk: false,
    errors: [],
  };
  if (!env.configured) {
    report.errors.push({ step: 'env', message: 'Secrets LTI absents de .env' });
    return report;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), JWKS_TIMEOUT_MS);
    if (typeof timer.unref === 'function') timer.unref();
    let res;
    try {
      res = await fetchImpl(env.platformJwksUrl, { method: 'GET', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    const body = await res.json().catch(() => null);
    const keys = Array.isArray(body?.keys) ? body.keys : [];
    report.jwksOk = res.ok && keys.length > 0;
    report.jwksKeys = keys.length;
    if (!report.jwksOk)
      report.errors.push({
        step: 'jwks',
        message: `JWKS plateforme injoignable ou vide (${res.status})`,
      });
  } catch (error) {
    report.errors.push({ step: 'jwks', message: String(error.message || error) });
  }
  try {
    const jwk = await toolPublicJwk(env);
    report.toolJwkOk = Boolean(jwk?.kty);
  } catch (error) {
    report.errors.push({ step: 'tool_key', message: String(error.message || error) });
  }
  return report;
}

module.exports = { runLtiCheck };
