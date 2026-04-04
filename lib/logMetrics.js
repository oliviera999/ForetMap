/**
 * Compteurs HTTP en mémoire (processus courant) pour /api/admin/diagnostics.
 * Pas de PII ; ring buffer des derniers 5xx pour corrélation avec les logs.
 */
'use strict';

let httpRequests = 0;
let http5xx = 0;
let http4xx = 0;
/** Compteur exact des réponses 429 (toutes origines : rate limit global, forum, etc.). */
let http429 = 0;
let httpSlow = 0;
let routeErrors = 0;
let rateLimit429Samples = 0;

/** @type {Array<{ requestId: string, method: string, path: string, statusCode: number, at: string }>} */
const recentHttp5xx = [];
const MAX_5XX_RING = 20;

/** @type {Array<{ requestId: string, method: string, path: string, statusCode: number, at: string }>} */
const recentHttp429 = [];
const MAX_429_RING = 15;

function push5xx(entry) {
  recentHttp5xx.push({
    requestId: entry.requestId,
    method: entry.method,
    path: entry.path,
    statusCode: entry.statusCode,
    at: new Date().toISOString(),
  });
  while (recentHttp5xx.length > MAX_5XX_RING) recentHttp5xx.shift();
}

function push429(entry) {
  recentHttp429.push({
    requestId: entry.requestId,
    method: entry.method,
    path: entry.path,
    statusCode: 429,
    at: new Date().toISOString(),
  });
  while (recentHttp429.length > MAX_429_RING) recentHttp429.shift();
}

/**
 * @param {{ statusCode: number, durationMs: number, requestId?: string, path: string, method: string, slowThresholdMs: number }} p
 */
function recordHttpEnd(p) {
  httpRequests += 1;
  const { statusCode, durationMs, requestId, path, method, slowThresholdMs } = p;
  if (statusCode >= 500) {
    http5xx += 1;
    push5xx({
      requestId: String(requestId || ''),
      path: String(path || ''),
      method: String(method || ''),
      statusCode,
    });
  } else if (statusCode === 429) {
    http429 += 1;
    http4xx += 1;
    push429({
      requestId: String(requestId || ''),
      path: String(path || ''),
      method: String(method || ''),
    });
  } else if (statusCode >= 400) {
    http4xx += 1;
  }
  if (slowThresholdMs > 0 && durationMs >= slowThresholdMs) {
    httpSlow += 1;
  }
}

function recordRouteError() {
  routeErrors += 1;
}

function recordRateLimit429Sample() {
  rateLimit429Samples += 1;
}

function getMetrics() {
  return {
    httpRequests,
    http5xx,
    http4xx,
    http429,
    httpSlow,
    routeErrors,
    rateLimit429Samples,
    recentHttp5xx: recentHttp5xx.map((x) => ({ ...x })),
    recentHttp429: recentHttp429.map((x) => ({ ...x })),
  };
}

module.exports = {
  recordHttpEnd,
  recordRouteError,
  recordRateLimit429Sample,
  getMetrics,
};
