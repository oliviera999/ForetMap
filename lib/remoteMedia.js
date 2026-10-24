'use strict';

/**
 * Relais d'images tierces (audit RGPD du 28/09/2026, § 7 ; lot B traceurs 24/10/2026).
 *
 * En mode `local` du réglage `privacy.external_assets_mode`, le navigateur ne contacte plus
 * les hôtes d'images : l'image est demandée à `GET /api/media/remote?url=…`, que le **serveur**
 * va chercher une fois puis garde en cache sous `uploads/remote-cache/`.
 *
 * Garde-fous : HTTPS seul, hôtes publics (SSRF via `lib/remoteMediaSsrf.js`), redirections
 * revalidées, type image + octets magiques, taille plafonnée, quotas IP et par hôte.
 *
 * Wikimedia conserve le traitement historique (vignettes / liste blanche de paramètres).
 * Les autres hôtes publics sont acceptés selon `privacy.remote_media_hosts_*`.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('./uploads');
const logger = require('./logger');
const {
  isPublicIpAddress,
  looksLikeOpaqueIpv4Literal,
  httpsGetPinned,
  matchesImageMagic,
} = require('./remoteMediaSsrf');

/** Hôtes Wikimedia (traitement historique des paramètres d'URL). */
const REMOTE_MEDIA_HOSTS = Object.freeze(['upload.wikimedia.org', 'commons.wikimedia.org']);
const WIKIMEDIA_HOST_SET = new Set(REMOTE_MEDIA_HOSTS);
const CACHE_DIR = path.join(UPLOADS_DIR, 'remote-cache');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT_FETCHES = 4;
/** Paramètres de requête conservés pour Wikimedia (les autres hôtes gardent la query bornée). */
const QUERY_PARAM_ALLOWLIST = Object.freeze({
  'upload.wikimedia.org': [],
  'commons.wikimedia.org': ['width'],
});
const USER_AGENT = 'ForetMap/1.0 (media-relay)';
const MAX_URL_LENGTH = 2048;

function parseMaxBytes() {
  const n = parseInt(String(process.env.FORETMAP_REMOTE_MEDIA_MAX_BYTES || ''), 10);
  return Number.isFinite(n) && n >= 64 * 1024 ? n : 8 * 1024 * 1024;
}

class RemoteMediaError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let fetchImpl = null;
/** Réservé aux tests : remplace le téléchargement (null → https + garde SSRF). */
function setRemoteMediaFetchForTests(fn) {
  fetchImpl = fn || null;
}

/**
 * @typedef {{ hostsMode?: 'any_public'|'allowlist', allowHosts?: string[], blockedHosts?: string[] }} RemoteMediaHostPolicy
 */

function normalizeHostList(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((h) =>
        String(h || '')
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
  }
  return String(raw || '')
    .split(/[\s,;]+/)
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

function isWikimediaHost(host) {
  return WIKIMEDIA_HOST_SET.has(String(host || '').toLowerCase());
}

/**
 * URL acceptée par le relais, normalisée — ou `null`.
 * @param {string} raw
 * @param {RemoteMediaHostPolicy} [policy]
 */
function normalizeRemoteMediaUrl(raw, policy = {}) {
  const text = String(raw || '').trim();
  if (!text || text.length > MAX_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  const host = url.hostname.toLowerCase();
  if (!host || looksLikeOpaqueIpv4Literal(host)) return null;
  // IP littérale : doit être publique.
  if (netIsIpLiteral(host) && !isPublicIpAddress(host)) return null;

  const blocked = new Set(normalizeHostList(policy.blockedHosts));
  if (blocked.has(host)) return null;

  const hostsMode = policy.hostsMode === 'allowlist' ? 'allowlist' : 'any_public';
  if (hostsMode === 'allowlist') {
    const allow = new Set(normalizeHostList(policy.allowHosts));
    // Wikimedia reste toujours acceptable (aperçus / seed).
    if (!allow.has(host) && !isWikimediaHost(host)) return null;
  }

  url.hash = '';
  if (isWikimediaHost(host)) {
    const allowed = QUERY_PARAM_ALLOWLIST[host] || [];
    const kept = new URLSearchParams();
    for (const name of allowed) {
      const value = url.searchParams.get(name);
      if (value != null && /^[0-9]{1,5}$/.test(value)) kept.set(name, value);
    }
    url.search = kept.toString();
  } else if (url.search.length > 512) {
    // Query bornée pour les CDN génériques (garde contre le remplissage du cache).
    url.search = url.search.slice(0, 512);
  }
  if (url.toString().length > MAX_URL_LENGTH) return null;
  return url.toString();
}

function netIsIpLiteral(host) {
  return require('net').isIP(host) !== 0;
}

function cacheKey(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function cachePaths(url) {
  const key = cacheKey(url);
  return {
    body: path.join(CACHE_DIR, `${key}.bin`),
    meta: path.join(CACHE_DIR, `${key}.json`),
  };
}

function readCache(url, now = Date.now()) {
  const paths = cachePaths(url);
  try {
    const stat = fs.statSync(paths.body);
    if (now - stat.mtimeMs > CACHE_TTL_MS) return null;
    const meta = JSON.parse(fs.readFileSync(paths.meta, 'utf8'));
    if (!isAllowedImageType(meta?.contentType)) return null;
    return { filePath: paths.body, contentType: meta.contentType, size: stat.size };
  } catch {
    return null;
  }
}

function isAllowedImageType(contentType) {
  return /^image\/[a-z0-9.+-]+$/i.test(
    String(contentType || '')
      .split(';')[0]
      .trim(),
  );
}

async function readBodyCapped(response, maxBytes) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new RemoteMediaError(413, 'Image trop volumineuse');
  }
  if (!response.body) return Buffer.from(await response.arrayBuffer());
  const chunks = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > maxBytes) throw new RemoteMediaError(413, 'Image trop volumineuse');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Télécharge via le double injecté (tests) ou https + IP épinglée (prod).
 * @param {string} url
 * @param {RemoteMediaHostPolicy} policy
 */
async function fetchOnce(url, _policy) {
  if (fetchImpl) {
    return fetchImpl(url, {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  }
  try {
    const res = await httpsGetPinned(url, {
      timeoutMs: FETCH_TIMEOUT_MS,
      maxBytes: parseMaxBytes(),
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
    });
    // Adapter au contrat « fetch-like » (status + headers.get + arrayBuffer).
    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      body: null,
      arrayBuffer: async () => res.body,
    };
  } catch (err) {
    if (err?.code === 'TOO_LARGE') throw new RemoteMediaError(413, 'Image trop volumineuse');
    throw new RemoteMediaError(502, 'Source injoignable');
  }
}

async function fetchFollowingAllowedRedirects(url, policy = {}) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchOnce(current, policy);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      const next = location
        ? normalizeRemoteMediaUrl(new URL(location, current).toString(), policy)
        : null;
      if (!next) throw new RemoteMediaError(502, 'Redirection refusée');
      current = next;
      continue;
    }
    return { response, finalUrl: current };
  }
  throw new RemoteMediaError(502, 'Trop de redirections');
}

let activeFetches = 0;
const inFlight = new Map();

function parsePositiveIntEnv(name, fallback, min = 1) {
  const n = parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

/**
 * Quota de téléchargements amont par client (IP) : `FORETMAP_REMOTE_MEDIA_FETCHES_PER_IP`
 * (120 par défaut — une classe entière sort souvent par la même IP publique) par fenêtre de
 * `FORETMAP_REMOTE_MEDIA_FETCH_WINDOW_MS` (10 min). Les réponses servies depuis le cache ne
 * comptent pas.
 */
const fetchQuota = new Map();
const hostFetchQuota = new Map();
const FETCH_QUOTA_MAX_KEYS = 10_000;

function consumeKeyedQuota(map, key, max, windowMs, now, message) {
  if (!key) return;
  let entry = map.get(key);
  if (!entry || now - entry.start >= windowMs) {
    if (!entry && map.size >= FETCH_QUOTA_MAX_KEYS) {
      for (const [k, value] of map) {
        if (now - value.start >= windowMs) map.delete(k);
      }
      if (map.size >= FETCH_QUOTA_MAX_KEYS) map.clear();
    }
    entry = { start: now, count: 0 };
    map.set(key, entry);
  }
  if (entry.count >= max) {
    throw new RemoteMediaError(429, message);
  }
  entry.count += 1;
}

function consumeFetchQuota(clientKey, now = Date.now()) {
  const max = parsePositiveIntEnv('FORETMAP_REMOTE_MEDIA_FETCHES_PER_IP', 120);
  const windowMs = parsePositiveIntEnv('FORETMAP_REMOTE_MEDIA_FETCH_WINDOW_MS', 10 * 60 * 1000);
  consumeKeyedQuota(
    fetchQuota,
    clientKey,
    max,
    windowMs,
    now,
    'Trop d’images demandées, réessayez plus tard',
  );
}

function consumeHostFetchQuota(hostname, now = Date.now()) {
  const max = parsePositiveIntEnv('FORETMAP_REMOTE_MEDIA_FETCHES_PER_HOST', 60);
  const windowMs = parsePositiveIntEnv('FORETMAP_REMOTE_MEDIA_FETCH_WINDOW_MS', 10 * 60 * 1000);
  consumeKeyedQuota(
    hostFetchQuota,
    String(hostname || '')
      .trim()
      .toLowerCase(),
    max,
    windowMs,
    now,
    'Trop d’images demandées pour cet hôte, réessayez plus tard',
  );
}

/** Taille connue du cache (octets) ; `null` → à recalculer au prochain besoin. */
let cacheBytesEstimate = null;

function scanCacheBytes() {
  let total = 0;
  let names;
  try {
    names = fs.readdirSync(CACHE_DIR);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!name.endsWith('.bin')) continue;
    try {
      total += fs.statSync(path.join(CACHE_DIR, name)).size;
    } catch {
      /* entrée disparue entre-temps */
    }
  }
  return total;
}

/**
 * Réserve `size` octets dans le cache AVANT écriture : purge les entrées les plus anciennes si
 * le plafond serait dépassé, sinon refuse (507).
 */
function reserveCacheSpace(size) {
  const maxBytes = parseCacheMaxBytes();
  if (size > maxBytes) throw new RemoteMediaError(507, 'Cache du relais d’images plein');
  if (cacheBytesEstimate == null) cacheBytesEstimate = scanCacheBytes();
  if (cacheBytesEstimate + size <= maxBytes) return;
  const result = purgeRemoteMediaCache({ maxBytes: maxBytes - size });
  cacheBytesEstimate = result.bytes;
  if (cacheBytesEstimate + size > maxBytes) {
    throw new RemoteMediaError(507, 'Cache du relais d’images plein');
  }
}

async function downloadToCache(url, policy = {}) {
  if (activeFetches >= MAX_CONCURRENT_FETCHES) {
    throw new RemoteMediaError(503, 'Relais d’images occupé, réessayez');
  }
  activeFetches += 1;
  try {
    const { response, finalUrl } = await fetchFollowingAllowedRedirects(url, policy);
    if (!response.ok) throw new RemoteMediaError(502, `Source indisponible (${response.status})`);
    const contentType = String(response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!isAllowedImageType(contentType)) throw new RemoteMediaError(415, 'Contenu non image');
    const body = await readBodyCapped(response, parseMaxBytes());
    if (!matchesImageMagic(body, contentType)) {
      throw new RemoteMediaError(415, 'Contenu non image');
    }
    const paths = cachePaths(url);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    reserveCacheSpace(body.length);
    const tmp = `${paths.body}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body);
    fs.writeFileSync(
      paths.meta,
      JSON.stringify({
        url,
        finalUrl,
        contentType,
        fetchedAt: new Date().toISOString(),
      }),
    );
    fs.renameSync(tmp, paths.body);
    cacheBytesEstimate = (cacheBytesEstimate || 0) + body.length;
    schedulePurge();
    logger.info(
      { host: new URL(finalUrl).hostname, size: body.length, status: response.status },
      'Relais média : image téléchargée',
    );
    return { filePath: paths.body, contentType, size: body.length };
  } catch (err) {
    if (err instanceof RemoteMediaError) throw err;
    logger.warn({ err: err?.message, url }, 'Relais média : téléchargement impossible');
    throw new RemoteMediaError(502, 'Source injoignable');
  } finally {
    activeFetches -= 1;
  }
}

function parseCacheMaxBytes() {
  const n = parseInt(String(process.env.FORETMAP_REMOTE_MEDIA_CACHE_MAX_BYTES || ''), 10);
  return Number.isFinite(n) && n >= 1024 * 1024 ? n : 500 * 1024 * 1024;
}

const PURGE_INTERVAL_MS = 60 * 60 * 1000;
const STALE_TMP_MS = 60 * 60 * 1000;
let lastPurgeAt = 0;

/**
 * Nettoie `uploads/remote-cache/` : une entrée expirée n'était jamais relue mais restait sur
 * le disque (docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md). Retire les entrées au-delà de la
 * durée de vie, les fichiers temporaires abandonnés, puis les plus anciennes tant que le
 * dossier dépasse `FORETMAP_REMOTE_MEDIA_CACHE_MAX_BYTES` (500 Mo par défaut).
 * @returns {{ removed: number, bytes: number }} entrées retirées, taille restante
 */
function purgeRemoteMediaCache({ now = Date.now(), maxBytes = parseCacheMaxBytes() } = {}) {
  let names;
  try {
    names = fs.readdirSync(CACHE_DIR);
  } catch {
    return { removed: 0, bytes: 0 };
  }
  const removeEntry = (key) => {
    for (const ext of ['.bin', '.json']) {
      try {
        fs.unlinkSync(path.join(CACHE_DIR, `${key}${ext}`));
      } catch {
        /* déjà absent */
      }
    }
  };
  const nameSet = new Set(names);
  let removed = 0;
  const alive = [];
  for (const name of names) {
    const full = path.join(CACHE_DIR, name);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (name.endsWith('.tmp')) {
      if (now - stat.mtimeMs > STALE_TMP_MS) {
        try {
          fs.unlinkSync(full);
        } catch {
          /* ignore */
        }
      }
      continue;
    }
    if (name.endsWith('.json')) {
      const key = name.slice(0, -5);
      if (!nameSet.has(`${key}.bin`) && now - stat.mtimeMs > STALE_TMP_MS) removeEntry(key);
      continue;
    }
    if (!name.endsWith('.bin')) continue;
    const key = name.slice(0, -4);
    if (now - stat.mtimeMs > CACHE_TTL_MS) {
      removeEntry(key);
      removed += 1;
    } else {
      alive.push({ key, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  let bytes = alive.reduce((sum, entry) => sum + entry.size, 0);
  alive.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const entry of alive) {
    if (bytes <= maxBytes) break;
    removeEntry(entry.key);
    bytes -= entry.size;
    removed += 1;
  }
  return { removed, bytes };
}

/** Purge au plus une fois par heure, hors du chemin de la requête. */
function schedulePurge() {
  const now = Date.now();
  if (now - lastPurgeAt < PURGE_INTERVAL_MS) return;
  lastPurgeAt = now;
  setImmediate(() => {
    try {
      const result = purgeRemoteMediaCache();
      cacheBytesEstimate = result.bytes;
      if (result.removed > 0) logger.info(result, 'Relais média : cache purgé');
    } catch (err) {
      logger.warn({ err: err?.message }, 'Relais média : purge du cache impossible');
    }
  }).unref?.();
}

/**
 * Image en cache (téléchargée au besoin). Deux demandes simultanées de la même URL partagent
 * le même téléchargement.
 * @param {string} rawUrl
 * @param {{ clientKey?: string|null, policy?: RemoteMediaHostPolicy }} [options]
 * @returns {Promise<{ filePath: string, contentType: string, size: number }>}
 */
async function getRemoteMedia(rawUrl, { clientKey = null, policy = {} } = {}) {
  const url = normalizeRemoteMediaUrl(rawUrl, policy);
  if (!url) throw new RemoteMediaError(400, 'URL non autorisée');
  const cached = readCache(url);
  if (cached) return cached;
  if (!inFlight.has(url)) {
    consumeFetchQuota(clientKey);
    consumeHostFetchQuota(new URL(url).hostname);
    inFlight.set(
      url,
      downloadToCache(url, policy).finally(() => inFlight.delete(url)),
    );
  }
  return inFlight.get(url);
}

/**
 * Première image d'une catégorie Wikimedia Commons (aperçu d'une fiche plante), interrogée par
 * le serveur. Le résultat est une URL `upload.wikimedia.org`, à afficher via le relais.
 */
const categoryPreviewCache = new Map();
const CATEGORY_CACHE_MAX = 500;

async function fetchCommonsCategoryPreviewUrl(categoryTitle) {
  const title = String(categoryTitle || '').trim();
  if (!/^Category:.{1,250}$/i.test(title)) throw new RemoteMediaError(400, 'Catégorie invalide');
  const hit = categoryPreviewCache.get(title);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.url;
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('generator', 'categorymembers');
  endpoint.searchParams.set('gcmtype', 'file');
  endpoint.searchParams.set('gcmtitle', title);
  endpoint.searchParams.set('gcmlimit', '1');
  endpoint.searchParams.set('prop', 'imageinfo');
  endpoint.searchParams.set('iiprop', 'url');
  endpoint.searchParams.set('iiurlwidth', '1200');
  let data;
  try {
    let response;
    if (fetchImpl) {
      response = await fetchImpl(endpoint.toString(), {
        redirect: 'error',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) throw new RemoteMediaError(502, 'Wikimedia Commons indisponible');
      data = await response.json();
    } else {
      const pinned = await httpsGetPinned(endpoint.toString(), {
        timeoutMs: FETCH_TIMEOUT_MS,
        maxBytes: 512 * 1024,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
      if (!pinned.ok) throw new RemoteMediaError(502, 'Wikimedia Commons indisponible');
      data = JSON.parse(pinned.body.toString('utf8'));
    }
  } catch (err) {
    if (err instanceof RemoteMediaError) throw err;
    throw new RemoteMediaError(502, 'Wikimedia Commons injoignable');
  }
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  const info = pages[0]?.imageinfo?.[0];
  const url = normalizeRemoteMediaUrl(info?.thumburl || info?.url || '') || null;
  if (categoryPreviewCache.size >= CATEGORY_CACHE_MAX) categoryPreviewCache.clear();
  categoryPreviewCache.set(title, { url, at: Date.now() });
  return url;
}

function resetRemoteMediaStateForTests() {
  categoryPreviewCache.clear();
  inFlight.clear();
  activeFetches = 0;
  lastPurgeAt = 0;
  fetchQuota.clear();
  hostFetchQuota.clear();
  cacheBytesEstimate = null;
}

/**
 * Garde anti-relais ouvert : hôtes hors Wikimedia exigent same-origin.
 * @param {import('express').Request} req
 * @param {string} normalizedUrl
 * @returns {boolean} true si autorisé
 */
function isRemoteMediaRequestAllowed(req, normalizedUrl) {
  let host;
  try {
    host = new URL(normalizedUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (isWikimediaHost(host)) return true;
  const secFetch = String(req.get('sec-fetch-site') || '')
    .trim()
    .toLowerCase();
  if (secFetch) return secFetch === 'same-origin';
  const referer = String(req.get('referer') || '').trim();
  if (!referer) return false;
  try {
    const refHost = new URL(referer).host.toLowerCase();
    const reqHost = String(req.get('host') || '')
      .trim()
      .toLowerCase();
    return refHost === reqHost;
  } catch {
    return false;
  }
}

module.exports = {
  REMOTE_MEDIA_HOSTS,
  CACHE_DIR,
  RemoteMediaError,
  normalizeRemoteMediaUrl,
  normalizeHostList,
  isWikimediaHost,
  isRemoteMediaRequestAllowed,
  getRemoteMedia,
  purgeRemoteMediaCache,
  fetchCommonsCategoryPreviewUrl,
  setRemoteMediaFetchForTests,
  resetRemoteMediaStateForTests,
  cachePaths,
};
