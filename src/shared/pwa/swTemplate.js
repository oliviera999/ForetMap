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
 *   - images, icônes et fontes en cache-first ;
 *   - message `SKIP_WAITING`, purge des anciens caches à l'activation.
 * Toute évolution de stratégie se fait ICI, puis `npm run build` régénère `dist/sw-<produit>.js`.
 */

/**
 * Délai d'attente du réseau des lectures network-first (HTML et API mises en cache), en
 * secondes. Sur le terrain, un réseau « présent mais inutilisable » (une barre, Wi-Fi saturé
 * d'une classe entière) ne rejette jamais la requête : sans délai, l'élève attendait jusqu'à
 * l'abandon du navigateur, une minute et plus, alors qu'une copie était en cache (audit du
 * 25/09/2026, § 1.4.6 et § 2.4).
 */
const DEFAULT_NETWORK_TIMEOUT_SECONDS = 4;

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
  offlinePath = '/offline.html',
  networkTimeoutSeconds = DEFAULT_NETWORK_TIMEOUT_SECONDS,
}) {
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

// Délai d'attente du réseau des lectures network-first (HTML, API), en millisecondes ;
// 0 = pas de délai. Au-delà, la copie en cache part si elle existe.
const NETWORK_TIMEOUT_MS = ${networkTimeoutMs};

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

/** Retire une entrée du cache (révocation) — sans bruit si elle n'y était pas. */
function evictFromCache(request) {
  return caches.open(CACHE_NAME).then((cache) => cache.delete(cacheKeyFor(request))).catch(() => undefined);
}

function putInCache(request, response) {
  // Seules les réponses valides sont mémorisées. Auparavant une 401 ou une 500 devenait la
  // réponse servie hors ligne : l'erreur d'un instant se figeait pour la durée du cache.
  const key = cacheKeyFor(request);
  if (response && response.ok) {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(key, clone));
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
    caches.match(key).then((cached) => cached || (fallback ? fallback() : undefined)),
  );
  if (timeoutMs <= 0) return networkOrCache;
  let timer = null;
  const cacheAfterTimeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      caches.match(key).then(resolve, () => resolve(undefined));
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
  DEFAULT_NETWORK_TIMEOUT_SECONDS,
  ICON_CANDIDATES,
  renderServiceWorker,
  renderWebManifest,
  listProductIcons,
  iconUrlPrefix,
};
