#!/usr/bin/env node
/**
 * Génère, après `vite build`, un service worker et un manifest PWA PAR PRODUIT du registre
 * (`lib/products.js`) à partir du gabarit `src/shared/pwa/swTemplate.js` et du manifeste
 * Rollup `dist/.vite/manifest.json` (`build.manifest: true` dans vite.config.js) :
 *   - `dist/<swFile>` (ex. `sw-foret.js`) : précache = fichiers statiques du produit + bundles
 *     JS/CSS hachés de SON entrée HTML (imports statiques uniquement, pas les chunks
 *     dynamiques) ; nom de cache `foretmap-<produit>-<hash>` recalculé à chaque build ;
 *   - `dist/<manifestFile>` (ex. `manifest-foret.webmanifest`) ;
 *   - `dist/sw.js` et `dist/manifest.json` : copies ForetMap (compatibilité des précaches
 *     historiques et des liens `<link rel="manifest" href="/manifest.json">`).
 * `/sw.js` et `/manifest.json` sont ensuite servis selon le host par `lib/pwaRoutes.js`.
 *
 * Usage : node scripts/build-pwa.js   (enchaîné par scripts/build-safe.js après le build Vite)
 * Le module exporte ses fonctions pour tests/build-pwa.test.js (génération en mémoire).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { PRODUCTS, PRODUCT_IDS, DEFAULT_PRODUCT_ID } = require('../lib/products');
const {
  renderServiceWorker,
  renderWebManifest,
  listProductIcons,
  iconUrlPrefix,
  ICON_CANDIDATES,
} = require('../src/shared/pwa/swTemplate');

const TAG = '[build-pwa]';
const OFFLINE_PATH = '/offline.html';

/**
 * Précache statique ForetMap : reprise à l'identique de `STATIC_ASSETS` de `public/sw.js`
 * (tests/build-pwa.test.js vérifie que les deux listes restent alignées).
 */
const FORET_STATIC_ASSETS = Object.freeze([
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
]);

/**
 * Profil hors ligne par produit : fichiers statiques précachés (hors bundles, hors HTML
 * d'entrée ajoutés automatiquement) et listes d'API.
 *
 * Lot 8 du plan de convergence (audit plan §8.8) : le **plan** et **G&L** branchent leurs
 * lectures. `stale-while-revalidate` pour ce qui doit rester consultable sans réseau et ne
 * change que rarement (la charge du plan, les contenus G&L) ; `network-first` pour ce qui doit
 * être frais dès qu'il y a du réseau. Les écritures ne sont jamais mises en cache.
 */
const PWA_PROFILES = Object.freeze({
  foret: Object.freeze({
    staticPrecache: FORET_STATIC_ASSETS,
    apiStaleWhileRevalidate: Object.freeze(['/api/maps', '/api/visit/content']),
    apiNetworkFirst: Object.freeze(['/api/zones', '/api/plants', '/api/map/markers', '/api/tasks']),
  }),
  gl: Object.freeze({
    staticPrecache: Object.freeze(['/gl/favicon.svg', '/gl/logo.png']),
    // Contenus éditoriaux du jeu : consultables sans réseau, rafraîchis en arrière-plan.
    apiStaleWhileRevalidate: Object.freeze([
      '/api/gl/content/help',
      '/api/gl/content/narrator',
      '/api/gl/content/pages',
      '/api/gl/settings/public',
    ]),
    // État de partie : toujours le réseau d'abord, le cache n'est qu'un filet.
    apiNetworkFirst: Object.freeze(['/api/gl/chapters', '/api/gl/maps']),
  }),
  plan: Object.freeze({
    // Toutes les icônes candidates du dossier `/plan/` + favicons (celles présentes seulement).
    staticPrecache: Object.freeze([
      '/plan/favicon.ico',
      '/plan/favicon.svg',
      ...ICON_CANDIDATES.map((icon) => `/plan/${icon.file}`),
    ]),
    // La charge du plan est l'application : sans elle, il n'y a rien à afficher. Elle doit
    // donc rester disponible hors ligne, quitte à dater d'une visite précédente.
    // `/api/map-routes` n'y figure plus : le plan reçoit ses parcours dans
    // `/api/plan/content`, il n'a jamais appelé cette route (`docs/AUDIT_PARCOURS_2026-09.md`
    // §2.9 e). Une entrée d'allowlist qui ne sert rien finit par mentir sur ce qui est caché.
    apiStaleWhileRevalidate: Object.freeze(['/api/plan/content', '/api/plan/settings']),
    apiNetworkFirst: Object.freeze([]),
  }),
});

/** Entrées HTML servies en network-first pour un produit (`/`, `/index.html` pour ForetMap, entrée Vite). */
function htmlEntriesForProduct(product) {
  const entries = ['/', `/${product.htmlEntry}`];
  if (product.id === DEFAULT_PRODUCT_ID) entries.splice(1, 0, '/index.html');
  return entries;
}

/**
 * Fichiers (JS + CSS) d'une entrée du manifeste Vite, imports statiques suivis récursivement,
 * chunks dynamiques ignorés (chargés à la demande, mis en cache-first au premier accès).
 * @param {Record<string, { file: string, css?: string[], imports?: string[], dynamicImports?: string[] }>} viteManifest
 * @param {string} entryKey Clé du manifeste (ex. `gl.html`).
 * @returns {string[]} URLs absolues (`/assets/...`), sans doublon, entrée en premier.
 */
function collectEntryFiles(viteManifest, entryKey) {
  const manifest = viteManifest && typeof viteManifest === 'object' ? viteManifest : {};
  const entry = manifest[entryKey];
  if (!entry) return [];
  const seen = new Set();
  const files = [];
  const push = (file) => {
    if (!file) return;
    const url = `/${String(file).replace(/^\/+/, '')}`;
    if (seen.has(url)) return;
    seen.add(url);
    files.push(url);
  };
  const visited = new Set();
  const visit = (key) => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) return;
    push(chunk.file);
    for (const css of chunk.css || []) push(css);
    for (const imported of chunk.imports || []) visit(imported);
  };
  visit(entryKey);
  return files;
}

/** Hash court et stable d'une liste d'URL (invalide le cache dès qu'un bundle change). */
function precacheHash(product, precache) {
  return crypto
    .createHash('sha256')
    .update(`${product}\n${precache.join('\n')}`)
    .digest('hex')
    .slice(0, 8);
}

/**
 * Configuration complète (SW + manifest) d'un produit.
 * @param {import('../lib/products').ProductDefinition} product
 * @param {object} ctx
 * @param {object} ctx.viteManifest Manifeste Rollup.
 * @param {(relativePath: string) => boolean} ctx.exists Test d'existence d'un fichier statique (chemin relatif au dossier public).
 * @param {object} [ctx.foretManifestExtra] Champs supplémentaires du manifest ForetMap historique (raccourcis, captures…).
 */
function buildProductPwa(product, { viteManifest, exists, foretManifestExtra }) {
  const profile = PWA_PROFILES[product.id] || {
    staticPrecache: [],
    apiStaleWhileRevalidate: [],
    apiNetworkFirst: [],
  };
  const htmlEntries = htmlEntriesForProduct(product);
  const bundles = collectEntryFiles(viteManifest, product.htmlEntry);
  const staticPrecache = profile.staticPrecache.filter(
    (url) =>
      url === '/' || url === '/manifest.json' || url.endsWith('.html') || exists(url.slice(1)),
  );
  const precache = [
    ...new Set([...htmlEntries, OFFLINE_PATH, '/manifest.json', ...staticPrecache, ...bundles]),
  ];
  const cacheName = `foretmap-${product.id}-${precacheHash(product.id, precache)}`;
  const serviceWorker = renderServiceWorker({
    product: product.id,
    cacheName,
    precache,
    htmlEntries,
    apiStaleWhileRevalidate: [...profile.apiStaleWhileRevalidate],
    apiNetworkFirst: [...profile.apiNetworkFirst],
    offlinePath: OFFLINE_PATH,
  });
  const icons = listProductIcons(product, { exists });
  const manifest = renderWebManifest(product, {
    icons,
    extra: product.id === DEFAULT_PRODUCT_ID ? foretManifestExtra : undefined,
  });
  return { product, cacheName, precache, bundles, serviceWorker, manifest };
}

/** Lit un JSON si présent, sinon `null` (jamais d'exception : les extras sont optionnels). */
function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Génère tous les fichiers PWA dans `distDir`.
 * @param {object} [options]
 * @param {string} [options.distDir] Dossier de sortie (défaut `dist/`).
 * @param {string} [options.publicDir] Dossier statique source (défaut `public/`).
 * @param {object} [options.viteManifest] Manifeste Rollup déjà chargé (défaut : `distDir/.vite/manifest.json`).
 * @param {Record<string, object>} [options.products] Registre (défaut `lib/products.js`).
 * @param {(message: string) => void} [options.log]
 * @returns {{ written: string[], builds: Record<string, ReturnType<typeof buildProductPwa>> }}
 */
function buildPwa({
  distDir = path.resolve(__dirname, '..', 'dist'),
  publicDir = path.resolve(__dirname, '..', 'public'),
  viteManifest,
  products = PRODUCTS,
  log = () => {},
} = {}) {
  const manifestPath = path.join(distDir, '.vite', 'manifest.json');
  const loadedManifest = viteManifest || readJsonIfExists(manifestPath);
  if (!loadedManifest) {
    throw new Error(`${TAG} manifeste Vite introuvable : ${manifestPath} (build.manifest: true ?)`);
  }
  const exists = (relativePath) =>
    fs.existsSync(path.join(publicDir, relativePath)) ||
    fs.existsSync(path.join(distDir, relativePath));
  const foretManifestExtra = readJsonIfExists(path.join(publicDir, 'manifest.json')) || undefined;

  fs.mkdirSync(distDir, { recursive: true });
  const written = [];
  const builds = {};
  const write = (fileName, content) => {
    const target = path.join(distDir, fileName);
    fs.writeFileSync(target, content, 'utf8');
    written.push(target);
  };

  for (const id of Object.keys(products)) {
    const product = products[id];
    const built = buildProductPwa(product, {
      viteManifest: loadedManifest,
      exists,
      foretManifestExtra,
    });
    builds[id] = built;
    if (built.bundles.length === 0) {
      log(
        `${TAG} ${id} : aucune entrée « ${product.htmlEntry} » dans le manifeste Vite (précache statique seul).`,
      );
    }
    const manifestJson = `${JSON.stringify(built.manifest, null, 2)}\n`;
    write(product.swFile, built.serviceWorker);
    write(product.manifestFile, manifestJson);
    if (id === DEFAULT_PRODUCT_ID) {
      write('sw.js', built.serviceWorker);
      write('manifest.json', manifestJson);
    }
    log(
      `${TAG} ${id} : ${built.cacheName} (${built.precache.length} URL précachées, ${built.bundles.length} bundles)`,
    );
  }
  return { written, builds };
}

function main() {
  try {
    const { written } = buildPwa({ log: (message) => console.log(message) });
    console.log(`${TAG} ${written.length} fichier(s) écrit(s) dans dist/.`);
  } catch (error) {
    console.error(`${TAG} ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  FORET_STATIC_ASSETS,
  PWA_PROFILES,
  PRODUCT_IDS,
  OFFLINE_PATH,
  htmlEntriesForProduct,
  collectEntryFiles,
  precacheHash,
  buildProductPwa,
  buildPwa,
  iconUrlPrefix,
};
