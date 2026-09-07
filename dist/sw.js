/* Service worker « foret » — GÉNÉRÉ par scripts/build-pwa.js depuis
 * src/shared/pwa/swTemplate.js : ne pas éditer, modifier le gabarit puis relancer le build. */
const CACHE_NAME = "foretmap-foret-3cd28118";
const OFFLINE_PATH = "/offline.html";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/index.vite.html",
  "/offline.html",
  "/manifest.json",
  "/app-logo-n3.png",
  "/icon.svg",
  "/favicon-n3.png",
  "/favicon.ico",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-maskable-512.png",
  "/pwa-screenshot-mobile.png",
  "/pwa-screenshot-wide.png",
  "/assets/main-CvLOuC9F.js",
  "/assets/rolldown-runtime-hePW80VL.js",
  "/assets/VisitMascotFallbackSvg-LqZJKfO_.js",
  "/assets/react-vendor-BgNqN-ZP.js",
  "/assets/icons-DFe2XkUX.js",
  "/assets/ErrorBoundary-CjtHtE6r.js",
  "/assets/ErrorBoundary-1Md48zKX.css",
  "/assets/ImageLightboxProvider-GNfi-Pwq.js",
  "/assets/ImageLightboxProvider-CPh0j32G.css",
  "/assets/spriteCutCatalogEntry-CFCTO90B.js",
  "/assets/markdown-B5dU4qij.js",
  "/assets/visitMascotPackExtras-BPtR6Zca.js",
  "/assets/visitMascotPackExtras-BLkqnenv.css",
  "/assets/mascotPack-C8cF-WoW.js",
  "/assets/socket-io-vr1n1Td3.js",
  "/assets/MarkdownTextarea-B9CXMMAg.js",
  "/assets/GlossaryMarkdown-dLqU_Tz2.js",
  "/assets/DataContext-Cd87pLbt.js",
  "/assets/PublicSettingsContext-wk5Xv3K2.js",
  "/assets/useBrandTheme-BNX4gz3z.js",
  "/assets/downloadApiFile-BAmK39h2.js",
  "/assets/downloadAuthedFile-BRkwVwdZ.js",
];

// Entrées HTML servies en network-first (correspondance exacte du pathname).
const HTML_ENTRIES = [
  "/",
  "/index.html",
  "/index.vite.html",
];

// API en lecture « stale-while-revalidate » (correspondance par suffixe du pathname).
const API_STALE_WHILE_REVALIDATE = [
  "/api/maps",
  "/api/visit/content",
];

// API en lecture « network-first » (correspondance exacte du pathname).
const API_NETWORK_FIRST = [
  "/api/zones",
  "/api/plants",
  "/api/map/markers",
  "/api/tasks",
];

const IMAGE_FONT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp', '.woff2', '.woff'];

function isHtmlEntry(pathname) {
  return HTML_ENTRIES.some((entry) => pathname === entry);
}

function isStaleWhileRevalidateApi(pathname) {
  return API_STALE_WHILE_REVALIDATE.some((suffix) => pathname.endsWith(suffix));
}

function isNetworkFirstApi(pathname) {
  return API_NETWORK_FIRST.some((exact) => pathname === exact);
}

/** Bundles hachés par Vite : immuables, donc cache-first sans risque de version obsolète. */
function isHashedAsset(pathname) {
  return pathname.includes('/assets/');
}

function isScriptOrStyle(pathname) {
  return pathname.endsWith('.css') || pathname.endsWith('.js');
}

function isImageOrFont(pathname) {
  return IMAGE_FONT_EXTENSIONS.some((ext) => pathname.endsWith(ext));
}

function putInCache(request, response) {
  const clone = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  return response;
}

function networkFirst(request, fallback) {
  return fetch(request)
    .then((response) => putInCache(request, response))
    .catch(() => caches.match(request).then((cached) => cached || (fallback ? fallback() : undefined)));
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => putInCache(request, response));
  });
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
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {
        // Une entrée absente ne doit pas faire échouer toute l'installation.
        return Promise.all(
          PRECACHE_URLS.map((url) => cache.add(url).catch(() => undefined))
        );
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;
  const url = new URL(event.request.url);

  // HTML en network-first ; repli vers la page hors ligne.
  if (isHtmlEntry(url.pathname)) {
    event.respondWith(networkFirst(event.request, () => caches.match(OFFLINE_PATH)));
    return;
  }

  // Lecture « visite » : stale-while-revalidate (réponse immédiate + rafraîchissement réseau).
  if (isStaleWhileRevalidateApi(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Autres API cachées : network-first, repli cache silencieux.
  if (isNetworkFirstApi(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Bundles hachés (/assets/*) : cache-first, ils ne changent jamais sous le même nom.
  if (isHashedAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // JS/CSS non hachés : network-first pour ne jamais servir une version obsolète.
  if (isScriptOrStyle(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Images, icônes, fontes : cache-first.
  if (isImageOrFont(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
  }
});
