'use strict';

/**
 * Relais d'images tierces (audit RGPD du 28/09/2026, § 7).
 *
 * En mode `local` du réglage `privacy.external_assets_mode`, le navigateur ne contacte plus
 * Wikimedia : l'image est demandée à `GET /api/media/remote?url=…`, que le **serveur** va
 * chercher une fois puis garde en cache sous `uploads/remote-cache/`. Les visiteurs ne laissent
 * donc plus leur adresse IP aux serveurs de Wikimedia (hébergés aux États-Unis).
 *
 * Garde-fous : liste fermée d'hôtes, HTTPS seul, redirections suivies à la main et revalidées
 * à chaque saut (une redirection vers un hôte interne ou hors liste est refusée), type de contenu
 * image obligatoire, taille plafonnée, délai borné, nombre de téléchargements simultanés borné.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { UPLOADS_DIR } = require('./uploads');
const { logger } = require('./logger');

const REMOTE_MEDIA_HOSTS = Object.freeze(['upload.wikimedia.org', 'commons.wikimedia.org']);
const CACHE_DIR = path.join(UPLOADS_DIR, 'remote-cache');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONCURRENT_FETCHES = 4;
const USER_AGENT = 'ForetMap/1.0 (media-relay)';

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

let fetchImpl = (...args) => globalThis.fetch(...args);
/** Réservé aux tests : remplace `fetch` (null → fetch natif). */
function setRemoteMediaFetchForTests(fn) {
  fetchImpl = fn || ((...args) => globalThis.fetch(...args));
}

/** URL acceptée par le relais, normalisée — ou `null`. */
function normalizeRemoteMediaUrl(raw) {
  const text = String(raw || '').trim();
  if (!text || text.length > 2048) return null;
  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  if (!REMOTE_MEDIA_HOSTS.includes(url.hostname.toLowerCase())) return null;
  url.hash = '';
  return url.toString();
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

async function fetchFollowingAllowedRedirects(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchImpl(current, {
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      const next = location ? normalizeRemoteMediaUrl(new URL(location, current).toString()) : null;
      if (!next) throw new RemoteMediaError(502, 'Redirection refusée');
      current = next;
      continue;
    }
    return response;
  }
  throw new RemoteMediaError(502, 'Trop de redirections');
}

let activeFetches = 0;
const inFlight = new Map();

async function downloadToCache(url) {
  if (activeFetches >= MAX_CONCURRENT_FETCHES) {
    throw new RemoteMediaError(503, 'Relais d’images occupé, réessayez');
  }
  activeFetches += 1;
  try {
    const response = await fetchFollowingAllowedRedirects(url);
    if (!response.ok) throw new RemoteMediaError(502, `Source indisponible (${response.status})`);
    const contentType = String(response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!isAllowedImageType(contentType)) throw new RemoteMediaError(415, 'Contenu non image');
    const body = await readBodyCapped(response, parseMaxBytes());
    const paths = cachePaths(url);
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const tmp = `${paths.body}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, body);
    fs.writeFileSync(
      paths.meta,
      JSON.stringify({ url, contentType, fetchedAt: new Date().toISOString() }),
    );
    fs.renameSync(tmp, paths.body);
    schedulePurge();
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
      if (result.removed > 0) logger.info(result, 'Relais média : cache purgé');
    } catch (err) {
      logger.warn({ err: err?.message }, 'Relais média : purge du cache impossible');
    }
  }).unref?.();
}

/**
 * Image en cache (téléchargée au besoin). Deux demandes simultanées de la même URL partagent
 * le même téléchargement.
 * @returns {Promise<{ filePath: string, contentType: string, size: number }>}
 */
async function getRemoteMedia(rawUrl) {
  const url = normalizeRemoteMediaUrl(rawUrl);
  if (!url) throw new RemoteMediaError(400, 'URL non autorisée');
  const cached = readCache(url);
  if (cached) return cached;
  if (!inFlight.has(url)) {
    inFlight.set(
      url,
      downloadToCache(url).finally(() => inFlight.delete(url)),
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
    const response = await fetchImpl(endpoint.toString(), {
      redirect: 'error',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new RemoteMediaError(502, 'Wikimedia Commons indisponible');
    data = await response.json();
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
}

module.exports = {
  REMOTE_MEDIA_HOSTS,
  CACHE_DIR,
  RemoteMediaError,
  normalizeRemoteMediaUrl,
  getRemoteMedia,
  purgeRemoteMediaCache,
  fetchCommonsCategoryPreviewUrl,
  setRemoteMediaFetchForTests,
  resetRemoteMediaStateForTests,
  cachePaths,
};
