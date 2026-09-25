/* Service worker « staff » — GÉNÉRÉ par scripts/build-pwa.js depuis
 * src/shared/pwa/swTemplate.js : ne pas éditer, modifier le gabarit puis relancer le build. */
const CACHE_NAME = "foretmap-staff-7bc3d2ed";
const OFFLINE_PATH = "/offline.html";
const PRECACHE_URLS = [
  "/",
  "/staff.html",
  "/offline.html",
  "/manifest.json",
  "/staff/favicon.svg",
  "/plan/favicon.ico",
  "/plan/pwa-icon-192.png",
  "/plan/pwa-icon-512.png",
  "/plan/pwa-maskable-512.png",
  "/plan/apple-touch-icon.png",
  "/plan/favicon-32.png",
  "/plan/favicon-16.png",
  "/assets/staff-B3Qw4n5Q.js",
  "/assets/staff-Bf5NeZrP.css",
  "/assets/rolldown-runtime-hePW80VL.js",
  "/assets/AppDialogsProvider-CUmLvb03.js",
  "/assets/react-vendor-Dcb_X5td.js",
  "/assets/icons-BNguv2wG.js",
  "/assets/ErrorBoundary-DJUq7ldA.js",
  "/assets/ErrorBoundary-1Md48zKX.css",
  "/assets/HelpDock-B2KhYiH4.js",
  "/assets/HelpDock-ML7ofH8p.css",
  "/assets/AppPlan-BODHWGZG.js",
  "/assets/AppPlan-C5aqB9eM.css",
  "/assets/useBrandTheme-0ZMmOHi1.js",
  "/assets/placeSearch-oEXvS_TX.js",
  "/assets/placeStatus-Q1NnX946.js",
  "/assets/useMapGuidance-CIk0rN4I.js",
];

// Entrées HTML servies en network-first (correspondance exacte du pathname).
const HTML_ENTRIES = [
  "/",
  "/staff.html",
];

// API en lecture « stale-while-revalidate » (correspondance par suffixe du pathname).
const API_STALE_WHILE_REVALIDATE = [];

// API en lecture « network-first » (correspondance exacte du pathname).
const API_NETWORK_FIRST = [];

// Délai d'attente du réseau des lectures network-first (HTML, API), en millisecondes ;
// 0 = pas de délai. Au-delà, la copie en cache part si elle existe.
const NETWORK_TIMEOUT_MS = 4000;

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

/**
 * Une réponse d'autorisation refusée : le laissez-passer a été révoqué, le code changé, ou
 * le rôle du lecteur a évolué. Le cache qui porte encore l'ancienne réponse doit être vidé,
 * sans quoi l'appareil rejouerait indéfiniment un contenu auquel il n'a plus droit
 * (docs/AUDIT_SECURITE_2026-09-22.md, constat S8).
 */
function isAuthRefusal(response) {
  return !!response && (response.status === 401 || response.status === 403);
}

/** Retire une entrée du cache (révocation) — sans bruit si elle n'y était pas. */
function evictFromCache(request) {
  return caches.open(CACHE_NAME).then((cache) => cache.delete(request)).catch(() => undefined);
}

function putInCache(request, response) {
  // Seules les réponses valides sont mémorisées. Auparavant une 401 ou une 500 devenait la
  // réponse servie hors ligne : l'erreur d'un instant se figeait pour la durée du cache.
  if (response && response.ok) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  } else if (isAuthRefusal(response)) {
    evictFromCache(request);
  }
  return response;
}

/**
 * Réseau d'abord, avec délai d'attente facultatif — sur le modèle de l'option
 * `networkTimeoutSeconds` de la stratégie `NetworkFirst` de Workbox (Google, licence MIT ;
 * https://developer.chrome.com/docs/workbox/modules/workbox-strategies ,
 * source : https://github.com/GoogleChrome/workbox/blob/v7/packages/workbox-strategies/src/NetworkFirst.ts ).
 * Même contrat, réécrit ici sans la dépendance :
 *   - le réseau répond avant le délai → sa réponse (mise en cache si valide) ;
 *   - le délai expire → la copie en cache si elle existe ; SINON on continue d'attendre le
 *     réseau (une page qui arrive tard vaut mieux qu'une page vide) ;
 *   - le réseau échoue → la copie en cache, puis le repli (`offline.html` pour le HTML).
 * La réponse réseau arrivée après le délai met quand même le cache à jour : `waitUntil`
 * garde le service worker en vie le temps de l'écrire.
 *
 * @param {Request} request
 * @param {() => Promise<Response|undefined>} [fallback]
 * @param {{ event?: FetchEvent, timeoutMs?: number }} [options]
 */
function networkFirst(request, fallback, options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 0;
  const network = fetch(request).then((response) => putInCache(request, response));
  if (options.event && typeof options.event.waitUntil === 'function') {
    options.event.waitUntil(network.then(() => undefined, () => undefined));
  }
  const networkOrCache = network.catch(() =>
    caches.match(request).then((cached) => cached || (fallback ? fallback() : undefined)),
  );
  if (timeoutMs <= 0) return networkOrCache;
  let timer = null;
  const cacheAfterTimeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      caches.match(request).then(resolve, () => resolve(undefined));
    }, timeoutMs);
  });
  return Promise.race([networkOrCache, cacheAfterTimeout]).then((response) => {
    clearTimeout(timer);
    // Délai écoulé sans copie en cache : on attend le réseau (ou son repli).
    return response || networkOrCache;
  });
}

function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => putInCache(request, response));
  });
}

/**
 * Lecture « stale-while-revalidate » : la réponse mémorisée part tout de suite, le réseau
 * rafraîchit derrière. C'est ce qui rend le plan consultable sans réseau — un visiteur qui
 * scanne le QR code à l'entrée de l'établissement n'a pas toujours de connexion.
 *
 * **Révocation** : si le rafraîchissement revient en 401/403, l'entrée est retirée du cache.
 * Le contenu périmé a donc pu être servi **une dernière fois** (la réponse était déjà partie
 * quand le réseau a tranché) ; le chargement suivant renvoie à l'écran de code. Servir le
 * réseau d'abord supprimerait ce dernier affichage, mais au prix du hors-ligne, qui est la
 * raison d'être de cette stratégie.
 */
function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) => cache.match(request).then((cached) => {
    const networkPromise = fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone());
        } else if (isAuthRefusal(response)) {
          cache.delete(request);
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
    event.respondWith(
      networkFirst(event.request, () => caches.match(OFFLINE_PATH), {
        event,
        timeoutMs: NETWORK_TIMEOUT_MS,
      }),
    );
    return;
  }

  // Lecture « visite » : stale-while-revalidate (réponse immédiate + rafraîchissement réseau).
  if (isStaleWhileRevalidateApi(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Autres API cachées : network-first (avec délai), repli cache silencieux.
  if (isNetworkFirstApi(url.pathname)) {
    event.respondWith(networkFirst(event.request, null, { event, timeoutMs: NETWORK_TIMEOUT_MS }));
    return;
  }

  // Bundles hachés (/assets/*) : cache-first, ils ne changent jamais sous le même nom.
  if (isHashedAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // JS/CSS non hachés : network-first SANS délai — ne jamais servir une version obsolète.
  if (isScriptOrStyle(url.pathname)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Images, icônes, fontes : cache-first.
  if (isImageOrFont(url.pathname)) {
    event.respondWith(cacheFirst(event.request));
  }
});
