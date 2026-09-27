// Service worker ForetMap du MODE DEV (servi hors production par lib/pwaRoutes.js).
// En production, ce fichier est REMPLACÉ par `dist/sw-<produit>.js` (et sa copie `dist/sw.js`)
// générés par `scripts/build-pwa.js` depuis le gabarit `src/shared/pwa/swTemplate.js`, avec la
// liste exacte des bundles hachés de chaque produit. Toute évolution de stratégie de cache se
// fait dans le gabarit (et se reflète ici seulement si le mode dev en a besoin).
// v9 : les réponses authentifiées ne partagent plus la clé d'URL (cloisonnement par compte).
// Le changement de nom purge les copies d'avant, qui mélangeaient les lecteurs.
const CACHE_NAME = 'foretmap-offline-v9';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/index.vite.html',
  '/offline.html',
  '/manifest.json',
  '/app-logo-n3.png',
  '/icon.svg',
  '/favicon-n3.png',
  '/favicon.ico',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-maskable-512.png',
  '/pwa-screenshot-mobile.png',
  '/pwa-screenshot-wide.png',
];

// URLs d'API en lecture (correspondance exacte pathname)
const API_CACHE_URLS = [
  '/api/zones',
  '/api/plants',
  '/api/map/markers',
  '/api/tasks',
];

// Délai d'attente du réseau des lectures network-first (HTML, API), comme le gabarit de
// production (`src/shared/pwa/swTemplate.js`, modèle `networkTimeoutSeconds` de Workbox) :
// passé ce délai, la copie en cache part si elle existe ; sinon on attend le réseau.
const NETWORK_TIMEOUT_MS = 4000;

/**
 * Même cloisonnement que le gabarit de production (src/shared/pwa/swTemplate.js,
 * cacheKeyFor) : la Cache API indexe par URL, pas par le jeton
 * (https://developer.mozilla.org/docs/Web/API/Cache/put).
 */
function authCachePartition(token) {
  function fnv(seed) {
    let h = seed >>> 0;
    for (let i = 0; i < token.length; i += 1) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  return fnv(0x811c9dc5) + fnv(0x811c9dc5 ^ 0x9e3779b9);
}

function cacheKeyFor(request) {
  const headers = request && request.headers;
  const auth =
    headers && typeof headers.get === 'function'
      ? String(headers.get('Authorization') || headers.get('authorization') || '')
      : '';
  if (!auth) return request;
  const url = new URL(request.url);
  url.searchParams.set('__fm_sw_user', authCachePartition(auth));
  return url.toString();
}

function cacheResponse(request, response) {
  const clone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(cacheKeyFor(request), clone));
  return response;
}

function networkFirstWithTimeout(event, fallback) {
  const request = event.request;
  const key = cacheKeyFor(request);
  const network = fetch(request).then((response) => cacheResponse(request, response));
  event.waitUntil(network.then(() => undefined, () => undefined));
  const networkOrCache = network.catch(() =>
    caches.match(key).then((r) => r || (fallback ? fallback() : undefined)),
  );
  let timer = null;
  const cacheAfterTimeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      caches.match(key).then(resolve, () => resolve(undefined));
    }, NETWORK_TIMEOUT_MS);
  });
  return Promise.race([networkOrCache, cacheAfterTimeout]).then((response) => {
    clearTimeout(timer);
    return response || networkOrCache;
  });
}

/** GET lecture mode visite : stale-while-revalidate (réponse immédiate + rafraîchissement réseau). */
function isVisitReadApiPath(pathname) {
  return pathname.endsWith('/api/maps')
    || pathname.endsWith('/api/visit/content');
}

function staleWhileRevalidate(request) {
  const key = cacheKeyFor(request);
  return caches.open(CACHE_NAME).then((cache) => cache.match(key).then((cached) => {
    const networkPromise = fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(key, response.clone());
        }
        return response;
      })
      .catch(() => null);
    if (cached) {
      networkPromise.catch(() => {});
      return cached;
    }
    return networkPromise.then((response) => response || undefined);
  }));
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {
        // index.vite.html peut être absent en dev public/ : ignorer l’échec global
        return Promise.all(
          STATIC_ASSETS.map((url) => cache.add(url).catch(() => undefined))
        );
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;
  const url = new URL(event.request.url);

  // HTML en network-first ; fallback vers /offline.html si hors-ligne
  if (
    url.pathname === '/'
    || url.pathname === '/index.html'
    || url.pathname.endsWith('/index.vite.html')
  ) {
    event.respondWith(networkFirstWithTimeout(event, () => caches.match('/offline.html')));
    return;
  }

  // Mode visite : stale-while-revalidate (contenu, cartes, progression)
  if (isVisitReadApiPath(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Stratégie network-first (avec délai) pour les autres API cachées ; fallback silencieux
  if (API_CACHE_URLS.some((p) => url.pathname === p)) {
    event.respondWith(networkFirstWithTimeout(event));
    return;
  }

  // Stratégie network-first pour JS/CSS afin d'éviter de servir des bundles obsolètes.
  if (url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first pour les assets statiques (images, fonts, icônes)
  if (
    url.pathname.endsWith('.png')
    || url.pathname.endsWith('.jpg')
    || url.pathname.endsWith('.jpeg')
    || url.pathname.endsWith('.svg')
    || url.pathname.endsWith('.ico')
    || url.pathname.endsWith('.webp')
    || url.pathname.endsWith('.woff2')
    || url.pathname.endsWith('.woff')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
  }
});
