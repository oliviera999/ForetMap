'use strict';

/**
 * Routes PWA servies SELON LE PRODUIT résolu par le host (`lib/productResolver.js`) :
 *   - `GET /sw.js` : service worker, toujours en `no-store` + `Service-Worker-Allowed: /` ;
 *   - `GET /manifest.json` : manifest, `application/manifest+json`, cache public 24 h.
 *
 * Choix du fichier (docs/AUDIT_PLAN_LYAUTEY_2026-09.md §8.8) :
 *   - production (`serveDist`) : `dist/<swFile>` / `dist/<manifestFile>` générés par
 *     `scripts/build-pwa.js` ; s'ils manquent, repli sur `staticRoot/sw.js` /
 *     `staticRoot/manifest.json` pour le produit par défaut (ForetMap) seulement, 404 sinon ;
 *   - hors production : `public/sw.js` et `public/manifest.json` (écrits à la main) pour
 *     ForetMap ; pour les autres produits, manifest généré à la volée depuis le registre
 *     (pour que `plan.html`/`gl.html` en dev aient un manifest) et 404 pour le SW.
 *
 * Branchement dans `server.js` (à la place des deux `app.get` historiques, AVANT
 * `express.static`) :
 *   registerPwaRoutes(app, { staticRoot, distDir, serveDist, resolveProductFromRequest,
 *     getProduct, logger });
 */

const fs = require('fs');
const path = require('path');

const { DEFAULT_PRODUCT_ID, getProduct: getProductFromRegistry } = require('./products');

const SW_CACHE_CONTROL = 'no-store, no-cache, must-revalidate, proxy-revalidate';
const MANIFEST_CACHE_CONTROL = 'public, max-age=86400';
const MANIFEST_CONTENT_TYPE = 'application/manifest+json';

function fileExists(filePath) {
  try {
    return Boolean(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function setServiceWorkerHeaders(res) {
  res.setHeader('Cache-Control', SW_CACHE_CONTROL);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Service-Worker-Allowed', '/');
}

function setManifestHeaders(res) {
  res.setHeader('Content-Type', MANIFEST_CONTENT_TYPE);
  res.setHeader('Cache-Control', MANIFEST_CACHE_CONTROL);
}

/**
 * Chargement paresseux du gabarit (hors production seulement) : un déploiement « runtime »
 * sans dossier `src/` ne doit jamais en dépendre.
 */
function loadManifestRenderer() {
  try {
    const template = require('../src/shared/pwa/swTemplate');
    return {
      renderWebManifest: template.renderWebManifest,
      listProductIcons: template.listProductIcons,
    };
  } catch {
    return null;
  }
}

/**
 * Résout le fichier à servir pour un produit.
 * @returns {{ kind: 'file', path: string } | { kind: 'generate' } | { kind: 'none' }}
 */
function resolvePwaFile({ product, serveDist, distDir, staticRoot, distFileName, staticFileName }) {
  if (serveDist) {
    const generated = path.join(distDir, distFileName);
    if (fileExists(generated)) return { kind: 'file', path: generated };
    if (product.id === DEFAULT_PRODUCT_ID) {
      const legacy = path.join(staticRoot, staticFileName);
      if (fileExists(legacy)) return { kind: 'file', path: legacy };
    }
    return { kind: 'none' };
  }
  if (product.id === DEFAULT_PRODUCT_ID) {
    const handWritten = path.join(staticRoot, staticFileName);
    return fileExists(handWritten) ? { kind: 'file', path: handWritten } : { kind: 'none' };
  }
  return { kind: 'generate' };
}

/**
 * Monte `GET /sw.js` et `GET /manifest.json`.
 * @param {import('express').Express} app
 * @param {object} options
 * @param {string} options.staticRoot Dossier statique servi (`dist/` en prod, `public/` sinon).
 * @param {string} options.distDir Dossier `dist/` (fichiers générés par `scripts/build-pwa.js`).
 * @param {boolean} options.serveDist Vrai en production quand `dist/` est servi.
 * @param {(req: import('express').Request) => string} options.resolveProductFromRequest Produit résolu (host / header).
 * @param {(id: string) => object} [options.getProduct] Accès au registre (défaut `lib/products.js`).
 * @param {{ warn?: Function, error?: Function }} [options.logger]
 */
function registerPwaRoutes(
  app,
  { staticRoot, distDir, serveDist, resolveProductFromRequest, getProduct, logger } = {},
) {
  if (!app || typeof app.get !== 'function') throw new TypeError('registerPwaRoutes : app requis');
  if (typeof resolveProductFromRequest !== 'function') {
    throw new TypeError('registerPwaRoutes : resolveProductFromRequest requis');
  }
  const resolveProduct = typeof getProduct === 'function' ? getProduct : getProductFromRegistry;
  const root = String(staticRoot || '');
  const dist = String(distDir || root);
  const log = logger || {};
  const warn = typeof log.warn === 'function' ? log.warn.bind(log) : () => {};

  app.get('/sw.js', (req, res) => {
    const product = resolveProduct(resolveProductFromRequest(req));
    const resolved = resolvePwaFile({
      product,
      serveDist: Boolean(serveDist),
      distDir: dist,
      staticRoot: root,
      distFileName: product.swFile,
      staticFileName: 'sw.js',
    });
    setServiceWorkerHeaders(res);
    if (resolved.kind !== 'file') {
      // Hors production, seul ForetMap a un SW écrit à la main ; en prod un fichier manquant
      // signale un build incomplet (scripts/build-pwa.js non exécuté).
      if (serveDist)
        warn(
          { product: product.id, file: product.swFile },
          'Service worker généré absent de dist/',
        );
      return res.status(404).json({ error: 'Service worker indisponible pour ce produit' });
    }
    res.type('application/javascript');
    return res.sendFile(resolved.path);
  });

  app.get('/manifest.json', (req, res) => {
    const product = resolveProduct(resolveProductFromRequest(req));
    const resolved = resolvePwaFile({
      product,
      serveDist: Boolean(serveDist),
      distDir: dist,
      staticRoot: root,
      distFileName: product.manifestFile,
      staticFileName: 'manifest.json',
    });
    setManifestHeaders(res);
    if (resolved.kind === 'file') return res.sendFile(resolved.path);
    if (resolved.kind === 'generate') {
      const renderer = loadManifestRenderer();
      if (renderer) {
        const icons = renderer.listProductIcons(product, {
          exists: (relativePath) => fileExists(path.join(root, relativePath)),
        });
        return res.send(JSON.stringify(renderer.renderWebManifest(product, { icons }), null, 2));
      }
    }
    if (serveDist)
      warn({ product: product.id, file: product.manifestFile }, 'Manifest généré absent de dist/');
    return res.status(404).json({ error: 'Manifest indisponible pour ce produit' });
  });
}

module.exports = {
  registerPwaRoutes,
  resolvePwaFile,
  SW_CACHE_CONTROL,
  MANIFEST_CACHE_CONTROL,
  MANIFEST_CONTENT_TYPE,
};
