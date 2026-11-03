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

/** @type {Array<{ requestId: string, method: string, path: string, route?: string, statusCode: number, at: string }>} */
const recentHttp5xx = [];
const MAX_5XX_RING = 20;

/** @type {Array<{ requestId: string, method: string, path: string, route?: string, statusCode: number, at: string }>} */
const recentHttp429 = [];
const MAX_429_RING = 15;

function push5xx(entry) {
  recentHttp5xx.push({
    requestId: entry.requestId,
    method: entry.method,
    path: entry.path,
    // Gabarit Express (`/api/tasks/:id`) : seule forme transmise par le connecteur MCP.
    route: entry.route,
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
    route: entry.route,
    statusCode: 429,
    at: new Date().toISOString(),
  });
  while (recentHttp429.length > MAX_429_RING) recentHttp429.shift();
}

/**
 * Tranches horaires (7 jours glissants) pour le rapport de santé du connecteur MCP : nombre
 * de requêtes, de 5xx et de 429 par heure. En mémoire, comme le reste : la fenêtre réellement
 * couverte est bornée par la durée de vie du processus (`getHttpWindowCounts` la renvoie).
 */
const HOUR_MS = 3600 * 1000;
const MAX_HOURLY_BUCKETS = 7 * 24;
/** @type {Array<{ hour: number, requests: number, http5xx: number, http429: number }>} */
const hourlyBuckets = [];
const metricsStartedAt = Date.now();

function bumpHourly(statusCode, now = Date.now()) {
  const hour = Math.floor(now / HOUR_MS);
  let bucket = hourlyBuckets[hourlyBuckets.length - 1];
  if (!bucket || bucket.hour !== hour) {
    bucket = { hour, requests: 0, http5xx: 0, http429: 0 };
    hourlyBuckets.push(bucket);
    while (hourlyBuckets.length > MAX_HOURLY_BUCKETS) hourlyBuckets.shift();
  }
  bucket.requests += 1;
  if (statusCode >= 500) bucket.http5xx += 1;
  else if (statusCode === 429) bucket.http429 += 1;
}

/**
 * Totaux sur les `hours` dernières heures (heure courante incluse).
 * @returns {{ hours: number, coveredHours: number, requests: number, http5xx: number, http429: number }}
 */
function getHttpWindowCounts(hours, now = Date.now()) {
  const h = Math.max(1, Math.min(MAX_HOURLY_BUCKETS, Math.round(hours)));
  const fromHour = Math.floor(now / HOUR_MS) - h + 1;
  const out = { hours: h, requests: 0, http5xx: 0, http429: 0 };
  for (const b of hourlyBuckets) {
    if (b.hour < fromHour) continue;
    out.requests += b.requests;
    out.http5xx += b.http5xx;
    out.http429 += b.http429;
  }
  out.coveredHours = Math.min(h, Math.round(((now - metricsStartedAt) / HOUR_MS) * 10) / 10);
  return out;
}

/** Remise à zéro des tranches horaires (tests uniquement). */
function resetHourlyForTests() {
  hourlyBuckets.length = 0;
}

/**
 * @param {{ statusCode: number, durationMs: number, requestId?: string, path: string, route?: string, method: string, slowThresholdMs: number }} p
 */
function recordHttpEnd(p) {
  httpRequests += 1;
  bumpHourly(p.statusCode);
  const { statusCode, durationMs, requestId, path, route, method, slowThresholdMs } = p;
  if (statusCode >= 500) {
    http5xx += 1;
    push5xx({
      requestId: String(requestId || ''),
      path: String(path || ''),
      route: route || undefined,
      method: String(method || ''),
      statusCode,
    });
  } else if (statusCode === 429) {
    http429 += 1;
    http4xx += 1;
    push429({
      requestId: String(requestId || ''),
      path: String(path || ''),
      route: route || undefined,
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

/**
 * Écritures arrivées en différé depuis une file hors ligne (en-tête `X-Foretmap-Queued-At`).
 * Anonyme : ni compte, ni contenu, seulement le gabarit de route, le canal de rejeu et le
 * retard. Sert à mesurer l'usage réel du hors ligne sur le terrain.
 */
const DEFERRED_MAX_DELAY_MS = 30 * 24 * 60 * 60 * 1000;
const DEFERRED_MAX_ROUTES = 30;
let deferredCount = 0;
let deferredRefused = 0;
let deferredViaBackgroundSync = 0;
let deferredDelaySumMs = 0;
let deferredDelayMaxMs = 0;
/** @type {Map<string, number>} */
const deferredByRoute = new Map();

/**
 * @param {{ delayMs: number, route?: string, via?: string, statusCode?: number }} p
 */
function recordDeferredWrite(p) {
  const delay = Math.round(Number(p?.delayMs));
  if (!Number.isFinite(delay) || delay < 0 || delay > DEFERRED_MAX_DELAY_MS) return;
  deferredCount += 1;
  deferredDelaySumMs += delay;
  if (delay > deferredDelayMaxMs) deferredDelayMaxMs = delay;
  if (p.via === 'background-sync') deferredViaBackgroundSync += 1;
  if (Number(p.statusCode) >= 400) deferredRefused += 1;
  const route = String(p.route || 'autre').slice(0, 120);
  if (deferredByRoute.has(route) || deferredByRoute.size < DEFERRED_MAX_ROUTES) {
    deferredByRoute.set(route, (deferredByRoute.get(route) || 0) + 1);
  }
}

function getDeferredWritesMetrics() {
  return {
    count: deferredCount,
    refused: deferredRefused,
    viaBackgroundSync: deferredViaBackgroundSync,
    avgDelayMs: deferredCount > 0 ? Math.round(deferredDelaySumMs / deferredCount) : 0,
    maxDelayMs: deferredDelayMaxMs,
    byRoute: Object.fromEntries(deferredByRoute),
  };
}

/** Remise à zéro (tests uniquement). */
function resetDeferredWritesForTests() {
  deferredCount = 0;
  deferredRefused = 0;
  deferredViaBackgroundSync = 0;
  deferredDelaySumMs = 0;
  deferredDelayMaxMs = 0;
  deferredByRoute.clear();
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
    deferredWrites: getDeferredWritesMetrics(),
  };
}

module.exports = {
  recordHttpEnd,
  recordRouteError,
  recordRateLimit429Sample,
  recordDeferredWrite,
  resetDeferredWritesForTests,
  getMetrics,
  getHttpWindowCounts,
  resetHourlyForTests,
};
