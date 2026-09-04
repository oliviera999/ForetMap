'use strict';

/**
 * Garde d'accès par cookie signé — module partagé (lot 1 du plan de convergence,
 * `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §5.2, `docs/AUDIT_PLAN_LYAUTEY_2026-09.md` §8.7).
 *
 * Extrait de `routes/visit.js` (cookie de progression anonyme de la Visite), où il était
 * écrit une fois, correctement (HMAC-SHA256, comparaison en temps constant, HttpOnly,
 * SameSite=Lax, Secure en production, TTL). Trois usages visés : la progression anonyme de
 * la Visite (existant), le code d'accès du plan (`ui.plan.access_mode = 'code'`), une
 * partie G&L ouverte aux invités.
 *
 * Aucune dépendance Express : `req` n'est lu que pour `headers.cookie`, `res` que pour
 * `append('Set-Cookie', …)`.
 */

const crypto = require('crypto');

/**
 * Résout le secret de signature depuis l'environnement.
 * @param {object} options
 * @param {string} options.envVar Nom de la variable d'environnement portant le secret.
 * @param {() => string} [options.devFallback] Secret de repli hors production.
 * @param {boolean} [options.requireInProduction=true] Lever si la variable manque en production.
 * @returns {string}
 */
function resolveCookieSecret({ envVar, devFallback, requireInProduction = true }) {
  const fromEnv = String(process.env[envVar] || '').trim();
  if (fromEnv) return fromEnv;
  if (requireInProduction && process.env.NODE_ENV === 'production') {
    throw new Error(`${envVar} requis en production`);
  }
  const fallback = typeof devFallback === 'function' ? devFallback() : devFallback;
  return String(fallback || `${envVar}-dev-secret-change-me`);
}

/** Cookies de la requête, décodés (`{ nom: valeur }`). */
function parseCookies(req) {
  const raw = String(req?.headers?.cookie || '');
  const out = {};
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.split('=');
    const key = String(k || '').trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(rest.join('=').trim());
    } catch (_) {
      // Valeur mal encodée : ignorée plutôt que de faire échouer toute la requête.
    }
  }
  return out;
}

/** Comparaison en temps constant de deux chaînes (codes d'accès, signatures). */
function timingSafeStringEqual(a, b) {
  try {
    const bufA = Buffer.from(String(a ?? ''));
    const bufB = Buffer.from(String(b ?? ''));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch (_) {
    return false;
  }
}

/**
 * Fabrique une garde : un cookie `name` dont la valeur est `<valeur>.<signature HMAC>`.
 * @param {object} options
 * @param {string} options.name Nom du cookie.
 * @param {() => string} options.secret Secret de signature (résolu à chaque appel : testable).
 * @param {number} options.ttlSeconds Durée de vie (`Max-Age`).
 * @param {string} [options.sameSite='Lax']
 * @param {string} [options.path='/']
 * @param {() => boolean} [options.secure] `Secure` (défaut : en production).
 */
function createSignedCookieGate({
  name,
  secret,
  ttlSeconds,
  sameSite = 'Lax',
  path = '/',
  secure = () => process.env.NODE_ENV === 'production',
}) {
  if (!name) throw new TypeError('createSignedCookieGate : name requis');
  if (typeof secret !== 'function') throw new TypeError('createSignedCookieGate : secret() requis');
  const maxAge = Math.max(1, Math.floor(Number(ttlSeconds) || 0));

  function sign(value) {
    return crypto.createHmac('sha256', secret()).update(String(value)).digest('base64url');
  }

  function build(value) {
    return `${value}.${sign(value)}`;
  }

  /** Valeur portée par le cookie si la signature est valide, sinon `null`. */
  function verify(cookieValue) {
    const value = String(cookieValue || '');
    const splitAt = value.lastIndexOf('.');
    if (splitAt <= 0) return null;
    const token = value.slice(0, splitAt);
    const signature = value.slice(splitAt + 1);
    return timingSafeStringEqual(signature, sign(token)) ? token : null;
  }

  /** Valeur vérifiée du cookie de la requête, ou `null`. */
  function read(req) {
    return verify(parseCookies(req)[name]);
  }

  function set(res, value) {
    const secureFlag = secure() ? '; Secure' : '';
    const encoded = encodeURIComponent(build(value));
    res.append(
      'Set-Cookie',
      `${name}=${encoded}; Max-Age=${maxAge}; Path=${path}; HttpOnly; SameSite=${sameSite}${secureFlag}`,
    );
  }

  function clear(res) {
    const secureFlag = secure() ? '; Secure' : '';
    res.append(
      'Set-Cookie',
      `${name}=; Max-Age=0; Path=${path}; HttpOnly; SameSite=${sameSite}${secureFlag}`,
    );
  }

  /** Valeur existante vérifiée, sinon en crée une (UUID par défaut) et pose le cookie. */
  function readOrCreate(req, res, create = () => crypto.randomUUID()) {
    const existing = read(req);
    if (existing) return existing;
    const created = String(create());
    set(res, created);
    return created;
  }

  return { name, ttlSeconds: maxAge, sign, build, verify, read, set, clear, readOrCreate };
}

module.exports = {
  resolveCookieSecret,
  parseCookies,
  timingSafeStringEqual,
  createSignedCookieGate,
};
