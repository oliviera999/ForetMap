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
 *   - `/assets/*` (bundles hachés par Vite, immuables) en cache-first — remplace le
 *     network-first historique sur JS/CSS, devenu inutile puisque le nom change à chaque build ;
 *   - JS/CSS hors `/assets/` (non hachés) en network-first, comme avant ;
 *   - images, icônes et fontes en cache-first ;
 *   - message `SKIP_WAITING`, purge des anciens caches à l'activation.
 * Toute évolution de stratégie se fait ICI, puis `npm run build` régénère `dist/sw-<produit>.js`.
 */

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
}) {
  if (!product || typeof product !== 'string') throw new TypeError('product requis');
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
  ICON_CANDIDATES,
  renderServiceWorker,
  renderWebManifest,
  listProductIcons,
  iconUrlPrefix,
};
