'use strict';

/**
 * Jetons d'étape signés (HMAC-SHA256) du parcours `/oauth/authorize` : demande validée,
 * second facteur en attente, consentement. Ils transitent dans des champs cachés du
 * formulaire et expirent en quelques minutes.
 *
 * La clé est **dérivée** de `JWT_SECRET` (HMAC avec une étiquette dédiée) : un jeton d'étape
 * n'est donc jamais vérifiable comme JWT de session par le pipeline applicatif, et
 * réciproquement. Le format n'est pas un JWT (pas d'en-tête `alg`), ce qui écarte aussi toute
 * confusion d'algorithme.
 */

const crypto = require('node:crypto');

const LABEL = 'foretmap-mcp-authorize-v1';

function key() {
  const { JWT_SECRET } = require('../../../middleware/requireTeacher');
  const base = JWT_SECRET || 'dev-secret-change-in-production';
  return crypto.createHmac('sha256', base).update(LABEL).digest();
}

function b64(buf) {
  return Buffer.from(buf).toString('base64url');
}

/**
 * @param {string} purpose étiquette d'usage (`request`, `mfa`, `consent`)
 * @param {object} payload
 * @param {number} ttlSeconds
 */
function sign(purpose, payload, ttlSeconds) {
  const body = b64(
    JSON.stringify({ p: purpose, exp: Math.floor(Date.now() / 1000) + ttlSeconds, d: payload }),
  );
  const mac = b64(crypto.createHmac('sha256', key()).update(body).digest());
  return `${body}.${mac}`;
}

/** @returns {object|null} charge utile, ou `null` si signature, usage ou expiration invalides */
function verify(purpose, token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = b64(crypto.createHmac('sha256', key()).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (parsed.p !== purpose) return null;
    if (!Number.isFinite(parsed.exp) || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed.d;
  } catch {
    return null;
  }
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { randomToken, sign, verify };
