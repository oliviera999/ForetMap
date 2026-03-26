const CACHE_NAME = 'foretmap-offline-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/map.png',
  '/maps/map-foret.svg',
  '/maps/map-n3.svg',
  '/maps/plan%20n3.jpg',
];

// URLs d'API à mettre en cache pour la consultation hors-ligne
const API_CACHE_URLS = [
  '/api/zones',
  '/api/plants',
  '/api/map/markers',
  '/api/tasks',
];

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;
  const url = new URL(event.request.url);

  // HTML en network-first pour récupérer les dernières versions quand en ligne.
  if (
    (url.pathname === '/' || url.pathname === '/index.html')
  ) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stratégie network-first pour les API cachées
  if (API_CACHE_URLS.some(p => url.pathname === p)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stratégie network-first pour JS/CSS afin d'éviter de servir des bundles obsolètes.
  if ((
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  )) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
});
