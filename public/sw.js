const CACHE_NAME = 'foretmap-offline-v8';
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

/** GET lecture mode visite : stale-while-revalidate (réponse immédiate + rafraîchissement réseau). */
function isVisitReadApiPath(pathname) {
  return pathname.endsWith('/api/maps')
    || pathname.endsWith('/api/visit/content');
}

function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) => cache.match(request).then((cached) => {
    const networkPromise = fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone());
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
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match('/offline.html')))
    );
    return;
  }

  // Mode visite : stale-while-revalidate (contenu, cartes, progression)
  if (isVisitReadApiPath(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Stratégie network-first pour les autres API cachées ; fallback silencieux
  if (API_CACHE_URLS.some((p) => url.pathname === p)) {
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
