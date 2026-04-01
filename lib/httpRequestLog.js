/**
 * Journal de fin de requête HTTP (Pino) + alimentation de logMetrics.
 * Réglage : FORETMAP_HTTP_LOG=off|minimal|full ; FORETMAP_HTTP_SLOW_MS (défaut 8000).
 */
'use strict';

const onFinished = require('on-finished');
const logger = require('./logger');
const logMetrics = require('./logMetrics');

function isTestEnv() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'test';
}

function parseHttpLogMode() {
  const raw = String(process.env.FORETMAP_HTTP_LOG || '').trim().toLowerCase();
  if (raw === 'full') return 'full';
  if (raw === 'minimal' || raw === 'min') return 'minimal';
  if (raw === 'off' || raw === 'false' || raw === '0') return 'off';
  if (isTestEnv()) return 'off';
  if (String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production') return 'minimal';
  return 'off';
}

function parseSlowMs() {
  const raw = String(process.env.FORETMAP_HTTP_SLOW_MS || '').trim();
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n >= 100) return n;
  return 8000;
}

/**
 * Chemins exclus du suivi (bruit / sonde).
 * @param {import('express').Request} req
 */
function shouldSkipHttpMetricsAndLog(req) {
  const p = req.path || '';
  if (p === '/api/health' || p === '/health' || p === '/api/health/db' || p === '/api/version') {
    return true;
  }
  if (!p.startsWith('/api')) return true;
  return false;
}

/**
 * @returns {import('express').RequestHandler}
 */
function createHttpRequestLogMiddleware() {
  return function httpRequestLog(req, res, next) {
    if (shouldSkipHttpMetricsAndLog(req)) return next();

    const start = performance.now();
    const mode = parseHttpLogMode();
    const slowMs = parseSlowMs();

    onFinished(res, (err, resOut) => {
      const durationMs = Math.round((performance.now() - start) * 100) / 100;
      const statusCode = resOut && typeof resOut.statusCode === 'number' ? resOut.statusCode : 0;
      const path = req.path || '';
      const method = req.method || '';
      const requestId = req.requestId;
      const route =
        req.route && typeof req.route.path === 'string'
          ? `${req.baseUrl || ''}${req.route.path}`
          : undefined;

      logMetrics.recordHttpEnd({
        statusCode,
        durationMs,
        requestId,
        path,
        method,
        slowThresholdMs: slowMs,
      });

      if (mode === 'off') return;

      const base = { requestId, method, path, statusCode, durationMs, msg: 'http_request' };
      if (err) {
        logger.warn({ ...base, err, route }, 'HTTP connexion terminée avec erreur');
        return;
      }

      if (mode === 'minimal') {
        if (statusCode >= 500) {
          logger.warn({ ...base, route }, 'HTTP 5xx');
        } else if (slowMs > 0 && durationMs >= slowMs) {
          logger.warn({ ...base, route }, 'HTTP lent');
        }
        return;
      }

      // full
      if (statusCode >= 500) {
        logger.warn({ ...base, route }, 'HTTP');
      } else if (statusCode >= 400) {
        logger.info({ ...base, route }, 'HTTP');
      } else {
        logger.info({ ...base, route }, 'HTTP');
      }
    });

    next();
  };
}

module.exports = {
  createHttpRequestLogMiddleware,
  parseHttpLogMode,
  parseSlowMs,
  shouldSkipHttpMetricsAndLog,
};
