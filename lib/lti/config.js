'use strict';

/**
 * Secrets LTI 1.3 lus dans `.env` (section 21.5 : jamais un réglage admin, I-9).
 *
 * Aucune variable n'est obligatoire au démarrage. Sans elles, les routes `/api/lti/*`
 * répondent `503 { error: 'Entrée depuis le cours non configurée' }`.
 */

const NOT_CONFIGURED_MESSAGE = 'Entrée depuis le cours non configurée';
const PROVIDER = 'lti';

function trim(value) {
  return String(value ?? '').trim();
}

function normalizeUrl(value) {
  const raw = trim(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function readLtiEnv(env = process.env) {
  const issuer = normalizeUrl(env.LTI_ISSUER);
  const clientId = trim(env.LTI_CLIENT_ID);
  const deploymentId = trim(env.LTI_DEPLOYMENT_ID);
  const platformAuthUrl = normalizeUrl(env.LTI_PLATFORM_AUTH_URL);
  const platformJwksUrl = normalizeUrl(env.LTI_PLATFORM_JWKS_URL);
  const toolPrivateKey = String(env.LTI_TOOL_PRIVATE_KEY || '').trim();
  const toolKid = trim(env.LTI_TOOL_KID) || 'foretmap-lti';
  const configured = Boolean(
    issuer && clientId && deploymentId && platformAuthUrl && platformJwksUrl && toolPrivateKey,
  );
  return {
    issuer,
    clientId,
    deploymentId,
    platformAuthUrl,
    platformJwksUrl,
    toolPrivateKey,
    toolKid,
    configured,
  };
}

function notConfiguredError() {
  const err = new Error(NOT_CONFIGURED_MESSAGE);
  err.status = 503;
  err.code = 'LTI_NOT_CONFIGURED';
  return err;
}

module.exports = {
  PROVIDER,
  NOT_CONFIGURED_MESSAGE,
  readLtiEnv,
  notConfiguredError,
};
