import { getAuthToken, withAppBase } from './api';

/**
 * Cache des images servies derrière `requireAuth` (un `<img src="/api/…">` n'envoie pas le
 * jeton Bearer). Une entrée par couple jeton × URL, partagée entre composants :
 * - compteur de références : l'URL blob n'est révoquée qu'une fois le dernier utilisateur
 *   parti, après un court délai (liste → détail sans re-téléchargement) ;
 * - annulation (`AbortController`) si plus personne n'attend l'image ;
 * - au plus `MAX_CONCURRENT` téléchargements simultanés.
 */
const MAX_CONCURRENT = 4;
const RELEASE_DELAY_MS = 30_000;

/** @type {Map<string, { refs: number, promise: Promise<string>, url: string, controller: AbortController, timer: ReturnType<typeof setTimeout> | null, objectUrl: string }>} */
const entries = new Map();
const queue = [];
let active = 0;

function revoke(objectUrl) {
  if (objectUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrl);
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    if (job.controller.signal.aborted) {
      job.reject(new DOMException('Aborted', 'AbortError'));
      continue;
    }
    active += 1;
    job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  }
}

function schedule(controller, run) {
  return new Promise((resolve, reject) => {
    queue.push({ controller, run, resolve, reject });
    pump();
  });
}

export function resolveAuthedImageUrl(src) {
  const s = String(src || '');
  return s.startsWith('http') || s.startsWith('blob:') || s.startsWith('data:')
    ? s
    : withAppBase(s);
}

/**
 * @param {string} src
 * @returns {{ key: string, promise: Promise<string> }}
 */
export function acquireAuthedImage(src) {
  const token = getAuthToken() || '';
  const url = resolveAuthedImageUrl(src);
  const key = `${token}\u0000${url}`;
  const existing = entries.get(key);
  if (existing) {
    existing.refs += 1;
    if (existing.timer) {
      clearTimeout(existing.timer);
      existing.timer = null;
    }
    return { key, promise: existing.promise };
  }
  const controller = new AbortController();
  const entry = { refs: 1, url, controller, timer: null, objectUrl: '', promise: null };
  entry.promise = schedule(controller, async () => {
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
    entry.objectUrl = URL.createObjectURL(blob);
    return entry.objectUrl;
  });
  // Un échec ne doit pas rester en cache : la prochaine demande retentera.
  entry.promise.catch(() => {
    if (entries.get(key) === entry) entries.delete(key);
  });
  entries.set(key, entry);
  return { key, promise: entry.promise };
}

/** @param {string} key */
export function releaseAuthedImage(key) {
  const entry = entries.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  const drop = () => {
    if (entries.get(key) !== entry || entry.refs > 0) return;
    entries.delete(key);
    entry.controller.abort();
    revoke(entry.objectUrl);
  };
  if (!entry.objectUrl) {
    drop();
    return;
  }
  entry.timer = setTimeout(drop, RELEASE_DELAY_MS);
}

/** Tests uniquement : vide le cache sans attendre les délais. */
export function resetAuthedImageCacheForTests() {
  for (const entry of entries.values()) {
    if (entry.timer) clearTimeout(entry.timer);
    entry.controller.abort();
    revoke(entry.objectUrl);
  }
  entries.clear();
  queue.length = 0;
  active = 0;
}

export function authedImageCacheSizeForTests() {
  return entries.size;
}
