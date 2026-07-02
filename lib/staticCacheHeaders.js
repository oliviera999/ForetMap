'use strict';

const path = require('path');

const NO_STORE_HTML_BASENAMES = new Set(['index.vite.html', 'index.html', 'deploy-help.html']);
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Options d'express.static pour servir dist/ en production :
 * - HTML d'entrée : no-store (le SPA doit toujours récupérer les derniers hashes) ;
 * - dist/assets/* : les noms portent un hash Rollup, immuables par construction →
 *   cache long sans revalidation (JS/CSS/wasm, dont ~2×1,9 Mo de wasm Rive
 *   revalidés à chaque visite sinon).
 */
function createDistStaticServeOptions(distDir) {
  const distAssetsDir = path.join(distDir, 'assets') + path.sep;
  return {
    index: false,
    setHeaders(res, filePath) {
      const base = path.basename(filePath);
      if (NO_STORE_HTML_BASENAMES.has(base)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (filePath.startsWith(distAssetsDir)) {
        res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
      }
    },
  };
}

module.exports = { createDistStaticServeOptions, IMMUTABLE_CACHE_CONTROL };
