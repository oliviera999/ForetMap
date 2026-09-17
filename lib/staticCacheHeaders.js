'use strict';

const path = require('path');

const { listHtmlEntryBasenames } = require('./products');

/** Entrées HTML de tous les produits (registre) + index historique + page d'aide : jamais en cache. */
const NO_STORE_HTML_BASENAMES = new Set([
  ...listHtmlEntryBasenames(),
  'index.html',
  'deploy-help.html',
]);
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/**
 * Polices (`dist/fonts/`) : 30 jours, SANS `immutable`.
 *
 * Le nom du fichier n'est pas haché (`noto-color-emoji.woff2`) et son contenu change à chaque
 * `npm run fonts:sync-noto-emoji` : `immutable` figerait la version chez les visiteurs pour un
 * an. Sans en-tête du tout — l'état d'avant ce lot — `express.static` répond `max-age=0` + ETag,
 * soit une revalidation réseau **à chaque chargement de page** pour 5,7 Mo, et un
 * re-téléchargement complet dès que le cache HTTP est purgé (Safari iOS le fait volontiers).
 * Le jour où le nom portera un hash, basculer sur `IMMUTABLE_CACHE_CONTROL`
 * (`docs/AUDIT_EMOJIS_APPLE_2026-09-17.md`, R6).
 */
const FONT_CACHE_CONTROL = 'public, max-age=2592000';

/**
 * Options d'express.static pour servir dist/ en production :
 * - HTML d'entrée : no-store (le SPA doit toujours récupérer les derniers hashes) ;
 * - dist/assets/* : les noms portent un hash Rollup, immuables par construction →
 *   cache long sans revalidation (JS/CSS/wasm, dont ~2×1,9 Mo de wasm Rive
 *   revalidés à chaque visite sinon) ;
 * - dist/fonts/* : cache long borné (cf. `FONT_CACHE_CONTROL`).
 */
function createDistStaticServeOptions(distDir) {
  const distAssetsDir = path.join(distDir, 'assets') + path.sep;
  const distFontsDir = path.join(distDir, 'fonts') + path.sep;
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
      } else if (filePath.startsWith(distFontsDir)) {
        res.setHeader('Cache-Control', FONT_CACHE_CONTROL);
      }
    },
  };
}

module.exports = { createDistStaticServeOptions, IMMUTABLE_CACHE_CONTROL, FONT_CACHE_CONTROL };
