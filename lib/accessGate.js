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

/** Séparateur entre la valeur et l'échéance d'un laissez-passer (`code-…~1767225600`). */
const EXPIRY_SEPARATOR = '~';

/** Échéance acceptée : un horodatage Unix en secondes, sans signe ni décimale. */
const EXPIRY_PATTERN = /^\d{1,12}$/;

/**
 * Fabrique une garde : un cookie `name` dont la valeur est `<valeur>.<signature HMAC>`.
 * @param {object} options
 * @param {string} options.name Nom du cookie.
 * @param {() => string} options.secret Secret de signature (résolu à chaque appel : testable).
 * @param {number} options.ttlSeconds Durée de vie (`Max-Age`) par défaut.
 * @param {string} [options.sameSite='Lax']
 * @param {string} [options.path='/']
 * @param {() => boolean} [options.secure] `Secure` (défaut : en production).
 * @param {boolean} [options.bindName=false] Inclut le nom du cookie dans la signature : deux
 *   gardes qui partagent un secret ne peuvent plus échanger leurs cookies. Désactivé par défaut
 *   pour ne pas invalider les cookies déjà émis par les gardes existantes (progression Visite).
 * @param {boolean} [options.expiring=false] **Échéance signée** : la valeur porte sa date
 *   d'expiration (`<valeur>~<échéance en secondes Unix>`), couverte par la signature, et le
 *   serveur la contrôle à chaque lecture. Sans elle, le `Max-Age` n'était appliqué que par le
 *   navigateur : une copie du cookie restait valable indéfiniment. Une valeur sans échéance,
 *   expirée ou dont l'échéance a été retouchée est refusée (`null`). Réservé aux laissez-passer
 *   des plans ; la progression Visite, qui n'est pas un droit d'accès, garde l'ancien format.
 */
function createSignedCookieGate({
  name,
  secret,
  ttlSeconds,
  sameSite = 'Lax',
  path = '/',
  secure = () => process.env.NODE_ENV === 'production',
  bindName = false,
  expiring = false,
}) {
  if (!name) throw new TypeError('createSignedCookieGate : name requis');
  if (typeof secret !== 'function') throw new TypeError('createSignedCookieGate : secret() requis');
  const maxAge = Math.max(1, Math.floor(Number(ttlSeconds) || 0));

  function resolveTtl(override) {
    const n = Math.floor(Number(override));
    return Number.isFinite(n) && n > 0 ? n : maxAge;
  }

  function sign(value) {
    const payload = bindName ? `${name}\n${value}` : String(value);
    return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  }

  /**
   * Valeur complète du cookie. Garde à échéance : `expiresAt` (secondes Unix) est requis — il
   * entre dans la partie signée.
   */
  function build(value, { expiresAt } = {}) {
    let token = String(value);
    if (expiring) {
      const exp = Math.floor(Number(expiresAt));
      if (!Number.isFinite(exp) || exp <= 0) {
        throw new TypeError('createSignedCookieGate : expiresAt requis (garde à échéance)');
      }
      token = `${token}${EXPIRY_SEPARATOR}${exp}`;
    }
    return `${token}.${sign(token)}`;
  }

  /**
   * Valeur portée par le cookie si la signature est valide (et, garde à échéance, si
   * l'échéance n'est pas atteinte), sinon `null`.
   * @param {string} cookieValue
   * @param {{ now?: number }} [options] instant de référence en millisecondes (tests).
   */
  function verify(cookieValue, { now = Date.now() } = {}) {
    const value = String(cookieValue || '');
    const splitAt = value.lastIndexOf('.');
    if (splitAt <= 0) return null;
    const token = value.slice(0, splitAt);
    const signature = value.slice(splitAt + 1);
    if (!timingSafeStringEqual(signature, sign(token))) return null;
    if (!expiring) return token;
    const expAt = token.lastIndexOf(EXPIRY_SEPARATOR);
    if (expAt <= 0) return null;
    const rawExp = token.slice(expAt + 1);
    if (!EXPIRY_PATTERN.test(rawExp)) return null;
    if (Number(rawExp) * 1000 <= now) return null;
    return token.slice(0, expAt);
  }

  /** Valeur vérifiée du cookie de la requête, ou `null`. */
  function read(req, options) {
    return verify(parseCookies(req)[name], options);
  }

  /**
   * Pose le cookie. `ttlSeconds` remplace la durée par défaut (durée réglable par
   * l'administrateur) ; garde à échéance, l'échéance signée suit la même durée.
   */
  function set(res, value, { ttlSeconds: ttlOverride, now = Date.now() } = {}) {
    const ttl = resolveTtl(ttlOverride);
    const secureFlag = secure() ? '; Secure' : '';
    const expiresAt = Math.floor(now / 1000) + ttl;
    const encoded = encodeURIComponent(build(value, { expiresAt }));
    res.append(
      'Set-Cookie',
      `${name}=${encoded}; Max-Age=${ttl}; Path=${path}; HttpOnly; SameSite=${sameSite}${secureFlag}`,
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

  return {
    name,
    ttlSeconds: maxAge,
    expiring,
    sign,
    build,
    verify,
    read,
    set,
    clear,
    readOrCreate,
  };
}

/**
 * Valeur d'un laissez-passer lié à un code partagé : dérivée du hachage du code en vigueur,
 * elle cesse d'être valide dès que l'administrateur change le code. Un laissez-passer à valeur
 * constante (`'ok'`) survivait au changement de code pendant toute sa durée de vie.
 */
function codePassValue(codeHash) {
  const fingerprint = crypto
    .createHash('sha256')
    .update(String(codeHash || ''))
    .digest('base64url')
    .slice(0, 22);
  return `code-${fingerprint}`;
}

module.exports = {
  codePassValue,
  resolveCookieSecret,
  parseCookies,
  timingSafeStringEqual,
  createSignedCookieGate,
};
