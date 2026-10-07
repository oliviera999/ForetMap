'use strict';

/**
 * Gabarit commun du service worker et du manifest PWA, un rendu par produit
 * (docs/AUDIT_PLAN_LYAUTEY_2026-09.md §8.8, docs/AUDIT_CONVERGENCE_APPS_2026-09.md §5.2).
 *
 * Module CommonJS volontairement (pas d'ESM) : il est consommé par `scripts/build-pwa.js`
 * au build et par `lib/pwaRoutes.js` hors production (manifest généré à la volée), jamais
 * par le bundle navigateur. Les stratégies reprennent celles de `public/sw.js` (source
 * historique, conservé pour le mode dev) :
 *   - HTML (entrées listées) en network-first, repli sur le cache puis `offline.html` ;
 *   - API « lecture visite » en stale-while-revalidate (liste `apiStaleWhileRevalidate`) ;
 *   - autres API cachées en network-first, repli cache silencieux (liste `apiNetworkFirst`) ;
 *   - pour ces deux network-first, un **délai d'attente du réseau** (`networkTimeoutSeconds`,
 *     4 s par défaut) : au-delà, la copie en cache est servie si elle existe ;
 *   - `/assets/*` (bundles hachés par Vite, immuables) en cache-first — remplace le
 *     network-first historique sur JS/CSS, devenu inutile puisque le nom change à chaque build ;
 *   - JS/CSS hors `/assets/` (non hachés) en network-first, comme avant ;
 *   - images, icônes et fontes en cache-first, dans un cache à part borné (200 entrées, 7 jours),
 *     purgé d'une copie révoquée (401/403) ou supprimée (404) ; jamais de copie d'une réponse
 *     \`no-store\` ; clé sans la signature \`exp\`/\`sig\` des médias \`/uploads/\` signés ;
 *   - message `SKIP_WAITING`, purge des anciens caches à l'activation ;
 *   - une copie servie faute de réponse du réseau porte l'en-tête `X-Foretmap-SW-Cache: 1` :
 *     le client y lit un réseau inutilisable (`src/shared/networkStatus.js`) ;
 *   - cache « sortie terrain » (`<produit>-terrain`, nom stable, survit aux mises à jour) :
 *     toute lecture marquée `X-Foretmap-Terrain: 1` y est aussi copiée
 *     (`src/services/fieldTripPrep.js`) ;
 *   - option `outboxSync` : rejeu en arrière-plan des écritures gardées hors ligne
 *     (Background Sync, Chromium/Android), lues dans IndexedDB (`src/utils/offlineDb.js`).
 * Toute évolution de stratégie se fait ICI, puis `npm run build` régénère `dist/sw-<produit>.js`.
 */

/**
 * Base IndexedDB partagée avec la page (`src/utils/offlineDb.js` — mêmes valeurs, vérifiées
 * par `tests/pwa-sw-template.test.js`).
 */
const OFFLINE_DB_NAME = 'foretmap-offline';
const OFFLINE_DB_VERSION = 1;
const OFFLINE_DB_STORES = Object.freeze({ photos: 'photos', outbox: 'outbox' });
/** Étiquette Background Sync du rejeu des écritures gardées hors ligne. */
const OUTBOX_SYNC_TAG = 'foretmap-outbox';
/** Message envoyé aux pages après un rejeu en arrière-plan. */
const OUTBOX_REPLAYED_MESSAGE = 'FORETMAP_OUTBOX_REPLAYED';

/**
 * Délai d'attente du réseau des lectures network-first (HTML et API mises en cache), en
 * secondes. Sur le terrain, un réseau « présent mais inutilisable » (une barre, Wi-Fi saturé
 * d'une classe entière) ne rejette jamais la requête : sans délai, l'élève attendait jusqu'à
 * l'abandon du navigateur, une minute et plus, alors qu'une copie était en cache (audit du
 * 25/09/2026, § 1.4.6 et § 2.4).
 */
const DEFAULT_NETWORK_TIMEOUT_SECONDS = 4;

/** Borne du cache d'images : nombre d'entrées (les plus anciennes sortent d'abord) et âge. */
const IMAGE_CACHE_MAX_ENTRIES = 200;
const IMAGE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Sérialise une liste de chaînes en littéral JS lisible (une entrée par ligne). */
function renderStringList(values) {
  const list = Array.isArray(values) ? values : [];
  if (list.length === 0) return '[]';
  return `[\n${list.map((value) => `  ${JSON.stringify(String(value))},`).join('\n')}\n]`;
}

/**
 * Source du service worker d'un produit.
 * @param {object} options
 * @param {string} options.product Identifiant du produit (commentaire d'en-tête).
 * @param {string} options.cacheName Nom du cache (inclure un hash du précache pour invalider à chaque build).
 * @param {string[]} options.precache URLs absolues (même origine) à précacher à l'installation.
 * @param {string[]} options.htmlEntries Chemins HTML servis en network-first (`/`, `/index.html`, entrée Vite…).
 * @param {string[]} [options.apiStaleWhileRevalidate] Chemins d'API en stale-while-revalidate (correspondance par suffixe).
 * @param {string[]} [options.apiNetworkFirst] Chemins d'API en network-first (correspondance exacte).
 * @param {string[]} [options.apiNetworkFirstPatterns] Sources d'expressions régulières (sur le
 *   pathname) servies en network-first — listes de photos d'un lieu, aperçu d'un tutoriel…
 * @param {boolean} [options.outboxSync] Rejeu en arrière-plan des écritures hors ligne.
 * @param {string} [options.offlinePath] Page de repli hors ligne (`/offline.html`).
 * @param {number} [options.networkTimeoutSeconds] Délai d'attente du réseau des lectures
 *   network-first (HTML, API) avant de servir le cache ; `0` le désactive.
 * @returns {string}
 */
function renderServiceWorker({
  product,
  cacheName,
  precache,
  htmlEntries,
  apiStaleWhileRevalidate = [],
  apiNetworkFirst = [],
  apiNetworkFirstPatterns = [],
  outboxSync = false,
  offlinePath = '/offline.html',
  networkTimeoutSeconds = DEFAULT_NETWORK_TIMEOUT_SECONDS,
}) {
  for (const source of apiNetworkFirstPatterns) {
    // Fail fast au build plutôt qu'un service worker qui ne s'installe pas.
    RegExp(source);
  }
  if (!product || typeof product !== 'string') throw new TypeError('product requis');
  if (
    typeof networkTimeoutSeconds !== 'number' ||
    !Number.isFinite(networkTimeoutSeconds) ||
    networkTimeoutSeconds < 0
  ) {
    throw new TypeError('networkTimeoutSeconds doit être un nombre positif ou nul');
  }
  const networkTimeoutMs = Math.round(networkTimeoutSeconds * 1000);
  if (!cacheName || typeof cacheName !== 'string') throw new TypeError('cacheName requis');
  if (!Array.isArray(precache)) throw new TypeError('precache doit être un tableau');
  if (!Array.isArray(htmlEntries) || htmlEntries.length === 0) {
    throw new TypeError('htmlEntries doit contenir au moins une entrée');
  }
  // Pas de doublons dans le précache : `cache.addAll` échoue sur deux requêtes identiques.
  const uniquePrecache = [...new Set(precache.map(String))];
  const html = [...new Set(htmlEntries.map(String))];

  return `/* Service worker « ${product} » — GÉNÉRÉ par scripts/build-pwa.js depuis
 * src/shared/pwa/swTemplate.js : ne pas éditer, modifier le gabarit puis relancer le build. */
const CACHE_NAME = ${JSON.stringify(cacheName)};
const OFFLINE_PATH = ${JSON.stringify(offlinePath)};
const PRECACHE_URLS = ${renderStringList(uniquePrecache)};

// Entrées HTML servies en network-first (correspondance exacte du pathname).
const HTML_ENTRIES = ${renderStringList(html)};

// API en lecture « stale-while-revalidate » (correspondance par suffixe du pathname).
const API_STALE_WHILE_REVALIDATE = ${renderStringList(apiStaleWhileRevalidate)};

// API en lecture « network-first » (correspondance exacte du pathname).
const API_NETWORK_FIRST = ${renderStringList(apiNetworkFirst)};

// Lectures « network-first » reconnues par motif (listes de photos d'un lieu, aperçu d'un
// tutoriel…), utiles hors ligne après une préparation de sortie terrain.
const API_NETWORK_FIRST_PATTERNS = ${renderStringList(apiNetworkFirstPatterns)}.map(
  (source) => new RegExp(source),
);

// Délai d'attente du réseau des lectures network-first (HTML, API), en millisecondes ;
// 0 = pas de délai. Au-delà, la copie en cache part si elle existe.
const NETWORK_TIMEOUT_MS = ${networkTimeoutMs};

const IMAGE_FONT_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.avif', '.svg', '.ico', '.webp', '.woff2', '.woff'];

// Images et fontes vont dans un cache à part, borné : photos d'élèves et de zones
// s'accumulaient sans limite ni durée de vie (docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md).
// Nom stable d'un build à l'autre : les photos survivent à une mise à jour de l'application.
const IMAGE_CACHE_NAME = ${JSON.stringify(`${cacheName.replace(/-[0-9a-f]{8}$/i, '')}-images`)};
const IMAGE_CACHE_MAX_ENTRIES = ${IMAGE_CACHE_MAX_ENTRIES};
const IMAGE_CACHE_MAX_AGE_MS = ${IMAGE_CACHE_MAX_AGE_MS};

// Cache « sortie terrain » : ce que l'élève a demandé de garder avant de partir (photos des
// lieux et des espèces, aperçus de tutoriels…). Nom stable, non borné par la purge des
// images, vidé à chaque nouvelle préparation et à la déconnexion (médias d'élèves).
const TERRAIN_CACHE_NAME = ${JSON.stringify(`${cacheName.replace(/-[0-9a-f]{8}$/i, '')}-terrain`)};
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
  if (!auth) return request;
  const url = new URL(request.url);
  url.searchParams.set('__fm_sw_user', authCachePartition(auth));
  return url.toString();
}

/**
 * Clé de cache d'une image. Les médias d'élèves (\`/uploads/students/…\`, forum, tâches…)
 * sont lus par URL **signée** (\`?exp=…&sig=…\`, lib/uploadsSignedUrls.js) dont la requête
 * change toutes les heures : la garder dans la clé remplirait le cache borné de doublons de
 * la même photo et ferait manquer, hors ligne, la copie déjà téléchargée. La clé retire donc
 * \`exp\` et \`sig\` ; la requête réseau, elle, part avec sa signature. La purge des médias
 * à la déconnexion (\`/uploads/\` dans le chemin) reste inchangée.
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

/** Le serveur interdit toute copie (images privées : \`private, no-store\`). */
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
 * \`networkTimeoutSeconds\` de la stratégie \`NetworkFirst\` de Workbox (Google, licence MIT ;
 * https://developer.chrome.com/docs/workbox/modules/workbox-strategies ,
 * source : https://github.com/GoogleChrome/workbox/blob/v7/packages/workbox-strategies/src/NetworkFirst.ts ).
 * Même contrat, réécrit ici sans la dépendance :
 *   - le réseau répond avant le délai → sa réponse (mise en cache si valide) ;
 *   - le délai expire → la copie en cache si elle existe ; SINON on continue d'attendre le
 *     réseau (une page qui arrive tard vaut mieux qu'une page vide) ;
 *   - le réseau échoue → la copie en cache, puis le repli (\`offline.html\` pour le HTML).
 * La réponse réseau arrivée après le délai met quand même le cache à jour : \`waitUntil\`
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

/** Copie plus vieille que la durée de vie du cache d'images (en-tête \`Date\` de la réponse). */
function isExpiredImage(response) {
  const headers = response && response.headers;
  if (!headers || typeof headers.get !== 'function') return false;
  const date = Date.parse(String(headers.get('Date') || ''));
  return Number.isFinite(date) && Date.now() - date > IMAGE_CACHE_MAX_AGE_MS;
}

/** Retire les entrées les plus anciennes au-delà de la borne (\`keys()\` suit l'ordre d'ajout). */
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
${outboxSync ? renderOutboxSync() : ''}`;
}

/**
 * Rejeu en arrière-plan des écritures gardées hors ligne (Background Sync, Chromium/Android ;
 * https://developer.mozilla.org/docs/Web/API/Background_Synchronization_API). Même contrat que
 * le module `workbox-background-sync` de Workbox (Google, licence MIT ;
 * https://developer.chrome.com/docs/workbox/modules/workbox-background-sync), réécrit ici sans
 * la dépendance : la page dépose dans IndexedDB une copie prête à envoyer de chaque écriture
 * en attente (`src/services/offlineOutboxMirror.js`), le service worker la rejoue quand le
 * navigateur signale le retour du réseau — même application fermée.
 *
 * Règles, identiques à celles des files de la page (`src/utils/offlineActionQueue.js`) :
 * succès ou refus définitif → la copie sort ; réseau absent, 5xx, 401, 408, 429 → elle reste
 * et le navigateur réessaiera. La copie ne décide de rien : la page rejoue ensuite sa propre
 * file, et le serveur, qui reconnaît chaque écriture à sa clé `client_uuid`, ne la compte
 * qu'une fois — c'est la page qui garde un texte refusé et prévient l'élève.
 */
function renderOutboxSync() {
  return `
const OFFLINE_DB_NAME = ${JSON.stringify(OFFLINE_DB_NAME)};
const OFFLINE_DB_VERSION = ${OFFLINE_DB_VERSION};
const OFFLINE_DB_STORES = ${JSON.stringify(OFFLINE_DB_STORES)};
const OUTBOX_SYNC_TAG = ${JSON.stringify(OUTBOX_SYNC_TAG)};
const OUTBOX_REPLAYED_MESSAGE = ${JSON.stringify(OUTBOX_REPLAYED_MESSAGE)};
const OUTBOX_RETRYABLE_STATUSES = [401, 408, 429];

function openOfflineDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_DB_STORES.photos)) {
        db.createObjectStore(OFFLINE_DB_STORES.photos, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(OFFLINE_DB_STORES.outbox)) {
        db.createObjectStore(OFFLINE_DB_STORES.outbox, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readOutboxEntries(db) {
  return new Promise((resolve, reject) => {
    const req = db.transaction(OFFLINE_DB_STORES.outbox, 'readonly').objectStore(OFFLINE_DB_STORES.outbox).getAll();
    req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
    req.onerror = () => reject(req.error);
  });
}

function deleteOutboxEntry(db, id) {
  return new Promise((resolve) => {
    const tx = db.transaction(OFFLINE_DB_STORES.outbox, 'readwrite');
    tx.objectStore(OFFLINE_DB_STORES.outbox).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function replayOutbox() {
  if (typeof indexedDB === 'undefined') return;
  const db = await openOfflineDb();
  let sent = 0;
  let retryLater = false;
  try {
    const entries = (await readOutboxEntries(db)).sort(
      (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || (Number(a.queued_at) || 0) - (Number(b.queued_at) || 0),
    );
    for (const entry of entries) {
      if (!entry || !entry.url || !entry.token) continue;
      let res;
      try {
        res = await fetch(entry.url, {
          method: entry.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: 'Bearer ' + entry.token,
            'X-Foretmap-Queued-At': String(Number(entry.queued_at) || ''),
            'X-Foretmap-Replay': 'background-sync',
          },
          body: entry.body,
          credentials: 'same-origin',
        });
      } catch (_) {
        retryLater = true;
        break;
      }
      if (res.ok) {
        sent += 1;
        await deleteOutboxEntry(db, entry.id);
        continue;
      }
      if (res.status >= 400 && res.status < 500 && !OUTBOX_RETRYABLE_STATUSES.includes(res.status)) {
        await deleteOutboxEntry(db, entry.id);
        continue;
      }
      retryLater = true;
      break;
    }
  } finally {
    db.close();
  }
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const page of pages) page.postMessage({ type: OUTBOX_REPLAYED_MESSAGE, sent });
  // Une promesse rejetée demande au navigateur de reprogrammer la synchronisation.
  if (retryLater) throw new Error('Rejeu des écritures hors ligne : nouvel essai plus tard');
}

self.addEventListener('sync', (event) => {
  if (event.tag === OUTBOX_SYNC_TAG) event.waitUntil(replayOutbox());
});
`;
}

/** Icônes candidates d'un produit, dans l'ordre de préférence des navigateurs. */
const ICON_CANDIDATES = Object.freeze([
  { file: 'pwa-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { file: 'pwa-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { file: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  { file: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
  { file: 'favicon-32.png', sizes: '32x32', type: 'image/png', purpose: 'any' },
  { file: 'favicon-16.png', sizes: '16x16', type: 'image/png', purpose: 'any' },
]);

/** Préfixe d'URL public des icônes d'un produit : `/` (racine) ou `/<assetsDir>/`. */
function iconUrlPrefix(product) {
  const dir = String(product?.assetsDir || '').replace(/^\/+|\/+$/g, '');
  return dir ? `/${dir}/` : '/';
}

/**
 * Icônes du manifest d'un produit, limitées à celles présentes sur disque.
 * @param {{ assetsDir?: string }} product
 * @param {{ exists: (relativePath: string) => boolean }} options `exists` reçoit le chemin relatif au dossier statique (ex. `gl/favicon-32.png`).
 */
function listProductIcons(product, { exists }) {
  const prefix = iconUrlPrefix(product);
  return ICON_CANDIDATES.filter((icon) => exists(`${prefix}${icon.file}`.slice(1))).map((icon) => ({
    src: `${prefix}${icon.file}`,
    sizes: icon.sizes,
    type: icon.type,
    purpose: icon.purpose,
  }));
}

/**
 * Manifest PWA (objet JSON) d'un produit du registre `lib/products.js`.
 * @param {{ id: string, assetsDir?: string, pwa: { name: string, shortName: string, description: string, themeColor: string, backgroundColor: string, startUrl: string } }} product
 * @param {{ icons?: Array<{ src: string, sizes: string, type: string, purpose?: string }>, extra?: object }} [options]
 *   `icons` : liste explicite (sinon les six candidates du dossier d'assets, sans vérification) ;
 *   `extra` : champs supplémentaires (raccourcis, captures…) ajoutés sans écraser ceux calculés.
 */
function renderWebManifest(product, { icons, extra } = {}) {
  if (!product || typeof product !== 'object' || !product.pwa) {
    throw new TypeError('renderWebManifest : définition de produit (avec `pwa`) requise');
  }
  const { pwa } = product;
  const iconList = Array.isArray(icons) ? icons : listProductIcons(product, { exists: () => true });
  const base = {
    name: pwa.name,
    short_name: pwa.shortName,
    description: pwa.description,
    start_url: pwa.startUrl || '/',
    scope: '/',
    display: 'standalone',
    lang: 'fr',
    background_color: pwa.backgroundColor,
    theme_color: pwa.themeColor,
    icons: iconList,
  };
  const additions = extra && typeof extra === 'object' ? extra : {};
  const merged = { ...base };
  for (const [key, value] of Object.entries(additions)) {
    if (!(key in merged)) merged[key] = value;
  }
  return merged;
}

module.exports = {
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  OFFLINE_DB_STORES,
  OUTBOX_SYNC_TAG,
  OUTBOX_REPLAYED_MESSAGE,
  DEFAULT_NETWORK_TIMEOUT_SECONDS,
  IMAGE_CACHE_MAX_ENTRIES,
  IMAGE_CACHE_MAX_AGE_MS,
  ICON_CANDIDATES,
  renderServiceWorker,
  renderWebManifest,
  listProductIcons,
  iconUrlPrefix,
};
