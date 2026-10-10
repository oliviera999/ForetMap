/* Service worker « plan » — GÉNÉRÉ par scripts/build-pwa.js depuis
 * src/shared/pwa/swTemplate.js : ne pas éditer, modifier le gabarit puis relancer le build. */
const CACHE_NAME = "foretmap-plan-db6899c1";
const OFFLINE_PATH = "/offline.html";
const PRECACHE_URLS = [
  "/",
  "/plan.html",
  "/offline.html",
  "/manifest.json",
  "/plan/favicon.ico",
  "/plan/favicon.svg",
  "/plan/pwa-icon-192.png",
  "/plan/pwa-icon-512.png",
  "/plan/pwa-maskable-512.png",
  "/plan/apple-touch-icon.png",
  "/plan/favicon-32.png",
  "/plan/favicon-16.png",
  "/assets/plan-C5kEA3xd.js",
  "/assets/rolldown-runtime-hePW80VL.js",
  "/assets/VisitMascotFallbackSvg-DvkFty0O.js",
  "/assets/react-vendor-BNMpBqeq.js",
  "/assets/icons-DekDW1tn.js",
  "/assets/dragReleaseClickGuard-CXy-elI4.js",
  "/assets/dragReleaseClickGuard-XjQuBVie.css",
  "/assets/HelpDock-lu3hmYKa.js",
  "/assets/HelpDock-DbVxb166.css",
  "/assets/AppPlan-kC_fhapp.js",
  "/assets/AppPlan-B3bTls46.css",
  "/assets/useBrandTheme-CHjBmM8T.js",
  "/assets/useBrandTheme-BpdSH9YF.css",
  "/assets/placeSearch-D5MGmDsl.js",
  "/assets/placeStatus-Q1NnX946.js",
  "/assets/useMapGuidance-BdaaKFyX.js",
];

// Entrées HTML servies en network-first (correspondance exacte du pathname).
const HTML_ENTRIES = [
  "/",
  "/plan.html",
];

// API en lecture « stale-while-revalidate » (correspondance par suffixe du pathname).
const API_STALE_WHILE_REVALIDATE = [
  "/api/plan/content",
  "/api/plan/settings",
];

// API en lecture « network-first » (correspondance exacte du pathname).
const API_NETWORK_FIRST = [];

// Lectures « network-first » reconnues par motif (listes de photos d'un lieu, aperçu d'un
// tutoriel…), utiles hors ligne après une préparation de sortie terrain.
const API_NETWORK_FIRST_PATTERNS = [].map(
  (source) => new RegExp(source),
);

// Délai d'attente du réseau des lectures network-first (HTML, API), en millisecondes ;
// 0 = pas de délai. Au-delà, la copie en cache part si elle existe.
const NETWORK_TIMEOUT_MS = 4000;

const IMAGE_FONT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.avif', '.svg', '.ico', '.webp', '.woff2', '.woff'];

// Images et fontes vont dans un cache à part, borné : photos d'élèves et de zones
// s'accumulaient sans limite ni durée de vie (docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md).
// Nom stable d'un build à l'autre : les photos survivent à une mise à jour de l'application.
const IMAGE_CACHE_NAME = "foretmap-plan-images";
const IMAGE_CACHE_MAX_ENTRIES = 200;
const IMAGE_CACHE_MAX_AGE_MS = 604800000;

// Cache « sortie terrain » : ce que l'élève a demandé de garder avant de partir (photos des
// lieux et des espèces, aperçus de tutoriels…). Nom stable, non borné par la purge des
// images, vidé à chaque nouvelle préparation et à la déconnexion (médias d'élèves).
const TERRAIN_CACHE_NAME = "foretmap-plan-terrain";
const TERRAIN_HEADER = 'X-Foretmap-Terrain';
// Posé sur une copie servie faute de réponse du réseau : le client y lit un réseau inutilisable.
const SW_CACHE_FALLBACK_HEADER = 'X-Foretmap-SW-Cache';

function isHtmlEntry(pathname) {
  return HTML_ENTRIES.some((entry) => pathname === entry);
}

function isStaleWhileRevalidateApi(pathname) {
  return API_STALE_WHILE_REVALIDATE.some((suffix) => pathname.endsWith(suffix));
}

function isNetworkFirstApi(pathname) {
  return (
    API_NETWORK_FIRST.some((exact) => pathname === exact) ||
    API_NETWORK_FIRST_PATTERNS.some((re) => re.test(pathname))
  );
}

function wantsTerrainCopy(request) {
  const headers = request && request.headers;
  return !!headers && typeof headers.get === 'function' && headers.get(TERRAIN_HEADER) === '1';
}

function putInTerrainCache(key, response) {
  if (!response || !response.ok) return;
  const clone = response.clone();
  caches.open(TERRAIN_CACHE_NAME).then((cache) => cache.put(key, clone)).catch(() => undefined);
}

/** Copie de secours marquée comme telle (le corps n'est pas relu, seulement réemballé). */
function markAsCacheFallback(response) {
  if (!response) return response;
  try {
    const headers = new Headers(response.headers);
    headers.set(SW_CACHE_FALLBACK_HEADER, '1');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (_) {
    return response;
  }
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

/**
 * Empreinte courte d'un jeton (FNV-1a, deux germes). Sert à séparer des comptes dans le
 * cache, pas à protéger le jeton : la Cache API indexe par URL seule, les en-têtes
 * (Authorization compris) n'en font pas partie
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

function authorizationOf(request) {
  const headers = request && request.headers;
  if (!headers || typeof headers.get !== 'function') return '';
  return String(headers.get('Authorization') || headers.get('authorization') || '');
}

/**
 * Clé de cache d'une lecture. Sans jeton (visite anonyme, coquille HTML, fichiers) : la
 * requête telle quelle, partagée. Avec jeton : la même URL plus une empreinte du compte.
 * Sans cela, le délai réseau et le « stale-while-revalidate » resservent sur une tablette
 * partagée la réponse du compte précédent — y compris les lieux réservés de la visite,
 * que la déconnexion laisse en cache parce qu'elle les croit publics.
 */
function cacheKeyFor(request) {
  const auth = authorizationOf(request);
  const url = new URL(request.url);
  // Code d'accès d'un lien de plan (`?code=`, QR code interne) : il ouvre le plan une fois,
  // puis quitte l'adresse ; il n'a rien à faire dans la clé d'une copie hors ligne, qui le
  // garderait sur l'appareil. La requête réseau, elle, part telle quelle.
  const hadCode = url.searchParams.has('code');
  if (hadCode) url.searchParams.delete('code');
  if (!auth) return hadCode ? url.toString() : request;
  url.searchParams.set('__fm_sw_user', authCachePartition(auth));
  return url.toString();
}

/**
 * Clé de cache d'une image. Les médias d'élèves (`/uploads/students/…`, forum, tâches…)
 * sont lus par URL **signée** (`?exp=…&sig=…`, lib/uploadsSignedUrls.js) dont la requête
 * change toutes les heures : la garder dans la clé remplirait le cache borné de doublons de
 * la même photo et ferait manquer, hors ligne, la copie déjà téléchargée. La clé retire donc
 * `exp` et `sig` ; la requête réseau, elle, part avec sa signature. La purge des médias
 * à la déconnexion (`/uploads/` dans le chemin) reste inchangée.
 */
function imageCacheKeyFor(request) {
  const key = cacheKeyFor(request);
  const url = new URL(typeof key === 'string' ? key : request.url);
  if (!url.pathname.includes('/uploads/') || !url.searchParams.has('sig')) return key;
  url.searchParams.delete('sig');
  url.searchParams.delete('exp');
  return url.toString();
}

/** Retire une entrée du cache (révocation) — sans bruit si elle n'y était pas. */
function evictFromCache(request) {
  return caches.open(CACHE_NAME).then((cache) => cache.delete(cacheKeyFor(request))).catch(() => undefined);
}

/** Le serveur interdit toute copie (images privées : `private, no-store`). */
function forbidsStorage(response) {
  const headers = response && response.headers;
  if (!headers || typeof headers.get !== 'function') return false;
  return /no-store/i.test(String(headers.get('Cache-Control') || ''));
}

function putInCache(request, response) {
  // Seules les réponses valides sont mémorisées. Auparavant une 401 ou une 500 devenait la
  // réponse servie hors ligne : l'erreur d'un instant se figeait pour la durée du cache.
  const key = cacheKeyFor(request);
  if (response && response.ok && !forbidsStorage(response)) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(key, clone));
    if (wantsTerrainCopy(request)) putInTerrainCache(key, response);
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
  const key = cacheKeyFor(request);
  const network = fetch(request).then((response) => putInCache(request, response));
  if (options.event && typeof options.event.waitUntil === 'function') {
    options.event.waitUntil(network.then(() => undefined, () => undefined));
  }
  const networkOrCache = network.catch(() =>
    caches
      .match(key)
      .then((cached) => (cached ? markAsCacheFallback(cached) : fallback ? fallback() : undefined)),
  );
  if (timeoutMs <= 0) return networkOrCache;
  let timer = null;
  const cacheAfterTimeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      caches
        .match(key)
        .then((cached) => resolve(cached ? markAsCacheFallback(cached) : undefined), () => resolve(undefined));
    }, timeoutMs);
  });
  return Promise.race([networkOrCache, cacheAfterTimeout]).then((response) => {
    clearTimeout(timer);
    // Délai écoulé sans copie en cache : on attend le réseau (ou son repli).
    return response || networkOrCache;
  });
}

function cacheFirst(request) {
  const key = cacheKeyFor(request);
  return caches.match(key).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => putInCache(request, response));
  });
}

/** Copie plus vieille que la durée de vie du cache d'images (en-tête `Date` de la réponse). */
function isExpiredImage(response) {
  const headers = response && response.headers;
  if (!headers || typeof headers.get !== 'function') return false;
  const date = Date.parse(String(headers.get('Date') || ''));
  return Number.isFinite(date) && Date.now() - date > IMAGE_CACHE_MAX_AGE_MS;
}

/** Retire les entrées les plus anciennes au-delà de la borne (`keys()` suit l'ordre d'ajout). */
function trimImageCache(cache) {
  return cache.keys().then((keys) => {
    const excess = keys.length - IMAGE_CACHE_MAX_ENTRIES;
    if (excess <= 0) return undefined;
    return Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
  });
}

/**
 * Images et fontes : cache d'abord, dans un cache borné en taille et en âge. Une copie
 * expirée est redemandée au réseau, et resservie seulement s'il ne répond pas. Un refus
 * d'accès (401/403) ou une disparition (404) retire la copie : une photo dont l'accès a été
 * révoqué ou qui a été supprimée n'est plus rejouée depuis l'appareil.
 */
function imageCacheFirst(request) {
  const key = imageCacheKeyFor(request);
  const terrain = wantsTerrainCopy(request);
  return caches.match(key).then((cached) => {
    if (cached && !isExpiredImage(cached)) {
      if (terrain) putInTerrainCache(key, cached);
      return cached;
    }
    return fetch(request)
      .then((response) => {
        if (response && response.ok && !forbidsStorage(response)) {
          if (terrain) putInTerrainCache(key, response);
          const clone = response.clone();
          caches
            .open(IMAGE_CACHE_NAME)
            .then((cache) => cache.delete(key).then(() => cache.put(key, clone)).then(() => trimImageCache(cache)))
            .catch(() => undefined);
        } else if (response && (isAuthRefusal(response) || response.status === 404 || forbidsStorage(response))) {
          evictFromCache(request);
          caches.open(IMAGE_CACHE_NAME).then((cache) => cache.delete(key)).catch(() => undefined);
          caches.open(TERRAIN_CACHE_NAME).then((cache) => cache.delete(key)).catch(() => undefined);
        }
        return response;
      })
      .catch((err) => {
        if (cached) return cached;
        throw err;
      });
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
  const key = cacheKeyFor(request);
  return caches.open(CACHE_NAME).then((cache) => cache.match(key).then((cached) => {
    const networkPromise = fetch(request)
      .then((response) => {
        if (response && response.ok) {
          cache.put(key, response.clone());
        } else if (isAuthRefusal(response)) {
          cache.delete(key);
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
      names
        .filter((name) => name !== CACHE_NAME && name !== IMAGE_CACHE_NAME && name !== TERRAIN_CACHE_NAME)
        .map((name) => caches.delete(name))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;
  const url = new URL(event.request.url);
  // Le fetch() du worker relève de connect-src 'self' (CSP imposée) : une image tierce
  // interceptée ici serait bloquée, on la laisse au navigateur.
  if (url.origin !== self.location.origin) return;

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

  // Images, icônes, fontes : cache-first, cache borné.
  if (isImageOrFont(url.pathname)) {
    event.respondWith(imageCacheFirst(event.request));
  }
});
