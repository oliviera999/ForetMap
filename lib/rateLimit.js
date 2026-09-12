'use strict';

/**
 * Configuration du rate-limiting HTTP (extrait de server.js — déplacement pur).
 *
 * Deux limiteurs express-rate-limit v8 :
 * - `generalLimiter` : plafond global /api/* par utilisateur JWT (sinon IP) ;
 * - `authLimiter`    : plafond strict des endpoints d'authentification (fenêtre 15 min, par IP).
 *
 * Note (audit P4) : les limiteurs n'ont volontairement PAS de propriété `message` —
 * elle serait morte car le `handler` custom (createRateLimitHandler) court-circuite
 * l'envoi de la réponse et sérialise lui-même le corps JSON.
 */

const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const logMetrics = require('./logMetrics');
const { parseBearerToken, verifyJwtToken } = require('./auth/jwtPipeline');

/** Même résolution que middleware/requireTeacher (évite un require circulaire). */
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (process.env.NODE_ENV === 'production' ? null : 'dev-secret-change-in-production');

function isTestEnv() {
  return (
    String(process.env.NODE_ENV || '')
      .trim()
      .toLowerCase() === 'test'
  );
}

function isLoadTestBypass(req) {
  const expected = String(process.env.LOAD_TEST_SECRET || '').trim();
  if (!expected) return false;
  const provided = String(req.get('x-foretmap-load-test') || '').trim();
  return provided.length > 0 && provided === expected;
}

function shouldSkipRateLimit(req) {
  return (
    isTestEnv() ||
    isLoadTestBypass(req) ||
    String(process.env.E2E_DISABLE_RATE_LIMIT || '').trim() === '1'
  );
}

function parseRateLimitLogSample() {
  const raw = String(process.env.FORETMAP_RATE_LIMIT_LOG_SAMPLE || '0.01').trim();
  const n = parseFloat(raw);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return 0.01;
}

/** Préfixe d’IP pour logs (pas d’adresse complète). */
function truncateClientIp(ip) {
  const s = String(ip || '').trim();
  if (!s) return null;
  if (s.includes('.')) {
    const parts = s.split('.');
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}.*`;
    return 'ipv4';
  }
  if (s.includes(':')) {
    const parts = s.split(':').filter(Boolean);
    if (parts.length >= 3) return `${parts.slice(0, 3).join(':')}::`;
    return 'ipv6';
  }
  return '?';
}

/**
 * Clé du limiteur général : utilisateur JWT si Bearer valide, sinon IP.
 * - `u:<canonicalUserId>` si `canonicalUserId` présent
 * - sinon `u:<userType>:<userId>`
 * - sinon `ip:<ip>`
 *
 * @param {import('express').Request} req
 * @param {{ jwtSecret?: string|null }} [opts]
 * @returns {string}
 */
function resolveGeneralRateLimitKey(req, { jwtSecret } = {}) {
  const secret = jwtSecret != null ? jwtSecret : JWT_SECRET;
  try {
    if (secret) {
      const token = parseBearerToken(req);
      if (token) {
        const claims = verifyJwtToken(token, secret);
        const canonical = claims?.canonicalUserId;
        if (canonical != null && String(canonical).trim() !== '') {
          return `u:${String(canonical).trim()}`;
        }
        const userType = claims?.userType;
        const userId = claims?.userId;
        if (
          userType != null &&
          userId != null &&
          String(userType) !== '' &&
          String(userId) !== ''
        ) {
          return `u:${String(userType)}:${String(userId)}`;
        }
      }
    }
  } catch (_) {
    /* jeton invalide / expiré → repli IP */
  }
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

const rateLimitLogSample = parseRateLimitLogSample();

function createRateLimitHandler(messageBody) {
  return (req, res, _next, options) => {
    if (rateLimitLogSample > 0 && Math.random() < rateLimitLogSample) {
      logMetrics.recordRateLimit429Sample();
      logger.warn(
        {
          requestId: req.requestId,
          path: req.path,
          method: req.method,
          clientIpTruncated: truncateClientIp(req.ip),
          msg: 'rate_limit_429_sample',
        },
        '429 rate limit (echantillon)',
      );
    }
    const status = options && typeof options.statusCode === 'number' ? options.statusCode : 429;
    res.status(status);
    res.json(messageBody);
  };
}

/** Plafond /api/* par clé (utilisateur ou IP) et fenêtre 1 min. */
function parseGeneralApiRateLimitMax() {
  const raw = String(process.env.FORETMAP_API_RATE_LIMIT_PER_MIN || '').trim();
  const fallback = 1200;
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 60 || n > 20000) {
    logger.warn({ raw }, 'FORETMAP_API_RATE_LIMIT_PER_MIN invalide — repli 1200');
    return fallback;
  }
  return n;
}

const generalApiRateLimitMax = parseGeneralApiRateLimitMax();
logger.debug(
  { apiRateLimitPerMin: generalApiRateLimitMax },
  'Limiteur général /api/* (fenêtre 1 min / clé utilisateur ou IP)',
);

// Limiteur général : défaut 1200 req/min/clé — express-rate-limit v8 : `limit`
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: generalApiRateLimitMax,
  skip: (req) => shouldSkipRateLimit(req),
  keyGenerator: (req) => resolveGeneralRateLimitKey(req, { jwtSecret: JWT_SECRET }),
  // Clé custom (JWT ou IP préfixée) : pas de repli IP automatique d'express-rate-limit.
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler({ error: 'Trop de requêtes, réessayez dans une minute.' }),
});

/**
 * Plafond des endpoints d'authentification par IP et fenêtre de 15 min.
 *
 * Défaut relevé de 20 à 60 : en établissement, une classe entière sort par la même adresse
 * publique et vingt fautes de frappe cumulées bloquaient tout le monde. La protection par
 * COMPTE (`lib/loginThrottle.js`, verrou progressif dès le 5ᵉ échec sur un identifiant) est
 * désormais le rempart principal contre la force brute ; le plafond IP ne fait que borner le
 * volume global. `FORETMAP_AUTH_RATE_LIMIT_PER_15MIN` (10..1000) l'ajuste au réseau.
 */
function parseAuthRateLimitMax() {
  const raw = String(process.env.FORETMAP_AUTH_RATE_LIMIT_PER_15MIN || '').trim();
  const fallback = 60;
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 10 || n > 1000) {
    logger.warn({ raw }, 'FORETMAP_AUTH_RATE_LIMIT_PER_15MIN invalide — repli 60');
    return fallback;
  }
  return n;
}

const authRateLimitMax = parseAuthRateLimitMax();

// Limiteur strict pour les endpoints d'authentification (défaut 60 tentatives / 15 min / IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: authRateLimitMax,
  skip: (req) => shouldSkipRateLimit(req),
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler({
    error: 'Trop de tentatives de connexion, réessayez dans 15 minutes.',
  }),
});

module.exports = {
  generalLimiter,
  authLimiter,
  authRateLimitMax,
  shouldSkipRateLimit,
  truncateClientIp,
  resolveGeneralRateLimitKey,
};
