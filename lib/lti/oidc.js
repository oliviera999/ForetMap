'use strict';

/**
 * Initiation OIDC LTI 1.3 (GET|POST /api/lti/login).
 *
 * `state` et `nonce` voyagent dans un cookie HMAC court (10 min) et dans le `state`
 * renvoyé à la plateforme. Le lancement (form_post cross-site) relit le cookie ;
 * `SameSite=None; Secure` en production pour que le POST Moodle le porte.
 */

const crypto = require('node:crypto');
const { JWT_SECRET } = require('../../middleware/requireTeacher');

const COOKIE = 'foretmap_lti_oidc';
const TTL_MS = 10 * 60 * 1000;

function signPayload(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const mac = crypto
    .createHmac('sha256', JWT_SECRET || 'dev-lti')
    .update(body)
    .digest('base64url');
  return `${body}.${mac}`;
}

function verifyPayload(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto
    .createHmac('sha256', JWT_SECRET || 'dev-lti')
    .update(body)
    .digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload?.exp || Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

function newOidcPair() {
  return {
    state: crypto.randomBytes(24).toString('hex'),
    nonce: crypto.randomBytes(24).toString('hex'),
    exp: Date.now() + TTL_MS,
  };
}

function cookieOptions() {
  const secure = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: secure ? 'none' : 'lax',
    secure,
    maxAge: TTL_MS,
    path: '/api/lti',
  };
}

function setOidcCookie(res, pair) {
  res.cookie(COOKIE, signPayload(pair), cookieOptions());
}

function readOidcCookie(req) {
  const header = req?.headers?.cookie;
  if (!header) return null;
  for (const part of String(header).split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === COOKIE) return verifyPayload(decodeURIComponent(rest.join('=') || ''));
  }
  return null;
}

function clearOidcCookie(res) {
  res.clearCookie(COOKIE, { path: '/api/lti' });
}

/**
 * Nonces OIDC consommés — persistés en base (`lti_nonces`, migration 268) : un nonce en
 * mémoire de processus restait rejouable sur une autre instance pendant sa durée de vie
 * (CDG-17). Purge des entrées expirées au fil de l'eau.
 * @returns {Promise<boolean>} `false` si le nonce est vide ou déjà consommé
 */
async function rememberNonce(nonce, ttlMs = TTL_MS) {
  const key = String(nonce || '');
  if (!key) return false;
  const { execute } = require('../../database');
  await execute('DELETE FROM lti_nonces WHERE expires_at < NOW()');
  try {
    await execute('INSERT INTO lti_nonces (nonce, expires_at) VALUES (?, ?)', [
      key.slice(0, 255),
      new Date(Date.now() + ttlMs),
    ]);
    return true;
  } catch (err) {
    if (err && (err.errno === 1062 || err.code === 'ER_DUP_ENTRY')) return false;
    throw err;
  }
}

async function resetNonceCacheForTests() {
  const { execute } = require('../../database');
  await execute('DELETE FROM lti_nonces');
}

/**
 * Construit l'URL d'autorisation de la plateforme (OpenID Connect third-party login).
 */
function buildPlatformAuthRedirect({ env, pair, loginHint, targetLinkUri, messageHint }) {
  const params = new URLSearchParams({
    scope: 'openid',
    response_type: 'id_token',
    response_mode: 'form_post',
    prompt: 'none',
    client_id: env.clientId,
    redirect_uri: targetLinkUri,
    login_hint: loginHint || '',
    state: pair.state,
    nonce: pair.nonce,
  });
  if (messageHint) params.set('lti_message_hint', messageHint);
  return `${env.platformAuthUrl}?${params.toString()}`;
}

module.exports = {
  COOKIE,
  TTL_MS,
  newOidcPair,
  setOidcCookie,
  readOidcCookie,
  clearOidcCookie,
  rememberNonce,
  resetNonceCacheForTests,
  buildPlatformAuthRedirect,
  signPayload,
  verifyPayload,
};
